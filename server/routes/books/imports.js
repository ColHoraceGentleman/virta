// Virta Books — Phase C: CSV/PDF import pipeline.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 (Sources, Pipeline, Mappings).
//
// Flow:
//   POST /api/v1/books/imports  (multipart .csv/.pdf, ≤5MB, ≤10k rows)
//     1. Sniff the buffer against each registered parser's detect().
//     2. If match: derive source_key + header_signature; look up a saved mapping
//        (or fall back to the parser's CANONICAL_MAPPING).
//     3. Apply mapping to produce canonical {txn_date, description, amount} rows.
//     4. Compute dedupe_hash for each row, check for existing duplicates.
//     5. Return { source_key, header_signature, suggested_mapping, applied_mapping,
//                  candidates: [{row, hash, dedupe_status}], unmapped_count }.
//     6. Insert only if `apply=true` query param.
//   POST /api/v1/books/imports/apply
//     Body: { account_id, rows: [{txn_date, description, amount, ...}] }
//     Inserts Transaction candidates with dedupe_hash, wrapped in a single transaction.

import { Router } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import Papa from 'papaparse';
import db from '../../db.js';
import { PARSERS, detectSource } from '../../parsers/index.js';
import { normalizeVendor } from '../../services/vendorNormalize.js';

const router = Router();

// Multer config — in-memory storage, 5MB cap, csv/pdf only.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/pdf' ||
      (file.originalname && /\.(csv|pdf)$/i.test(file.originalname));
    if (!ok) return cb(new Error('Only .csv and .pdf files are accepted'));
    cb(null, true);
  },
});

const MAX_ROWS = 10000;

// Compute a dedupe hash for a candidate transaction row.
// sha256(date + amount + description + account_id) — collisions are astronomically unlikely.
function computeDedupeHash(txn_date, amount, description, accountId) {
  return createHash('sha256')
    .update(`${txn_date}|${amount.toFixed(2)}|${description}|${accountId}`)
    .digest('hex');
}

// Compute header_signature — sha256 of sorted, joined, lowercase header names.
function headerSignature(headers) {
  const sig = headers.map(h => String(h || '').trim().toLowerCase()).sort().join('|');
  return createHash('sha256').update(sig).digest('hex');
}

// Apply a column mapping to a row of parsed CSV → canonical RawTransaction shape.
function applyMapping(row, mapping, signConvention) {
  const date = row[mapping.date_col];
  const description = row[mapping.description_col];
  const amountStr = row[mapping.amount_col];
  if (date === undefined || description === undefined || amountStr === undefined) {
    return null;
  }
  const amountCleaned = String(amountStr).replace(/[$,\s]/g, '');
  let amount = Number(amountCleaned);
  if (!Number.isFinite(amount)) return null;
  // Apply sign convention.
  if (signConvention === 'positive_outflow') {
    // Bank export convention: positive numbers mean money flowing OUT of the bank account.
    // In Virta Books convention, expenses are negative. Flip the sign.
    amount = -Math.abs(amount);
  }
  // For 'negative_outflow', keep as-is (Chase / AmEx / most CCs export expenses as negative).
  return { txn_date: String(date).trim(), description: String(description).trim(), amount };
}

// Find the column-mapping for a (source_key, header_signature) pair.
// Falls back to canonical mapping from the parser module.
function resolveMapping(sourceKey, headerSig, headers) {
  // Look up saved mapping.
  const saved = db.prepare(`
    SELECT * FROM csv_source_mappings WHERE source_key = ? AND header_signature = ?
  `).get(sourceKey, headerSig);

  if (saved) {
    // Bump last_used_at so the UI can sort by recency.
    db.prepare(`UPDATE csv_source_mappings SET last_used_at = datetime('now') WHERE id = ?`).run(saved.id);
    // Re-fetch so we have the freshly-updated last_used_at (and any other recently-touched fields).
    const refreshed = db.prepare(`SELECT * FROM csv_source_mappings WHERE id = ?`).get(saved.id);
    return {
      id: refreshed.id,
      source_key: refreshed.source_key,
      date_col: refreshed.date_col,
      description_col: refreshed.description_col,
      amount_col: refreshed.amount_col,
      amount_sign_convention: refreshed.amount_sign_convention,
      memorized_account_id: refreshed.memorized_account_id,
      last_used_at: refreshed.last_used_at,
      saved: true,
    };
  }

  // No saved mapping — try the parser's canonical mapping.
  const parser = PARSERS.find(p => p.CANONICAL_MAPPING?.source_key === sourceKey);
  if (parser && parser.CANONICAL_MAPPING) {
    const cm = parser.CANONICAL_MAPPING;
    return {
      source_key: cm.source_key,
      date_col: cm.date_col,
      description_col: cm.description_col,
      amount_col: cm.amount_col,
      amount_sign_convention: cm.amount_sign_convention,
      saved: false,
      suggested_account_code: cm.suggested_account_code,
    };
  }

  return null;
}

// POST /api/v1/books/imports  (multipart, file field name: 'file')
// Query: ?apply=true to actually insert transactions (preview otherwise).
// Body form-data: file (required), suggested_account_id (optional, picked from UI).
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded (field name: file)', code: 'VALIDATION_ERROR' });
    }
    const buffer = req.file.buffer;
    const text = buffer.toString('utf8');
    const filename = req.file.originalname || '';
    const mimeType = req.file.mimetype || '';
    const isPdf = /\.pdf$/i.test(filename) || mimeType === 'application/pdf';
    const apply = req.query.apply === 'true';
    const suggestedAccountId = req.body.suggested_account_id || null;

    if (isPdf) {
      // PDF support is a future extension point. Phase C supports the architecture but
      // no PDF parsers are shipped. Surface a friendly message.
      return res.status(415).json({
        error: "We don't have a parser for this PDF yet. Please export to CSV from your institution's website and re-upload.",
        code: 'PDF_NOT_SUPPORTED',
      });
    }

    // Run detector loop.
    const detection = detectSource(text, filename, mimeType);
    if (!detection) {
      // No parser matched. Treat as generic CSV — surface the headers so the UI can show
      // a column-mapping form.
      const parsed = Papa.parse(text, { skipEmptyLines: true });
      const headerRow = (parsed.data && parsed.data[0]) || [];
      const headers = headerRow.map(h => String(h || '').trim()).filter(Boolean);
      if (headers.length === 0) {
        return res.status(400).json({ error: 'CSV appears to be empty or unreadable', code: 'VALIDATION_ERROR' });
      }
      const sig = headerSignature(headers);
      // Look for any saved generic mapping for this header signature.
      const saved = db.prepare(`
        SELECT * FROM csv_source_mappings WHERE header_signature = ?
      `).get(sig);
      return res.json({
        source_key: 'generic',
        header_signature: sig,
        headers,
        suggested_mapping: saved ? {
          source_key: saved.source_key,
          date_col: saved.date_col,
          description_col: saved.description_col,
          amount_col: saved.amount_col,
          amount_sign_convention: saved.amount_sign_convention,
          memorized_account_id: saved.memorized_account_id,
          last_used_at: saved.last_used_at,
          saved: true,
        } : null,
        applied_mapping: null,
        candidates: [],
        unmapped_count: 0,
        needs_user_mapping: true,
      });
    }

    // Parse using the matched parser.
    const rawRows = detection.parser.parse(text);
    if (rawRows.length > MAX_ROWS) {
      return res.status(413).json({
        error: `Too many rows: ${rawRows.length}. Soft cap is ${MAX_ROWS}.`,
        code: 'TOO_MANY_ROWS',
      });
    }

    // Compute header signature from the parser's canonical columns (synthetic — only the
    // parser's expected columns are part of the signature for prebuilt sources).
    const cm = detection.parser.CANONICAL_MAPPING;
    const synthHeaders = [cm.date_col, cm.description_col, cm.amount_col].map(s => s.toLowerCase());
    const sig = headerSignature(synthHeaders);

    const resolved = resolveMapping(detection.source, sig, synthHeaders);
    if (!resolved) {
      return res.status(500).json({ error: 'Parser matched but no mapping could be resolved', code: 'MAPPING_MISSING' });
    }

    // If client passed a suggested_account_id, prefer that for the dedupe hash.
    // Otherwise, fall back to the source's suggested account (looked up by code).
    let accountId = suggestedAccountId;
    if (!accountId && resolved.suggested_account_code) {
      const acc = db.prepare('SELECT id FROM accounts WHERE code = ?').get(resolved.suggested_account_code);
      if (acc) accountId = acc.id;
    }
    if (!accountId) {
      // Generic import: caller must specify an account. Surface as unmapped.
      return res.json({
        source_key: detection.source,
        header_signature: sig,
        headers: synthHeaders,
        suggested_mapping: resolved,
        applied_mapping: null,
        candidates: [],
        unmapped_count: rawRows.length,
        needs_user_mapping: true,
        needs_account: true,
      });
    }

    // Build candidates with dedupe hash + status.
    const candidates = [];
    const existingHashes = new Set();
    {
      // Batch-fetch existing hashes for this account to avoid N queries.
      const existing = db.prepare(`
        SELECT dedupe_hash FROM transactions WHERE account_id = ?
      `).all(accountId);
      for (const r of existing) existingHashes.add(r.dedupe_hash);
    }

    for (const raw of rawRows) {
      const hash = computeDedupeHash(raw.txn_date, raw.amount, raw.description, accountId);
      const vendor = normalizeVendor(raw.description);
      candidates.push({
        row: { ...raw },
        hash,
        vendor_normalized: vendor,
        dedupe_status: existingHashes.has(hash) ? 'duplicate' : 'new',
      });
    }

    // After exact dedupe, check for near-duplicates (same vendor + amount + ±3 days).
    const enrichedCandidates = findNearDuplicates(candidates, accountId);

    if (!apply) {
      // Preview only — no inserts.
      return res.json({
        source_key: detection.source,
        header_signature: sig,
        headers: synthHeaders,
        suggested_mapping: resolved,
        applied_mapping: resolved,
        candidates: enrichedCandidates,
        unmapped_count: 0,
        needs_user_mapping: false,
        needs_account: false,
        account_id: accountId,
      });
    }

    // Apply — insert only NEW rows; duplicates are skipped. Near-duplicates are inserted
    // (the user has already seen the warning in the UI and chosen to import); we store
    // the near_duplicate_of pointer so the Categorization UI can resolve them later.
    const inserted = [];
    let duplicatesSkipped = 0;

    const tx = db.transaction(() => {
      const insertStmt = db.prepare(`
        INSERT INTO transactions
          (id, account_id, txn_date, description, amount, raw_source, raw_csv_row,
           dedupe_hash, vendor_normalized, near_duplicate_of, status)
        VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uncategorized')
      `);
      for (const c of enrichedCandidates) {
        if (c.dedupe_status === 'duplicate') {
          duplicatesSkipped++;
          continue;
        }
        insertStmt.run(
          accountId,
          c.row.txn_date,
          c.row.description,
          c.row.amount,
          detection.source,
          JSON.stringify(c.row),
          c.hash,
          c.vendor_normalized,
          c.near_duplicate_of || null,
        );
        // Re-fetch the inserted row by unique dedupe_hash to get the actual id SQLite assigned.
        const insertedRow = db.prepare(`SELECT id FROM transactions WHERE dedupe_hash = ?`).get(c.hash);
        const insertedId = insertedRow ? insertedRow.id : null;
        inserted.push({ id: insertedId, dedupe_hash: c.hash, vendor_normalized: c.vendor_normalized });
      }
    });
    tx();

    // Try to apply vendor rules to the freshly-inserted uncategorized rows.
    applyVendorRulesToNewTransactions(inserted.map(i => i.id));

    res.json({
      source_key: detection.source,
      header_signature: sig,
      inserted: inserted.length,
      duplicates_skipped: duplicatesSkipped,
      candidates: candidates.length,
      unmapped_count: 0,
      account_id: accountId,
    });
  } catch (err) {
    console.error('[Books/Imports] failed', err);
    if (err.message && err.message.includes('Only .csv and .pdf')) {
      return res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
    }
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/imports/apply  (manual column mapping path)
// Body: { account_id, header_signature, mapping: {date_col, description_col, amount_col,
//          amount_sign_convention}, file_text } OR { account_id, rows: [...]}.
//
// Used when the user adjusted the suggested mapping in the UI. Accepts either the raw CSV
// text (re-parsed on the server) or pre-computed canonical rows.
router.post('/apply', async (req, res) => {
  try {
    const body = req.body || {};
    const accountId = body.account_id;
    if (!accountId) {
      return res.status(400).json({ error: 'account_id is required', code: 'VALIDATION_ERROR' });
    }
    // Validate the target account exists.
    const account = db.prepare('SELECT id, code, account_type FROM accounts WHERE id = ?').get(accountId);
    if (!account) return res.status(404).json({ error: 'Source account not found', code: 'NOT_FOUND' });
    // Source accounts can be asset (bank) or liability (CC). Both can be the source of
    // money flowing out: bank decreases, CC increases the liability balance.
    if (account.account_type !== 'asset' && account.account_type !== 'liability') {
      return res.status(400).json({
        error: 'Source account must be an asset (bank/PayPal/Venmo) or liability (credit card)',
        code: 'INVALID_ACCOUNT_TYPE',
      });
    }

    let rawRows = [];
    if (Array.isArray(body.rows) && body.rows.length > 0) {
      rawRows = body.rows;
    } else if (typeof body.file_text === 'string' && body.mapping) {
      const parsed = Papa.parse(body.file_text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => String(h || '').trim(),
      });
      const sign = body.mapping.amount_sign_convention || 'negative_outflow';
      for (const row of parsed.data || []) {
        const mapped = applyMapping(row, body.mapping, sign);
        if (mapped) rawRows.push(mapped);
      }
    } else {
      return res.status(400).json({
        error: 'Either rows[] or {file_text, mapping} is required',
        code: 'VALIDATION_ERROR',
      });
    }

    if (rawRows.length > MAX_ROWS) {
      return res.status(413).json({ error: `Too many rows: ${rawRows.length}`, code: 'TOO_MANY_ROWS' });
    }

    // Optional: persist the mapping if the user provided save_mapping + a source_key.
    if (body.save_mapping && body.source_key && body.mapping && body.header_signature) {
      upsertSourceMapping({
        source_key: body.source_key,
        header_signature: body.header_signature,
        date_col: body.mapping.date_col,
        description_col: body.mapping.description_col,
        amount_col: body.mapping.amount_col,
        amount_sign_convention: body.mapping.amount_sign_convention || 'negative_outflow',
        memorized_account_id: accountId,
      });
    }

    // Build candidates with dedupe hash + status.
    const candidates = [];
    const existingHashes = new Set(
      db.prepare(`SELECT dedupe_hash FROM transactions WHERE account_id = ?`).all(accountId)
        .map(r => r.dedupe_hash)
    );
    for (const raw of rawRows) {
      const hash = computeDedupeHash(raw.txn_date, raw.amount, raw.description, accountId);
      const vendor = normalizeVendor(raw.description);
      candidates.push({
        row: { ...raw },
        hash,
        vendor_normalized: vendor,
        dedupe_status: existingHashes.has(hash) ? 'duplicate' : 'new',
      });
    }

    // After exact dedupe, check for near-duplicates (same vendor + amount + ±3 days).
    const enrichedCandidates = findNearDuplicates(candidates, accountId);

    // Insert new rows.
    const inserted = [];
    let duplicatesSkipped = 0;
    const tx = db.transaction(() => {
      const insertStmt = db.prepare(`
        INSERT INTO transactions
          (id, account_id, txn_date, description, amount, raw_source, raw_csv_row,
           dedupe_hash, vendor_normalized, near_duplicate_of, status)
        VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uncategorized')
      `);
      for (const c of enrichedCandidates) {
        if (c.dedupe_status === 'duplicate') { duplicatesSkipped++; continue; }
        insertStmt.run(
          accountId,
          c.row.txn_date,
          c.row.description,
          c.row.amount,
          body.source_key || 'generic',
          JSON.stringify(c.row),
          c.hash,
          c.vendor_normalized,
          c.near_duplicate_of || null,
        );
        // Re-fetch by unique dedupe_hash to get the actual id SQLite assigned.
        const insertedRow = db.prepare(`SELECT id FROM transactions WHERE dedupe_hash = ?`).get(c.hash);
        const insertedId = insertedRow ? insertedRow.id : null;
        inserted.push({ id: insertedId, dedupe_hash: c.hash, vendor_normalized: c.vendor_normalized });
      }
    });
    tx();

    applyVendorRulesToNewTransactions(inserted.map(i => i.id));

    res.json({
      inserted_count: inserted.length,
      duplicates_skipped: duplicatesSkipped,
      candidates: candidates.length,
      account_id: accountId,
    });
  } catch (err) {
    console.error('[Books/Imports/Apply] failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/imports/save-mapping
// Body: { source_key, header_signature, mapping: {date_col, description_col, amount_col,
//          amount_sign_convention}, memorized_account_id? }
router.post('/save-mapping', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.source_key || !body.header_signature || !body.mapping) {
      return res.status(400).json({
        error: 'source_key, header_signature, and mapping are required',
        code: 'VALIDATION_ERROR',
      });
    }
    const m = upsertSourceMapping({
      source_key: body.source_key,
      header_signature: body.header_signature,
      date_col: body.mapping.date_col,
      description_col: body.mapping.description_col,
      amount_col: body.mapping.amount_col,
      amount_sign_convention: body.mapping.amount_sign_convention || 'negative_outflow',
      memorized_account_id: body.memorized_account_id || null,
    });
    res.json({ data: m });
  } catch (err) {
    console.error('[Books/Imports/SaveMapping] failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// Find near-duplicates for a list of candidates — same vendor_normalized + same amount
// (to 2dp) + txn_date within ±3 days on the same account. Used after exact dedupe so
// we don't duplicate work for already-skipped rows. Returns enriched candidate objects.
// near_duplicate_of is null when no match is found; otherwise it points at the existing
// transaction row that this candidate looks similar to. The user resolves via the UI
// (POST /transactions/:id/resolve-duplicate).
function findNearDuplicates(candidates, accountId) {
  const NEAR_DUP_DAYS = 3;
  const out = [];
  for (const c of candidates) {
    if (c.dedupe_status === 'duplicate') { out.push(c); continue; }
    if (!c.vendor_normalized) { out.push({ ...c, near_duplicate_of: null, near_duplicate_info: null }); continue; }
    // Round amount to 2dp at the SQL level for reliable comparison.
    const absAmount = Math.abs(Number(c.row.amount));
    const existing = db.prepare(`
      SELECT id, txn_date, description, amount
      FROM transactions
      WHERE account_id = ?
        AND vendor_normalized = ?
        AND ROUND(ABS(amount), 2) = ROUND(?, 2)
        AND ABS(JULIANDAY(txn_date) - JULIANDAY(?)) <= ?
      LIMIT 1
    `).get(accountId, c.vendor_normalized, absAmount, c.row.txn_date, NEAR_DUP_DAYS);
    if (existing) {
      const daysApart = Math.round(
        Math.abs((new Date(c.row.txn_date) - new Date(existing.txn_date)) / 86400000)
      );
      out.push({
        ...c,
        near_duplicate_of: existing.id,
        near_duplicate_info: {
          id: existing.id,
          txn_date: existing.txn_date,
          description: existing.description,
          amount: existing.amount,
          days_apart: daysApart,
        },
      });
    } else {
      out.push({ ...c, near_duplicate_of: null, near_duplicate_info: null });
    }
  }
  return out;
}

// Helper: create-or-update a CSV source mapping.
function upsertSourceMapping({ source_key, header_signature, date_col, description_col, amount_col, amount_sign_convention, memorized_account_id }) {
  const existing = db.prepare(`
    SELECT id FROM csv_source_mappings WHERE source_key = ? AND header_signature = ?
  `).get(source_key, header_signature);
  if (existing) {
    db.prepare(`
      UPDATE csv_source_mappings
      SET date_col = ?, description_col = ?, amount_col = ?, amount_sign_convention = ?,
          memorized_account_id = COALESCE(?, memorized_account_id),
          last_used_at = datetime('now')
      WHERE id = ?
    `).run(date_col, description_col, amount_col, amount_sign_convention, memorized_account_id, existing.id);
    return db.prepare('SELECT * FROM csv_source_mappings WHERE id = ?').get(existing.id);
  }
  const id = db.prepare(`SELECT lower(hex(randomblob(16))) AS id`).get().id;
  db.prepare(`
    INSERT INTO csv_source_mappings
      (id, source_key, header_signature, date_col, description_col, amount_col,
       amount_sign_convention, memorized_account_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, source_key, header_signature, date_col, description_col, amount_col,
         amount_sign_convention, memorized_account_id);
  return db.prepare('SELECT * FROM csv_source_mappings WHERE id = ?').get(id);
}

// Apply vendor rules to a set of newly-inserted transaction IDs.
// Returns the count of rows that got auto-categorized.
function applyVendorRulesToNewTransactions(transactionIds) {
  if (!Array.isArray(transactionIds) || transactionIds.length === 0) return 0;
  const rules = db.prepare(`SELECT * FROM vendor_rules WHERE is_active = 1`).all();
  if (rules.length === 0) return 0;

  let autoCategorized = 0;
  const placeholders = transactionIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT id, vendor_normalized, status, category_account_id, txn_date, description, amount, account_id
    FROM transactions WHERE id IN (${placeholders}) AND status = 'uncategorized'
  `).all(...transactionIds);

  const tx = db.transaction(() => {
    for (const row of rows) {
      if (!row.vendor_normalized) continue;
      const matchingRule = rules.find(r => row.vendor_normalized.includes(r.vendor_pattern.toLowerCase()));
      if (matchingRule) {
        // Categorize + create journal entry.
        categorizeTransaction(row.id, matchingRule.category_account_id, /*silent=*/true);
        autoCategorized++;
      }
    }
  });
  tx();
  return autoCategorized;
}

// Helper: set category + create journal entry in a single transaction.
// Used by both the import pipeline (auto-categorize via vendor rules) and the
// categorization UI (PATCH /transactions/:id). Encapsulates the §5 side-effect.
function categorizeTransaction(transactionId, categoryAccountId, silent = false) {
  const txn = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(transactionId);
  if (!txn) throw new Error(`Transaction ${transactionId} not found`);
  const sourceAccountId = txn.account_id; // asset account (bank / CC / PayPal / Venmo)
  const txnDate = txn.txn_date;
  const description = txn.description;
  const amount = Number(txn.amount);
  const absAmount = Math.abs(amount);

  // Guard: if a journal entry already exists for this transaction, just update the
  // transaction row — do NOT create a duplicate journal entry. Belt-and-suspenders for
  // C-S3 (restore + re-categorize orphans) and any future path that reaches here with
  // an existing entry.
  const existingEntry = db.prepare(
    `SELECT id FROM journal_entries WHERE source = 'transaction_import' AND source_id = ?`
  ).get(transactionId);
  if (existingEntry) {
    db.prepare(`
      UPDATE transactions
      SET category_account_id = ?, status = 'categorized', updated_at = datetime('now')
      WHERE id = ?
    `).run(categoryAccountId, transactionId);
    return;
  }

  const tx = db.transaction(() => {
    // Update the transaction row.
    db.prepare(`
      UPDATE transactions
      SET category_account_id = ?, status = 'categorized', updated_at = datetime('now')
      WHERE id = ?
    `).run(categoryAccountId, transactionId);

    // Create journal entry.
    const entryId = db.prepare(`SELECT lower(hex(randomblob(16))) AS id`).get().id;
    db.prepare(`
      INSERT INTO journal_entries (id, txn_date, description, source, source_id)
      VALUES (?, ?, ?, 'transaction_import', ?)
    `).run(entryId, txnDate, description, transactionId);

    // Two lines: debit category (expense / income), credit source asset.
    // For negative amounts (expense): debit category, credit source.
    // For positive amounts (income): debit source, credit category.
    const insertLine = db.prepare(`
      INSERT INTO journal_lines (id, entry_id, account_id, debit, credit, position)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)
    `);
    if (amount < 0) {
      // Expense: debit category, credit source asset.
      insertLine.run(entryId, categoryAccountId, absAmount, 0, 0);
      insertLine.run(entryId, sourceAccountId, 0, absAmount, 1);
    } else {
      // Income: debit source asset, credit category income.
      insertLine.run(entryId, sourceAccountId, absAmount, 0, 0);
      insertLine.run(entryId, categoryAccountId, 0, absAmount, 1);
    }
  });
  tx();
  if (!silent) console.log(`[Books/Imports] categorized transaction ${transactionId} → ${categoryAccountId}`);
}

export default router;
export { categorizeTransaction, applyVendorRulesToNewTransactions, upsertSourceMapping, computeDedupeHash, findNearDuplicates };