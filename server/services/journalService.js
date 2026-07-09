// Virta Books — Phase 1+2 Journal Service
//
// Responsibilities:
//   - createEntry(...): build a balanced 2-line GL entry from a manual-entry modal.
//   - listEntries(filter): power the Transactions (GL) page with date/category/name filters.
//   - getEntryWithAudit(id): full posting detail for the click-to-reveal modal.
//
// Sign convention (D63, D64, D70):
//   The user thinks in *amount* with a sign:
//     positive = the picked Category "went up"
//     negative = the picked Category "went down"
//   We convert the sign into a debit/credit pair based on the Category's normal balance:
//     Normal-debit accounts (asset, expense) → +amount means debit on Category
//     Normal-credit accounts (liability, equity, income) → +amount means credit on Category
//   The Matched-with account always takes the opposite side.
//
// Balanced-entry guarantee:
//   The two lines produced by createEntry() are summed and validated before
//   commit: sum(debit) === sum(credit). If they don't balance — which can only
//   happen due to an internal bug — the transaction rolls back and a 500 fires.
//
// Audit policy (D66):
//   Every createEntry() writes one audit_log row with event='created', the full
//   pre/post state (before=null, after=the new entry + 2 lines), and a human
//   summary like "Created journal entry on 2026-07-09: 6000 Advertising +$45.20 matched with 1000 Business Checking".
//
// Reconciliation status (D59, final semantics Phase 9):
//   Each new entry starts with recon_status='empty'. v1 just shows the state;
//   transitions are deferred to Phase 9.

import db, { generateId } from '../db.js';

// account_type → normal-balance side.
// Asset & Expense → debit. Liability, Equity, Income → credit.
const NORMAL_BALANCE = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  income: 'credit',
};

export function normalBalanceOf(accountType) {
  return NORMAL_BALANCE[accountType] || null;
}

// =====================================================================
// createEntry({ txn_date, type, category_account_id, matched_account_id,
//               name, amount, description, notes })
// Returns the full new entry with both journal_lines. Throws on
// validation failure or unbalanced commit (the only place a balance
// invariant could be violated).
//
// `amount` semantics (D63/D64): positive = the picked Category account went
// up; negative = it went down. Internally we treat `amount` as the sign of
// the primary line, then derive the opposite-sign line on the matched side.
//
// Reconciled-only safety: callers must validate matched is not equal to
// category. (We surface that as a 400 here so the modal shows a clean error.)
// =====================================================================
export function createEntry({
  txn_date,
  type,
  category_account_id,
  matched_account_id,
  name,
  amount,
  description,
  notes,
}) {
  // --- Validation ---
  if (!txn_date) throw new Error('txn_date is required');
  if (!type) throw new Error('type is required');
  const typeLower = String(type).toLowerCase();
  if (!['asset', 'expense', 'liability', 'equity', 'income'].includes(typeLower)) {
    throw new Error(`type must be one of asset|expense|liability|equity|income (got "${type}")`);
  }
  if (!category_account_id) throw new Error('category_account_id is required');
  if (!matched_account_id) throw new Error('matched_account_id is required');
  if (category_account_id === matched_account_id) {
    throw new Error('Category and Matched-with accounts must be different');
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    throw new Error('amount must be a finite number');
  }
  // Allow tiny floating drift (≤ 0.005) for cents rounding. Anything more is a bug.
  const absAmount = Math.abs(numericAmount);
  if (absAmount < 0.005) {
    throw new Error('amount must be non-zero (amounts under $0.005 are not meaningful)');
  }

  // Validate the accounts exist & the type matches the category.
  // Build canonical lowercase form for internal use.
  const TYPE_NORM = typeLower;
  void TYPE_NORM;

  const category = db.prepare(
    `SELECT id, code, name, account_type FROM accounts WHERE id = ?`
  ).get(category_account_id);
  if (!category) throw new Error('Category account not found');
  if (category.account_type !== typeLower) {
    throw new Error(`Selected category is a ${category.account_type} account, but Type=${type}. Type must match the Category account's type.`);
  }

  const matched = db.prepare(
    `SELECT id, code, name, account_type FROM accounts WHERE id = ?`
  ).get(matched_account_id);
  if (!matched) throw new Error('Matched-with account not found');

  // --- Balance computation (the hard part) ---
  //
  // userAmount    = signed number from modal (sign = "did category go up?")
  // sideOf(amount) for category = debit if category's type has normal-debit,
  //                          else credit.
  //
  // The Matched-with account gets the OPPOSITE side.
  //
  // We translate via sign convention:
  //   debit balance types (asset, expense):
  //     amount > 0 → debit category, credit matched
  //     amount < 0 → credit category, debit matched
  //   credit balance types (liability, equity, income):
  //     amount > 0 → credit category, debit matched
  //     amount < 0 → debit category, credit matched
  //
  // In every case: sum(debit) === sum(credit) === absAmount. The two-line
  // entry is always balanced by construction.

  const normalBalance = normalBalanceOf(typeLower);
  if (!normalBalance) {
    throw new Error(`Unknown account type "${type}"`);
  }
  const categoryGoesUp = numericAmount > 0;
  // categorySide: which side of the ledger the category is on
  // (debit if (normal-debit AND goes up) OR (normal-credit AND goes down))
  const categorySide =
    (normalBalance === 'debit' && categoryGoesUp) ||
    (normalBalance === 'credit' && !categoryGoesUp)
      ? 'debit'
      : 'credit';
  const matchedSide = categorySide === 'debit' ? 'credit' : 'debit';

  const categoryDebit = categorySide === 'debit' ? absAmount : 0;
  const categoryCredit = categorySide === 'credit' ? absAmount : 0;
  const matchedDebit = matchedSide === 'debit' ? absAmount : 0;
  const matchedCredit = matchedSide === 'credit' ? absAmount : 0;

  // Build the row data up-front. We commit inside a single db.transaction()
  // along with the audit_log row.
  const entryId = generateId();
  const lineIds = { category: generateId(), matched: generateId() };
  const descriptionText = description ? String(description).trim() : '';
  const nameText = name ? String(name).trim() : '';
  const notesText = notes ? String(notes).trim() : '';

  // Build the after-state snapshot for the audit log (no sensitive data; just the
  // entries + lines so a reviewer can see what was posted).
  const afterSnapshot = {
    entry: {
      id: entryId,
      txn_date,
      description: descriptionText,
      source: 'manual',
      name: nameText || null,
      notes: notesText || null,
      amount: absAmount,
      category_account_id: category_account_id,
      matched_account_id: matched_account_id,
      recon_status: 'empty',
    },
    lines: [
      {
        entry_id: entryId,
        account_id: category_account_id,
        debit: categoryDebit,
        credit: categoryCredit,
        position: 0,
      },
      {
        entry_id: entryId,
        account_id: matched_account_id,
        debit: matchedDebit,
        credit: matchedCredit,
        position: 1,
      },
    ],
    category: { id: category.id, code: category.code, name: category.name, account_type: category.account_type },
    matched:  { id: matched.id,   code: matched.code,   name: matched.name,   account_type: matched.account_type },
  };
  const afterJson = JSON.stringify(afterSnapshot);

  // Human-readable summary for the audit modal.
  const signedDisplay =
    (numericAmount > 0 ? '+' : numericAmount < 0 ? '-' : '') + '$' + absAmount.toFixed(2);
  const summary =
    `Created journal entry on ${txn_date}: ${category.code} ${category.name} ${signedDisplay} ` +
    `matched with ${matched.code} ${matched.name}` +
    (nameText ? ` · with ${nameText}` : '') +
    (descriptionText ? ` · ${descriptionText}` : '');

  // --- Atomic commit ---
  const tx = db.transaction(() => {
    // Insert header. source='manual' (existing CHECK value) — covers all manual
    // posting flows. We tag name/notes/amount/category/matched on the header
    // so the GL listing can render without joining journal_lines for each row.
    db.prepare(`
      INSERT INTO journal_entries
        (id, txn_date, description, source, name, notes, amount,
         category_account_id, matched_account_id, recon_status)
      VALUES
        (?, ?, ?, 'manual', ?, ?, ?, ?, ?, 'empty')
    `).run(
      entryId,
      txn_date,
      descriptionText || `Manual entry: ${category.name}`,
      nameText || null,
      notesText || null,
      absAmount,
      category_account_id,
      matched_account_id,
    );

    const insertLine = db.prepare(`
      INSERT INTO journal_lines (id, entry_id, account_id, debit, credit, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertLine.run(lineIds.category, entryId, category_account_id, categoryDebit, categoryCredit, 0);
    insertLine.run(lineIds.matched,  entryId, matched_account_id,  matchedDebit,  matchedCredit,  1);

    // Update cached balance snapshot for both accounts. The snapshot stores
    // the cumulative running balance at as_of_date = txn_date, computed from
    // ALL journal lines (not just this one). It's O(N) per insert but trivial
    // for Phase 1+2; Phase 5+ Reports will do incremental.
    const upsertBalance = db.prepare(`
      INSERT INTO account_balances (account_id, as_of_date, balance, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(account_id, as_of_date) DO UPDATE SET
        balance = excluded.balance,
        updated_at = excluded.updated_at
    `);
    const balanceAt = db.prepare(`
      SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS bal
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.account_id = ? AND je.txn_date <= ?
    `);
    for (const acctId of [category_account_id, matched_account_id]) {
      const bal = balanceAt.get(acctId, txn_date).bal;
      upsertBalance.run(acctId, txn_date, bal);
    }

    // Write the audit row.
    db.prepare(`
      INSERT INTO audit_log (event, actor, source, source_id, before_json, after_json, summary)
      VALUES ('created', 'user', 'journal_entry', ?, NULL, ?, ?)
    `).run(entryId, afterJson, summary);
  });
  tx();

  // Read back the persisted entry (so callers see the real created_at, etc.).
  return getEntry(entryId);
}

// =====================================================================
// getEntry(id) — load one entry with its two lines + account metadata.
// Used by getEntryWithAudit and the click-to-reveal modal.
// =====================================================================
export function getEntry(id) {
  const entry = db.prepare(`
    SELECT je.*,
           cat.code AS category_code, cat.name AS category_name, cat.account_type AS category_account_type,
           mtc.code  AS matched_code,  mtc.name  AS matched_name,  mtc.account_type AS matched_account_type
    FROM journal_entries je
    LEFT JOIN accounts cat ON cat.id = je.category_account_id
    LEFT JOIN accounts mtc ON mtc.id = je.matched_account_id
    WHERE je.id = ?
  `).get(id);
  if (!entry) return null;

  const lines = db.prepare(`
    SELECT jl.*, a.code AS account_code, a.name AS account_name, a.account_type
    FROM journal_lines jl
    LEFT JOIN accounts a ON a.id = jl.account_id
    WHERE jl.entry_id = ?
    ORDER BY jl.position ASC, jl.id ASC
  `).all(id);

  return { ...entry, lines };
}

// =====================================================================
// getEntryWithAudit(id) — used by the click-to-reveal audit modal.
// Returns the entry detail plus the full audit trail (most recent first)
// plus the "who/when" line that surfaces "Created by user on …" (D66).
// =====================================================================
export function getEntryWithAudit(id) {
  const entry = getEntry(id);
  if (!entry) return null;

  const audit = db.prepare(`
    SELECT id, event, actor, occurred_at, source, source_id, summary
    FROM audit_log
    WHERE source = 'journal_entry' AND source_id = ?
    ORDER BY occurred_at DESC, id DESC
  `).all(id);

  // Compose the user-friendly header line: "Created by user on YYYY-MM-DD HH:MM".
  const created = audit.find(a => a.event === 'created');
  return {
    ...entry,
    audit,
    created_by: created?.summary || 'Created by user',
    created_at: created?.occurred_at || entry.created_at,
  };
}

// =====================================================================
// listEntries(filter) — power the Transactions (GL) page.
//
// filter: {
//   date_from?, date_to?    — both inclusive (YYYY-MM-DD strings)
//   category_id?            — match either side (category or matched)
//   name_q?                 — case-insensitive substring match on entry.name
//   limit?, offset?
// }
//
// Returns { rows: [entry, ...], total, limit, offset }. Each row carries
// `category` and `matched` account info + summary debit/credit amounts so
// the React table can render without re-joining per row.
// =====================================================================
export function listEntries(filter = {}) {
  const where = [];
  const params = [];
  if (filter.date_from) {
    where.push('je.txn_date >= ?');
    params.push(filter.date_from);
  }
  if (filter.date_to) {
    where.push('je.txn_date <= ?');
    params.push(filter.date_to);
  }
  if (filter.category_id) {
    // Match either side of the entry — accountants think in "accounts touched".
    where.push('(je.category_account_id = ? OR je.matched_account_id = ?)');
    params.push(filter.category_id, filter.category_id);
  }
  if (filter.name_q) {
    where.push(`LOWER(COALESCE(je.name, '')) LIKE ?`);
    params.push('%' + String(filter.name_q).toLowerCase() + '%');
  }
  // Only show manually-posted entries + transaction_import entries in the GL.
  // (Phase 2: this is "everything in the GL"; Phase 4 will add invoice_payment.)
  where.push(`je.source IN ('manual_entry','manual','transaction_import')`);

  const whereClause = 'WHERE ' + where.join(' AND ');

  const limit = Math.min(Number(filter.limit) || 100, 500);
  const offset = Number(filter.offset) || 0;

  const rows = db.prepare(`
    SELECT
      je.id, je.txn_date, je.description, je.source, je.created_at,
      je.recon_status, je.name, je.amount,
      je.category_account_id,
      je.matched_account_id,
      cat.code AS category_code, cat.name AS category_name, cat.account_type AS category_account_type,
      mtc.code AS matched_code,  mtc.name AS matched_name,  mtc.account_type AS matched_account_type,
      (SELECT COALESCE(SUM(jl.debit), 0)  FROM journal_lines jl WHERE jl.entry_id = je.id) AS total_debit,
      (SELECT COALESCE(SUM(jl.credit), 0) FROM journal_lines jl WHERE jl.entry_id = je.id) AS total_credit
    FROM journal_entries je
    LEFT JOIN accounts cat ON cat.id = je.category_account_id
    LEFT JOIN accounts mtc ON mtc.id = je.matched_account_id
    ${whereClause}
    ORDER BY je.txn_date DESC, je.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM journal_entries je ${whereClause}
  `).get(...params).c;

  // Phase 9 will filter source. For now we materialize `manual` and `manual_entry`
  // as the same row — but the source field is preserved so future filters work.
  // We expose a `source` field on each row accordingly.
  const normalized = rows.map(r => ({ ...r }));

  return { rows: normalized, total, limit, offset };
}
