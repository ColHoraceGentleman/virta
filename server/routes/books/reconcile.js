// Virta Books — Phase E.1: Account Reconciliation.
//   GET    /api/v1/books/reconcile                    — list asset/liability accounts + last-recon status
//   POST   /api/v1/books/reconcile                    — create-or-get-draft (idempotent on (account, period))
//   GET    /api/v1/books/reconcile/:recon_id          — full detail: uncleared, cleared, running balance
//   PATCH  /api/v1/books/reconcile/:recon_id          — update statement_balance, notes, status
//   POST   /api/v1/books/reconcile/:recon_id/clear    — mark txn cleared (inserts clear row + sets cleared_at)
//   DELETE /api/v1/books/reconcile/:recon_id/clear/:transaction_id — un-clear
//
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
//   §13 (Account Reconciliation).
//
// Idempotency contract:
//   - POST /reconcile returns the existing draft if (account_id, period_start, period_end)
//     already has one in 'draft' or 'investigating' status. Only creates a new row if none exists.
//   - INSERT OR IGNORE on reconciliation_clears so re-clearing a txn is a no-op.
//   - DELETE on reconciliation_clears is a no-op if the row isn't there.
//
// Date handling: the existing `transactions.txn_date` column is mixed-format
// (some MM/DD/YYYY from old imports, some YYYY-MM-DD from newer ones). We normalize
// to YYYY-MM-DD in JS for the BETWEEN comparison rather than relying on SQLite
// string comparison, which would miss the legacy MM/DD/YYYY rows.

import { Router } from 'express';
import db from '../../db.js';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

// Convert any plausible date string (YYYY-MM-DD or MM/DD/YYYY) into YYYY-MM-DD.
// Returns null if the input is unparseable.
function normalizeDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  // YYYY-MM-DD (already canonical)
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // MM/DD/YYYY
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
}

// Sum credits minus debits for a given account across all journal_lines up to and
// including the period_end. This is the canonical "books_balance" for the account.
//
// Sign convention: a positive books_balance matches what the user sees on a bank
// statement for the account.
//   - asset accounts are debit-normal: positive = more debits than credits
//   - liability/equity accounts are credit-normal: positive = more credits than debits
//
// (Per Wren finding E1-S2: the previous implementation always returned
// (credits - debits), which produced a negative books_balance for any asset
// account with normal debit activity. The diff could never be zero against
// a positive bank-statement balance, making reconciliation impossible.)
function computeBooksBalance(accountId, periodEnd, accountType) {
  // periodEnd is YYYY-MM-DD; include the entire day.
  // journal_entries.txn_date is YYYY-MM-DD in practice (canonical form).
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(jl.credit), 0) AS credits,
      COALESCE(SUM(jl.debit),  0) AS debits
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = ?
      AND je.txn_date <= ?
  `).get(accountId, periodEnd);
  const credits = row.credits || 0;
  const debits  = row.debits  || 0;
  return money(accountType === 'asset' ? debits - credits : credits - debits);
}

// Pull all transactions for an account, then split into uncleared vs cleared
// for the given period. Done in JS so we can normalize the mixed-date column.
function splitTxnsForPeriod(accountId, periodStart, periodEnd) {
  const all = db.prepare(`
    SELECT id, txn_date, description, amount, vendor_normalized, cleared_at, status
    FROM transactions
    WHERE account_id = ?
    ORDER BY txn_date, id
  `).all(accountId);

  const uncleared = [];
  const cleared = [];
  for (const t of all) {
    const nd = normalizeDate(t.txn_date);
    if (!nd) continue; // unparseable date — skip silently
    if (nd < periodStart || nd > periodEnd) continue;
    if (t.cleared_at) cleared.push(t); else uncleared.push(t);
  }
  return { uncleared, cleared };
}

// ---------------------------------------------------------------------------
// GET /api/v1/books/reconcile
//   List all asset/liability accounts with last-reconciliation status.
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  try {
    const accounts = db.prepare(`
      SELECT id, code, name, account_type
      FROM accounts
      WHERE account_type IN ('asset', 'liability') AND is_active = 1
      ORDER BY account_type, code
    `).all();

    // For each account, find the most recent reconciliation (any status).
    const lastReconStmt = db.prepare(`
      SELECT reconciled_at, period_start, status, updated_at
      FROM reconciliations
      WHERE account_id = ?
        AND status = 'reconciled'
      ORDER BY reconciled_at DESC, updated_at DESC
      LIMIT 1
    `);
    // Also pull the most recent draft/investigating (so the UI can show "in progress").
    const lastOpenStmt = db.prepare(`
      SELECT id, period_start, period_end, status, updated_at
      FROM reconciliations
      WHERE account_id = ?
        AND status IN ('draft', 'investigating')
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    const data = accounts.map(a => {
      const last = lastReconStmt.get(a.id);
      const open = lastOpenStmt.get(a.id);
      const period = last ? String(last.period_start).slice(0, 7) : null;
      return {
        account_id: a.id,
        account_code: a.code,
        account_name: a.name,
        account_type: a.account_type,
        last_reconciled_at: last ? last.reconciled_at : null,
        last_reconciled_period: period,
        last_status: last ? last.status : null,
        open_reconciliation: open || null,
      };
    });

    res.json({ data });
  } catch (err) {
    console.error('[Books/Reconcile] list failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/books/reconcile
//   Create-or-get-draft. Idempotent on (account_id, period_start, period_end)
//   when an existing row is in 'draft' or 'investigating' status. A 'reconciled'
//   row always wins (we return it; creating a new draft for an already-reconciled
//   period would create audit confusion).
//   Body: { account_id, period_start, period_end }
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  try {
    const { account_id, period_start, period_end } = req.body || {};
    if (!account_id || !period_start || !period_end) {
      return res.status(400).json({
        error: 'account_id, period_start, period_end are required',
        code: 'VALIDATION_ERROR',
      });
    }
    // Validate the account exists and is asset/liability.
    const account = db.prepare(`
      SELECT id, code, name, account_type FROM accounts WHERE id = ?
    `).get(account_id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found', code: 'NOT_FOUND' });
    }
    if (!['asset', 'liability'].includes(account.account_type)) {
      return res.status(400).json({
        error: 'Only asset/liability accounts are reconcilable',
        code: 'VALIDATION_ERROR',
      });
    }
    // Defensive date validation: YYYY-MM-DD format only.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(period_end)) {
      return res.status(400).json({
        error: 'period_start and period_end must be YYYY-MM-DD',
        code: 'VALIDATION_ERROR',
      });
    }
    if (period_start > period_end) {
      return res.status(400).json({
        error: 'period_start must be <= period_end',
        code: 'VALIDATION_ERROR',
      });
    }

    // Look for an existing reconciliation for (account, period).
    // If one exists in draft/investigating: return it (idempotent).
    // If one exists as 'reconciled': return it too (don't create a new draft).
    const existing = db.prepare(`
      SELECT * FROM reconciliations
      WHERE account_id = ? AND period_start = ? AND period_end = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(account_id, period_start, period_end);

    if (existing) {
      const detail = buildDetail(existing);
      return res.json({ data: detail, created: false });
    }

    // Compute books_balance at creation time. The spec says: "across all time up
    // to and including period_end" — so the books_balance for a January recon is
    // the cumulative balance through Jan 31, not just January activity.
    // Pass account_type so the sign convention matches the account's normal
    // balance side (asset = debit-normal, others = credit-normal). See
    // computeBooksBalance() docstring.
    const booksBalance = computeBooksBalance(account_id, period_end, account.account_type);

    const id = generateIdCompat();
    db.prepare(`
      INSERT INTO reconciliations
        (id, account_id, period_start, period_end, books_balance, status)
      VALUES (?, ?, ?, ?, ?, 'draft')
    `).run(id, account_id, period_start, period_end, booksBalance);

    const created = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(id);
    const detail = buildDetail(created);
    res.json({ data: detail, created: true });
  } catch (err) {
    console.error('[Books/Reconcile] create-draft failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/books/reconcile/:recon_id
//   Full detail: reconciliation row + uncleared txns + cleared txns with
//   running balance (cumulative sum across cleared, in date order).
// ---------------------------------------------------------------------------
router.get('/:recon_id', (req, res) => {
  try {
    const recon = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(req.params.recon_id);
    if (!recon) {
      return res.status(404).json({ error: 'Reconciliation not found', code: 'NOT_FOUND' });
    }
    const detail = buildDetail(recon);
    res.json({ data: detail });
  } catch (err) {
    console.error('[Books/Reconcile] get detail failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/books/reconcile/:recon_id
//   Body: { statement_balance?, notes?, status? }
//   - statement_balance: recompute diff = books_balance - statement_balance
//   - status='reconciled' allowed only when diff == 0 (else 400 with the actual diff)
//   - updated_at is stamped automatically
// ---------------------------------------------------------------------------
router.patch('/:recon_id', (req, res) => {
  try {
    const recon = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(req.params.recon_id);
    if (!recon) {
      return res.status(404).json({ error: 'Reconciliation not found', code: 'NOT_FOUND' });
    }

    const { statement_balance, notes, status } = req.body || {};
    const updates = [];
    const params = [];

    if (statement_balance !== undefined) {
      if (typeof statement_balance !== 'number' || !Number.isFinite(statement_balance)) {
        return res.status(400).json({ error: 'statement_balance must be a number', code: 'VALIDATION_ERROR' });
      }
      updates.push('statement_balance = ?');
      params.push(money(statement_balance));
      // diff = books_balance - statement_balance (per spec)
      updates.push('diff = ?');
      params.push(money(recon.books_balance - statement_balance));
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes === null ? null : String(notes));
    }

    // Status transition logic.
    let nextStatus = recon.status;
    if (status !== undefined) {
      if (!['draft', 'reconciled', 'investigating'].includes(status)) {
        return res.status(400).json({
          error: 'status must be one of draft|reconciled|investigating',
          code: 'VALIDATION_ERROR',
        });
      }
      if (status === 'reconciled') {
        // Require diff == 0. We look at the recomputed diff (after any just-applied
        // statement_balance). If statement_balance wasn't provided, fall back to
        // the existing diff.
        const stmtBal = statement_balance !== undefined ? money(statement_balance) : recon.statement_balance;
        const diff = recon.books_balance - (stmtBal ?? 0);
        if (Math.abs(diff) >= 0.005) {
          return res.status(400).json({
            error: `Cannot mark reconciled: diff is ${money(diff).toFixed(2)}, must be 0`,
            code: 'DIFF_NOT_ZERO',
            diff: money(diff),
          });
        }
        updates.push('reconciled_at = ?');
        params.push(new Date().toISOString());
      }
      nextStatus = status;
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided', code: 'VALIDATION_ERROR' });
    }

    // Refresh cleared_count to current row count in reconciliation_clears.
    updates.push('cleared_count = ?');
    params.push(db.prepare('SELECT COUNT(*) as c FROM reconciliation_clears WHERE reconciliation_id = ?').get(recon.id).c);

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());

    params.push(recon.id);
    db.prepare(`UPDATE reconciliations SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(recon.id);
    const detail = buildDetail(updated);
    res.json({ data: detail });
  } catch (err) {
    console.error('[Books/Reconcile] patch failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/books/reconcile/:recon_id/clear
//   Body: { transaction_id }
//   - INSERT OR IGNORE into reconciliation_clears (idempotent)
//   - UPDATE transactions SET cleared_at = datetime('now') WHERE id = ? AND cleared_at IS NULL
//   - Recompute cleared_count on the reconciliation
//   Returns updated detail.
// ---------------------------------------------------------------------------
router.post('/:recon_id/clear', (req, res) => {
  try {
    const recon = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(req.params.recon_id);
    if (!recon) {
      return res.status(404).json({ error: 'Reconciliation not found', code: 'NOT_FOUND' });
    }
    // Per E1-S1: a reconciled period is closed. Lock out clear/unclear mutations
    // so the audit record at the moment of sign-off stays consistent. Caller can
    // reopen by PATCHing status back to 'investigating'.
    if (recon.status === 'reconciled') {
      return res.status(409).json({
        error: 'Cannot modify clears on a reconciled period. Set status to investigating first.',
        code: 'RECON_LOCKED',
      });
    }
    const { transaction_id } = req.body || {};
    if (!transaction_id) {
      return res.status(400).json({ error: 'transaction_id is required', code: 'VALIDATION_ERROR' });
    }
    const txn = db.prepare('SELECT id, account_id FROM transactions WHERE id = ?').get(transaction_id);
    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found', code: 'NOT_FOUND' });
    }
    if (txn.account_id !== recon.account_id) {
      return res.status(400).json({
        error: 'Transaction is on a different account than this reconciliation',
        code: 'ACCOUNT_MISMATCH',
      });
    }

    // INSERT OR IGNORE — re-clearing is a no-op.
    db.prepare(`
      INSERT OR IGNORE INTO reconciliation_clears (reconciliation_id, transaction_id)
      VALUES (?, ?)
    `).run(recon.id, transaction_id);

    // Set transactions.cleared_at if not already set.
    db.prepare(`UPDATE transactions SET cleared_at = datetime('now') WHERE id = ? AND cleared_at IS NULL`).run(transaction_id);

    // Refresh cleared_count + updated_at.
    db.prepare(`
      UPDATE reconciliations
      SET cleared_count = (SELECT COUNT(*) FROM reconciliation_clears WHERE reconciliation_id = ?),
          updated_at = ?
      WHERE id = ?
    `).run(recon.id, new Date().toISOString(), recon.id);

    const updated = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(recon.id);
    res.json({ data: buildDetail(updated) });
  } catch (err) {
    console.error('[Books/Reconcile] clear failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/books/reconcile/:recon_id/clear/:transaction_id
//   - DELETE from reconciliation_clears (no-op if not present)
//   - UPDATE transactions SET cleared_at = NULL WHERE id = ?
//   - Recompute cleared_count
// ---------------------------------------------------------------------------
router.delete('/:recon_id/clear/:transaction_id', (req, res) => {
  try {
    const recon = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(req.params.recon_id);
    if (!recon) {
      return res.status(404).json({ error: 'Reconciliation not found', code: 'NOT_FOUND' });
    }
    // Per E1-S1: a reconciled period is closed. Lock out clear/unclear mutations
    // so the audit record at the moment of sign-off stays consistent. Caller can
    // reopen by PATCHing status back to 'investigating'.
    if (recon.status === 'reconciled') {
      return res.status(409).json({
        error: 'Cannot modify clears on a reconciled period. Set status to investigating first.',
        code: 'RECON_LOCKED',
      });
    }
    const { transaction_id } = req.params;
    // Defensive: confirm the transaction exists (avoid silently doing nothing).
    const txn = db.prepare('SELECT id FROM transactions WHERE id = ?').get(transaction_id);
    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found', code: 'NOT_FOUND' });
    }

    db.prepare('DELETE FROM reconciliation_clears WHERE reconciliation_id = ? AND transaction_id = ?')
      .run(recon.id, transaction_id);
    db.prepare('UPDATE transactions SET cleared_at = NULL WHERE id = ?').run(transaction_id);

    db.prepare(`
      UPDATE reconciliations
      SET cleared_count = (SELECT COUNT(*) FROM reconciliation_clears WHERE reconciliation_id = ?),
          updated_at = ?
      WHERE id = ?
    `).run(recon.id, new Date().toISOString(), recon.id);

    const updated = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(recon.id);
    res.json({ data: buildDetail(updated) });
  } catch (err) {
    console.error('[Books/Reconcile] un-clear failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// Internal: build the full detail payload for a reconciliation row.
// ---------------------------------------------------------------------------
function buildDetail(recon) {
  const { uncleared, cleared } = splitTxnsForPeriod(recon.account_id, recon.period_start, recon.period_end);
  // Running balance across cleared txns (cumulative sum of amount, in date order).
  let running = 0;
  const clearedWithBalance = cleared.map(t => {
    running = money(running + Number(t.amount));
    return { ...t, running_balance: running };
  });
  const account = db.prepare('SELECT id, code, name, account_type FROM accounts WHERE id = ?').get(recon.account_id);
  return {
    reconciliation: recon,
    account,
    uncleared,
    cleared: clearedWithBalance,
  };
}

// Generate a hex ID (matches SQLite's lower(hex(randomblob(16))) default).
// We use crypto.randomUUID-style bytes from Node's crypto.
import { randomBytes } from 'crypto';
function generateIdCompat() {
  return randomBytes(16).toString('hex');
}

export default router;