// Virta Books — Phase C: Transactions CRUD + categorization side-effect.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 (DB) + §6 (Categorization Review UI).
//
// Side effect: when category_account_id is set, also create the journal entry
// (debit expense / credit source asset for negative amounts, debit source / credit
// income for positive amounts). See imports.js::categorizeTransaction.

import { Router } from 'express';
import db from '../../db.js';
import { categorizeTransaction } from './imports.js';
import { deleteTransaction } from '../../services/journalHelpers.js';
import { invalidateReconciliationOnMutation } from '../../services/reconciliation.js';

const router = Router();

// ALLOWED_PATCH_FIELDS — fields the UI can update on a transaction row.
// E.2 EXPANDS this to include 'amount' and 'txn_date' so the new in-line
// transaction editor can mutate those (which triggers the mutation hook).
const ALLOWED_PATCH_FIELDS = ['category_account_id', 'status', 'notes', 'vendor_normalized', 'amount', 'txn_date', 'description'];

// GET /api/v1/books/transactions/stats/vendor-manual-counts?vendor=...
// (Declared BEFORE /:id routes so it doesn't get matched as id='stats'.)
router.get('/stats/vendor-manual-counts', (req, res) => {
  try {
    const vendor = req.query.vendor;
    if (!vendor) return res.status(400).json({ error: 'vendor query param required', code: 'VALIDATION_ERROR' });
    const rows = db.prepare(`
      SELECT category_account_id, COUNT(*) AS count
      FROM transactions
      WHERE vendor_normalized = ? AND status = 'categorized' AND category_account_id IS NOT NULL
      GROUP BY category_account_id
      ORDER BY count DESC
    `).all(vendor);
    res.json({ data: rows });
  } catch (err) {
    console.error('[Books/Transactions] vendor-stats failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/transactions/bulk-categorize
// (Declared BEFORE /:id routes so 'bulk-categorize' isn't matched as id.)
// Body: { ids: [string], category_account_id: string }
// Applies the same category to many transactions; creates journal entries for each.
// Returns { updated: N, journal_entries_created: N }.
router.post('/bulk-categorize', (req, res) => {
  try {
    const body = req.body || {};
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const categoryId = body.category_account_id;
    if (ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required', code: 'VALIDATION_ERROR' });
    }
    if (!categoryId) {
      return res.status(400).json({ error: 'category_account_id is required', code: 'VALIDATION_ERROR' });
    }
    const cat = db.prepare(`SELECT id FROM accounts WHERE id = ?`).get(categoryId);
    if (!cat) return res.status(404).json({ error: 'Category account not found', code: 'NOT_FOUND' });

    let updated = 0;
    let journalCreated = 0;
    let skipped = 0;
    const tx = db.transaction(() => {
      for (const id of ids) {
        const existing = db.prepare(`SELECT id, status, category_account_id FROM transactions WHERE id = ?`).get(id);
        if (!existing) { skipped++; continue; }
        // Skip if already categorized to this category (idempotent).
        if (existing.status === 'categorized' && existing.category_account_id === categoryId) {
          skipped++;
          continue;
        }
        // No redundant outer UPDATE — categorizeTransaction owns the full write
        // (UPDATE + journal entry + 2 lines) inside its own savepoint.
        categorizeTransaction(id, categoryId, /*silent=*/true);
        updated++;
        journalCreated++;
      }
    });
    tx();

    res.json({ updated, journal_entries_created: journalCreated, skipped });
  } catch (err) {
    console.error('[Books/Transactions] bulk-categorize failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// GET /api/v1/books/transactions
// Query params: status (uncategorized|categorized|excluded), account_id, limit, offset
router.get('/', (req, res) => {
  try {
    const status = req.query.status;
    const accountId = req.query.account_id;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;

    const where = [];
    const params = [];
    if (status) { where.push('t.status = ?'); params.push(status); }
    if (accountId) { where.push('t.account_id = ?'); params.push(accountId); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const rows = db.prepare(`
      SELECT
        t.*,
        a.code AS account_code, a.name AS account_name,
        c.code AS category_code, c.name AS category_name
      FROM transactions t
      LEFT JOIN accounts a ON a.id = t.account_id
      LEFT JOIN accounts c ON c.id = t.category_account_id
      ${whereClause}
      ORDER BY t.txn_date DESC, t.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const count = db.prepare(`
      SELECT COUNT(*) AS c FROM transactions t ${whereClause}
    `).get(...params).c;

    // For each row with near_duplicate_of set, fetch the original's info for the UI banner.
    const nearDupIds = rows.filter(r => r.near_duplicate_of).map(r => r.near_duplicate_of);
    let nearDupMap = new Map();
    if (nearDupIds.length > 0) {
      const placeholders = nearDupIds.map(() => '?').join(',');
      const origs = db.prepare(`
        SELECT t.id, t.txn_date, t.description, t.amount, t.vendor_normalized,
               a.code AS account_code, a.name AS account_name
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.account_id
        WHERE t.id IN (${placeholders})
      `).all(...nearDupIds);
      for (const o of origs) {
        nearDupMap.set(o.id, o);
      }
    }
    const enriched = rows.map(r => {
      if (!r.near_duplicate_of) return r;
      const orig = nearDupMap.get(r.near_duplicate_of);
      if (!orig) return r;
      const daysApart = Math.round(
        Math.abs((new Date(r.txn_date) - new Date(orig.txn_date)) / 86400000)
      );
      return {
        ...r,
        near_duplicate_info: {
          id: orig.id,
          txn_date: orig.txn_date,
          description: orig.description,
          amount: orig.amount,
          vendor_normalized: orig.vendor_normalized,
          account_code: orig.account_code,
          account_name: orig.account_name,
          days_apart: daysApart,
        },
      };
    });

    res.json({ data: enriched, total: count, limit, offset });
  } catch (err) {
    console.error('[Books/Transactions] list failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// GET /api/v1/books/transactions/:id
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT
        t.*,
        a.code AS account_code, a.name AS account_name,
        c.code AS category_code, c.name AS category_name
      FROM transactions t
      LEFT JOIN accounts a ON a.id = t.account_id
      LEFT JOIN accounts c ON c.id = t.category_account_id
      WHERE t.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Transaction not found', code: 'NOT_FOUND' });
    // Enrich with near_duplicate_info if set.
    let nearDupInfo = null;
    if (row.near_duplicate_of) {
      const orig = db.prepare(`
        SELECT t.id, t.txn_date, t.description, t.amount, t.vendor_normalized,
               a.code AS account_code, a.name AS account_name
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.account_id
        WHERE t.id = ?
      `).get(row.near_duplicate_of);
      if (orig) {
        const daysApart = Math.round(
          Math.abs((new Date(row.txn_date) - new Date(orig.txn_date)) / 86400000)
        );
        nearDupInfo = { ...orig, days_apart: daysApart };
      }
    }
    res.json({ data: { ...row, near_duplicate_info: nearDupInfo } });
  } catch (err) {
    console.error('[Books/Transactions] get failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// GET /api/v1/books/transactions/:id/near-duplicate
// Returns the existing transaction that this one is flagged as a near-duplicate of.
// 404 if near_duplicate_of is null.
router.get('/:id/near-duplicate', (req, res) => {
  try {
    const txn = db.prepare(`SELECT id, near_duplicate_of FROM transactions WHERE id = ?`).get(req.params.id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found', code: 'NOT_FOUND' });
    if (!txn.near_duplicate_of) {
      return res.status(404).json({ error: 'No near-duplicate reference', code: 'NOT_FOUND' });
    }
    const orig = db.prepare(`
      SELECT t.*, a.code AS account_code, a.name AS account_name
      FROM transactions t
      LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.id = ?
    `).get(txn.near_duplicate_of);
    if (!orig) return res.status(404).json({ error: 'Original transaction missing', code: 'NOT_FOUND' });
    res.json({ data: orig });
  } catch (err) {
    console.error('[Books/Transactions] near-duplicate failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/transactions/:id/resolve-duplicate
// Body: { action: 'keep_both' | 'keep_this' | 'keep_original' }
//   keep_both     — null out near_duplicate_of on this transaction (user confirmed they're distinct).
//   keep_this     — delete the ORIGINAL transaction (and its journal entries). This one stays.
//   keep_original — delete THIS transaction (and its journal entries). Original stays.
// All paths wrapped in db.transaction() for atomicity.
// E.2: any deleted transaction that was cleared by a `reconciled` recon fires
// the mutation hook so the affected recons become stale.
router.post('/:id/resolve-duplicate', (req, res) => {
  try {
    const action = (req.body && req.body.action) || '';
    if (!['keep_both', 'keep_this', 'keep_original'].includes(action)) {
      return res.status(400).json({
        error: 'action must be one of: keep_both, keep_this, keep_original',
        code: 'VALIDATION_ERROR',
      });
    }
    const txn = db.prepare(`SELECT id, near_duplicate_of FROM transactions WHERE id = ?`).get(req.params.id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found', code: 'NOT_FOUND' });
    if (!txn.near_duplicate_of) {
      return res.status(400).json({
        error: 'Transaction has no near_duplicate_of reference to resolve',
        code: 'NO_DUPLICATE_REFERENCE',
      });
    }
    const originalId = txn.near_duplicate_of;

    let deleted = null;
    let cleared = false;
    // E.2: capture full snapshots of any deleted transactions BEFORE delete,
    // so the mutation hook has the pre-mutation state to store.
    let deletedSnapshots = []; // [{id, account_id, amount, category_account_id, txn_date, cleared_at}, ...]

    const tx = db.transaction(() => {
      if (action === 'keep_both') {
        db.prepare(`UPDATE transactions SET near_duplicate_of = NULL, updated_at = datetime('now') WHERE id = ?`)
          .run(req.params.id);
        cleared = true;
      } else if (action === 'keep_this') {
        // Delete the original. F1: journal_entries cascade via FK on source_id;
        // journal_lines cascade via journal_lines.entry_id FK. The helper does it all.
        // First, clear any other transactions that reference this original as their near_duplicate_of,
        // since deleting the original would break those FK references.
        const origTxn = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(originalId);
        if (origTxn) {
          deletedSnapshots.push({
            id: origTxn.id,
            account_id: origTxn.account_id,
            amount: origTxn.amount,
            category_account_id: origTxn.category_account_id,
            txn_date: origTxn.txn_date,
            cleared_at: origTxn.cleared_at,
          });
        }
        db.prepare(`UPDATE transactions SET near_duplicate_of = NULL WHERE near_duplicate_of = ?`).run(originalId);
        deleteTransaction(originalId);
        db.prepare(`UPDATE transactions SET near_duplicate_of = NULL, updated_at = datetime('now') WHERE id = ?`)
          .run(req.params.id);
        deleted = originalId;
      } else if (action === 'keep_original') {
        // Delete this transaction. F1: cascade via FK — no manual journal_entries cleanup needed.
        const myTxn = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(req.params.id);
        if (myTxn) {
          deletedSnapshots.push({
            id: myTxn.id,
            account_id: myTxn.account_id,
            amount: myTxn.amount,
            category_account_id: myTxn.category_account_id,
            txn_date: myTxn.txn_date,
            cleared_at: myTxn.cleared_at,
          });
        }
        deleteTransaction(req.params.id);
        deleted = req.params.id;
      }
    });
    tx();

    // E.2: fire the mutation hook for each deleted transaction that was cleared.
    const reconciliation_warnings = [];
    const seen = new Set();
    for (const snap of deletedSnapshots) {
      if (!snap.cleared_at) continue;
      const ws = invalidateReconciliationOnMutation(snap.id, 'transaction_deleted', snap, null);
      for (const w of ws) {
        if (!seen.has(w.recon_id)) {
          seen.add(w.recon_id);
          reconciliation_warnings.push(w);
        }
      }
    }

    res.json({ data: { action, deleted, cleared, reconciliation_warnings } });
  } catch (err) {
    console.error('[Books/Transactions] resolve-duplicate failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// PATCH /api/v1/books/transactions/:id
// Body: { category_account_id?, status?, notes?, vendor_normalized?, amount?, txn_date?, description? }
// Side effect: setting category_account_id creates a journal entry (debit/credit pair).
// Status auto-updates to 'categorized' when category is set (unless caller specifies otherwise).
// E.2 mutation hook: any change to a *cleared* transaction's amount, category, or txn_date
// invalidates the cleared reconciliation. The hook fires AFTER all the write-path mutations
// (including categorizeTransaction, which can re-write journal entries).
router.patch('/:id', (req, res) => {
  try {
    const existing = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Transaction not found', code: 'NOT_FOUND' });

    const body = req.body || {};
    const updates = [];
    const values = [];
    let newCategory = existing.category_account_id;
    let explicitStatus = null;

    for (const f of ALLOWED_PATCH_FIELDS) {
      if (body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(body[f] === '' ? null : body[f]);
        if (f === 'category_account_id') newCategory = body[f] === '' ? null : body[f];
        if (f === 'status') explicitStatus = body[f];
      }
    }

    if (updates.length === 0) {
      return res.json({ data: existing, reconciliation_warnings: [] });
    }

    // If category changed AND the new category is non-null, we must create the journal
    // entry. If category was previously set, the existing journal entry is left intact
    // (we don't undo/replace — the UI is responsible for not double-categorizing).
    const mustCreateJournal =
      newCategory !== null &&
      newCategory !== existing.category_account_id &&
      explicitStatus !== 'excluded';

    const tx = db.transaction(() => {
      updates.push(`updated_at = datetime('now')`);
      values.push(req.params.id);
      db.prepare(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      if (mustCreateJournal) {
        categorizeTransaction(req.params.id, newCategory, /*silent=*/false);
      } else if (explicitStatus === 'categorized' && newCategory && !existing.category_account_id) {
        // Status set without category change but status flips to categorized — only create
        // a journal entry if category is also set (the typical case).
        categorizeTransaction(req.params.id, newCategory, /*silent=*/false);
      }
    });
    tx();

    const updated = db.prepare(`
      SELECT
        t.*,
        a.code AS account_code, a.name AS account_name,
        c.code AS category_code, c.name AS category_name
      FROM transactions t
      LEFT JOIN accounts a ON a.id = t.account_id
      LEFT JOIN accounts c ON c.id = t.category_account_id
      WHERE t.id = ?
    `).get(req.params.id);

    // E.2 mutation hook. Compute what mutated (vs the existing snapshot) and
    // dispatch a single invalidate call per mutation type. The hook itself
    // is responsible for collecting stale recons across the four affected
    // mutation types.
    const reconciliation_warnings = runMutationHookIfCleared(req.params.id, existing, updated);

    res.json({ data: updated, journal_created: mustCreateJournal, reconciliation_warnings });
  } catch (err) {
    console.error('[Books/Transactions] patch failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// Helper: run the mutation hook for any PATCH-driven mutation. Detects:
//   - amount_changed
//   - category_changed
//   - transaction_date_changed
// Per the spec, description and status changes are NOT mutations. Returns
// the union of all stale-recon warnings triggered by this PATCH.
function runMutationHookIfCleared(txnId, before, after) {
  if (!after || !after.cleared_at) return [];
  const allWarnings = [];
  const seen = new Set(); // dedupe across the three mutation types

  const amountChanged = Number(before.amount) !== Number(after.amount);
  const categoryChanged = (before.category_account_id || null) !== (after.category_account_id || null);
  const dateChanged = String(before.txn_date).slice(0, 10) !== String(after.txn_date).slice(0, 10);

  if (amountChanged) {
    const w = invalidateReconciliationOnMutation(txnId, 'amount_changed',
      { amount: Number(before.amount), category_account_id: before.category_account_id, txn_date: before.txn_date },
      { amount: Number(after.amount),  category_account_id: after.category_account_id,  txn_date: after.txn_date }
    );
    for (const x of w) { if (!seen.has(x.recon_id)) { seen.add(x.recon_id); allWarnings.push(x); } }
  }
  if (categoryChanged) {
    const w = invalidateReconciliationOnMutation(txnId, 'category_changed',
      { amount: Number(before.amount), category_account_id: before.category_account_id, txn_date: before.txn_date },
      { amount: Number(after.amount),  category_account_id: after.category_account_id,  txn_date: after.txn_date }
    );
    for (const x of w) { if (!seen.has(x.recon_id)) { seen.add(x.recon_id); allWarnings.push(x); } }
  }
  if (dateChanged) {
    const w = invalidateReconciliationOnMutation(txnId, 'transaction_date_changed',
      { amount: Number(before.amount), category_account_id: before.category_account_id, txn_date: before.txn_date },
      { amount: Number(after.amount),  category_account_id: after.category_account_id,  txn_date: after.txn_date }
    );
    for (const x of w) { if (!seen.has(x.recon_id)) { seen.add(x.recon_id); allWarnings.push(x); } }
  }
  return allWarnings;
}

// POST /api/v1/books/transactions/:id/exclude
// Status='excluded', no journal entry.
router.post('/:id/exclude', (req, res) => {
  try {
    const existing = db.prepare(`SELECT id, status FROM transactions WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Transaction not found', code: 'NOT_FOUND' });
    db.prepare(`
      UPDATE transactions SET status = 'excluded', updated_at = datetime('now') WHERE id = ?
    `).run(req.params.id);
    const updated = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(req.params.id);
    res.json({ data: updated });
  } catch (err) {
    console.error('[Books/Transactions] exclude failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/transactions/:id/restore
// Status='uncategorized' (used when an excluded transaction is being reconsidered).
// Also clears category_account_id and deletes any orphan journal entries linked to this
// transaction — otherwise re-categorizing to a different account would create a second
// journal entry without voiding the first (would corrupt the trial balance).
router.post('/:id/restore', (req, res) => {
  try {
    const existing = db.prepare(`SELECT id FROM transactions WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Transaction not found', code: 'NOT_FOUND' });

    const tx = db.transaction(() => {
      // Null out category + flip status to uncategorized.
      db.prepare(`
        UPDATE transactions
        SET status = 'uncategorized', category_account_id = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(req.params.id);
      // Delete orphan journal entries linked to this transaction (lines cascade).
      const entries = db.prepare(`
        SELECT id FROM journal_entries WHERE source = 'transaction_import' AND source_id = ?
      `).all(req.params.id);
      for (const e of entries) {
        db.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(e.id);
      }
    });
    tx();

    const updated = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(req.params.id);
    res.json({ data: updated });
  } catch (err) {
    console.error('[Books/Transactions] restore failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;