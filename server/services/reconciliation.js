// Virta Books — Phase E.2 (Reconciliation Redesign + Mutation Detection)
//
// All reconciliation business logic lives here. The route file
// `server/routes/books/reconcile.js` is a thin HTTP shell that calls these
// helpers and translates results into JSON + status codes.
//
// Public API:
//   listAccountsWithReconStatus()
//     Per-account reconciliation summary for the account-select screen.
//     Returns the array of accounts with: last_reconciled_at,
//     last_reconciled_balance, an open-draft indicator, and a stale flag
//     (true if any recon for the account has stale=1).
//
//   getOrCreateRecon(accountId, asOfDate)
//     POST /reconcile behavior. Idempotent on open drafts (returns the
//     existing draft). Enforces the forward-only gate:
//       as_of_date > accounts.last_reconciled_at
//     NULL last_reconciled_at means "no lower bound".
//     Throws { status: 409, code: 'RECON_DATE_NOT_FORWARD' } on violation.
//
//   getReconDetail(reconId, includePast = false)
//     GET /reconcile/:id behavior. Returns the recon row + the account +
//     uncleared and cleared transaction lists, with a running balance
//     on the cleared side. When includePast=true, the uncleared set also
//     includes transactions with txn_date > as_of_date for the same account.
//
//   closeRecon(reconId, statementBalance)
//     POST /reconcile/:id/close behavior. Sets statement_balance, computes
//     diff, and if diff==0 atomically: status='reconciled', touches
//     transactions.cleared_at on the cleared set (already set on /clear),
//     and updates accounts.last_reconciled_at + last_reconciled_balance.
//     Throws { status: 409, code: 'DIFF_NOT_ZERO', diff } if diff != 0.
//
//   rollbackRecon(reconId)
//     POST /reconcile/:id/rollback behavior. Latest-only rollback.
//     Throws { status: 404, code: 'ROLLBACK_NOT_LATEST' } if a more-recent
//     reconciled recon exists for the same account.
//     Throws { status: 409, code: 'CANNOT_ROLLBACK_DRAFT' } for drafts.
//     Atomically: cascade-delete reconciliation_clears, null
//     transactions.cleared_at on the cleared set, DELETE the recon row,
//     revert accounts.last_reconciled_at + last_reconciled_balance to the
//     prior reconciled recon (or NULL if none).
//     Returns the new "latest" recon (or null if none).
//
//   cancelDraft(reconId)
//     DELETE /reconcile/:id behavior (drafts only). Cascade-clears the
//     reconciliation_clears rows, nulls transactions.cleared_at on the
//     cleared set, and deletes the recon row. Throws 404 if the recon is
//     not in a cancellable state (reconciled → tell caller to rollback).
//
//   invalidateReconciliationOnMutation(txnId, mutationType, before, after)
//     Mutation hook for the transactions write paths. Finds any
//     `reconciled` recons that cleared this transaction, marks them
//     stale=1, and appends the pre-mutation snapshot to their
//     stale_reason JSON envelope. Returns the array of newly-stale recons
//     (recon_id, account_id, as_of_date) for the API response.
//
// Date handling note: same mixed-format concern as E.1. Some imported
// transactions have `txn_date` in MM/DD/YYYY (legacy) and some in
// YYYY-MM-DD (canonical). We normalize in JS for the date-comparison path.

import { randomBytes } from 'crypto';
import db from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

// Convert any plausible date string (YYYY-MM-DD or MM/DD/YYYY) into YYYY-MM-DD.
function normalizeDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
}

function generateIdCompat() {
  return randomBytes(16).toString('hex');
}

// ---------------------------------------------------------------------------
// books_balance: per-account signed balance through as_of_date, MINUS any
// earlier reconciled recon's books_balance (so each recon is responsible
// for only its own delta — that's the gate).
// ---------------------------------------------------------------------------
function computeBooksBalance(accountId, asOfDate, accountType, priorReconBalance) {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(jl.credit), 0) AS credits,
      COALESCE(SUM(jl.debit),  0) AS debits
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE jl.account_id = ?
      AND je.txn_date <= ?
  `).get(accountId, asOfDate);
  const credits = row.credits || 0;
  const debits  = row.debits  || 0;
  const gross = accountType === 'asset' ? debits - credits : credits - debits;
  return money(gross - (priorReconBalance || 0));
}

// For the LIST endpoint, the gate-only value: gross balance through as_of_date
// MINUS the most recent prior recon's books_balance. Used to show "what the
// user still needs to reconcile up to" for the start-form, and the rolling
// `last_reconciled_balance` on the account.
function getAccountGateBalance(accountId, accountType) {
  const acct = db.prepare('SELECT last_reconciled_at, last_reconciled_balance FROM accounts WHERE id = ?').get(accountId);
  if (!acct) return { last_reconciled_at: null, last_reconciled_balance: null };
  return {
    last_reconciled_at: acct.last_reconciled_at || null,
    last_reconciled_balance: acct.last_reconciled_balance != null ? Number(acct.last_reconciled_balance) : null,
  };
}

// ---------------------------------------------------------------------------
// LIST: per-account recon status for the account-select screen.
// ---------------------------------------------------------------------------
export function listAccountsWithReconStatus() {
  const accounts = db.prepare(`
    SELECT id, code, name, account_type
    FROM accounts
    WHERE account_type IN ('asset', 'liability') AND is_active = 1
    ORDER BY account_type, code
  `).all();

  const lastReconStmt = db.prepare(`
    SELECT id, as_of_date, reconciled_at, status, stale, stale_reason, cleared_count
    FROM reconciliations
    WHERE account_id = ? AND status = 'reconciled'
    ORDER BY as_of_date DESC, reconciled_at DESC
    LIMIT 1
  `);
  const lastOpenStmt = db.prepare(`
    SELECT id, as_of_date, status, updated_at
    FROM reconciliations
    WHERE account_id = ? AND status IN ('draft', 'investigating')
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  const anyStaleStmt = db.prepare(`
    SELECT COUNT(*) AS c FROM reconciliations
    WHERE account_id = ? AND status = 'reconciled' AND stale = 1
  `);
  // E.2 UI need: the rollback confirmation modal (spec §6) must show the
  // *previous* reconciled recon's as_of_date + balance before the user
  // confirms — the rollback endpoint itself only reveals this info after
  // the fact. Additive-only query, no schema change.
  const priorReconStmt = db.prepare(`
    SELECT as_of_date, books_balance FROM reconciliations
    WHERE account_id = ? AND status = 'reconciled' AND id != ?
    ORDER BY as_of_date DESC, reconciled_at DESC
    LIMIT 1
  `);

  return accounts.map(a => {
    const last = lastReconStmt.get(a.id);
    const open = lastOpenStmt.get(a.id);
    const staleCount = anyStaleStmt.get(a.id).c;
    const gate = getAccountGateBalance(a.id, a.account_type);
    const prior = last ? priorReconStmt.get(a.id, last.id) : null;

    // Parse stale_reason JSON for the most-recent stale recon. The envelope is
    // an array of mutation snapshots [ { type, txn_id, before, after, at }, … ]
    // appended across multiple mutations. We surface one row per entry.
    let staleOffenders = [];
    if (last && last.stale && last.stale_reason) {
      try {
        const entries = JSON.parse(last.stale_reason);
        if (Array.isArray(entries)) {
          staleOffenders = entries.map(e => ({
            type: e.type,
            txn_id: e.txn_id,
            as_of_date: last.as_of_date,
            before: e.before || null,
            after: e.after === undefined ? null : e.after,  // null for deletes
          }));
        }
      } catch { /* keep empty */ }
    }

    return {
      account_id: a.id,
      account_code: a.code,
      account_name: a.name,
      account_type: a.account_type,
      last_reconciled_at: last ? last.as_of_date : null,
      last_reconciled_recon_id: last ? last.id : null,
      last_reconciled_period: last ? String(last.as_of_date || '').slice(0, 7) : null,
      last_reconciled_balance: last ? gate.last_reconciled_balance : null,
      last_status: last ? last.status : null,
      last_cleared_count: last ? last.cleared_count : null,
      stale: staleCount > 0,
      stale_count: staleCount,
      stale_offenders: staleOffenders,
      open_reconciliation: open || null,
      // For the rollback confirmation modal (spec §6): what the gate will
      // revert to if the user rolls back the current latest recon.
      prior_reconciliation: (last && !open) ? {
        as_of_date: prior ? prior.as_of_date : null,
        books_balance: prior ? prior.books_balance : null,
      } : null,
    };
  });
}

// ---------------------------------------------------------------------------
// GET-OR-CREATE: POST /reconcile body { account_id, as_of_date }
// ---------------------------------------------------------------------------
export function getOrCreateRecon(accountId, asOfDate) {
  if (!accountId || !asOfDate) {
    const err = new Error('account_id and as_of_date are required');
    err.status = 400; err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    const err = new Error('as_of_date must be YYYY-MM-DD');
    err.status = 400; err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const account = db.prepare(`
    SELECT id, code, name, account_type, last_reconciled_at, last_reconciled_balance
    FROM accounts WHERE id = ?
  `).get(accountId);
  if (!account) {
    const err = new Error('Account not found');
    err.status = 404; err.code = 'NOT_FOUND';
    throw err;
  }
  if (!['asset', 'liability'].includes(account.account_type)) {
    const err = new Error('Only asset/liability accounts are reconcilable');
    err.status = 400; err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Forward-only gate: as_of_date must be strictly > last_reconciled_at.
  // NULL last_reconciled_at = no lower bound (first recon for the account).
  if (account.last_reconciled_at && asOfDate <= account.last_reconciled_at) {
    const err = new Error(
      `as_of_date must be > last reconciled as of (${account.last_reconciled_at})`
    );
    err.status = 409;
    err.code = 'RECON_DATE_NOT_FORWARD';
    err.last_reconciled_at = account.last_reconciled_at;
    throw err;
  }

  // Look for an existing open draft (status='draft' or 'investigating') for this account.
  // Idempotent: if one exists, return it.
  const existing = db.prepare(`
    SELECT * FROM reconciliations
    WHERE account_id = ? AND status IN ('draft', 'investigating')
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(accountId);
  if (existing) {
    return {
      detail: buildReconDetail(existing),
      created: false,
    };
  }

  // No draft — create a new one. Compute books_balance: gross balance through
  // as_of_date, MINUS the prior recon's books_balance.
  const booksBalance = computeBooksBalance(
    accountId, asOfDate, account.account_type, account.last_reconciled_balance || 0
  );

  const id = generateIdCompat();
  db.prepare(`
    INSERT INTO reconciliations
      (id, account_id, period_start, period_end, as_of_date, books_balance, status)
    VALUES (?, ?, ?, ?, ?, ?, 'draft')
  `).run(id, accountId, asOfDate, asOfDate, asOfDate, booksBalance);

  const created = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(id);
  return {
    detail: buildReconDetail(created),
    created: true,
  };
}

// ---------------------------------------------------------------------------
// GET DETAIL: GET /reconcile/:id (?include_past=1)
// ---------------------------------------------------------------------------
export function getReconDetail(reconId, includePast = false) {
  const recon = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(reconId);
  if (!recon) {
    const err = new Error('Reconciliation not found');
    err.status = 404; err.code = 'NOT_FOUND';
    throw err;
  }
  return buildReconDetail(recon, { includePast });
}

// ---------------------------------------------------------------------------
// CLOSE: POST /reconcile/:id/close body { statement_balance }
// Atomically commits the recon when diff == 0.
// ---------------------------------------------------------------------------
export function closeRecon(reconId, statementBalance) {
  if (!reconId) {
    const err = new Error('recon_id is required');
    err.status = 400; err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (typeof statementBalance !== 'number' || !Number.isFinite(statementBalance)) {
    const err = new Error('statement_balance must be a number');
    err.status = 400; err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const recon = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(reconId);
  if (!recon) {
    const err = new Error('Reconciliation not found');
    err.status = 404; err.code = 'NOT_FOUND';
    throw err;
  }
  if (recon.status === 'reconciled') {
    const err = new Error('Reconciliation is already committed; use rollback to reopen');
    err.status = 409; err.code = 'RECON_ALREADY_COMMITTED';
    throw err;
  }

  const sb = money(statementBalance);
  const diff = money(recon.books_balance - sb);
  if (Math.abs(diff) >= 0.005) {
    const err = new Error(`diff must be 0 to commit (got ${diff.toFixed(2)})`);
    err.status = 409;
    err.code = 'DIFF_NOT_ZERO';
    err.diff = diff;
    throw err;
  }

  // Commit atomically.
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    // 1. Set status, statement_balance, diff, reconciled_at.
    db.prepare(`
      UPDATE reconciliations
      SET status = 'reconciled',
          statement_balance = ?,
          diff = ?,
          reconciled_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(sb, diff, now, now, reconId);

    // 2. Move the account gate.
    db.prepare(`
      UPDATE accounts
      SET last_reconciled_at = ?,
          last_reconciled_balance = ?,
          updated_at = ?
      WHERE id = ?
    `).run(recon.as_of_date, recon.books_balance, now, recon.account_id);

    // 3. cleared_at on the cleared set is already set (by /clear). Refresh the
    //    cleared_count on the recon for audit purposes.
    db.prepare(`
      UPDATE reconciliations
      SET cleared_count = (SELECT COUNT(*) FROM reconciliation_clears WHERE reconciliation_id = ?)
      WHERE id = ?
    `).run(reconId, reconId);
  });
  tx();

  return {
    detail: buildReconDetail(db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(reconId)),
    account: db.prepare('SELECT * FROM accounts WHERE id = ?').get(recon.account_id),
  };
}

// ---------------------------------------------------------------------------
// ROLLBACK: POST /reconcile/:id/rollback (latest only).
// Atomically removes the recon, cascades clears, nulls cleared_at on the
// cleared set, and reverts the account gate.
// ---------------------------------------------------------------------------
export function rollbackRecon(reconId) {
  if (!reconId) {
    const err = new Error('recon_id is required');
    err.status = 400; err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const recon = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(reconId);
  if (!recon) {
    const err = new Error('Reconciliation not found');
    err.status = 404; err.code = 'NOT_FOUND';
    throw err;
  }
  if (recon.status !== 'reconciled') {
    const err = new Error('Only reconciled reconciliations can be rolled back; drafts should be cancelled');
    err.status = 409; err.code = 'CANNOT_ROLLBACK_DRAFT';
    throw err;
  }

  // Find the latest reconciled recon for the same account (could be this one
  // if it's the most recent, or a more recent one — the latter is the error case).
  const latest = db.prepare(`
    SELECT id, as_of_date, books_balance FROM reconciliations
    WHERE account_id = ? AND status = 'reconciled'
    ORDER BY as_of_date DESC, reconciled_at DESC
    LIMIT 1
  `).get(recon.account_id);
  if (!latest || latest.id !== reconId) {
    const err = new Error('A more recent reconciled recon exists; rollback is latest-only');
    err.status = 404; err.code = 'ROLLBACK_NOT_LATEST';
    throw err;
  }

  // Find the *prior* reconciled recon (the one we'll revert the gate to).
  const prior = db.prepare(`
    SELECT id, as_of_date, books_balance FROM reconciliations
    WHERE account_id = ? AND status = 'reconciled' AND id != ?
    ORDER BY as_of_date DESC, reconciled_at DESC
    LIMIT 1
  `).get(recon.account_id, reconId);

  // The cleared set: any transaction that was cleared by THIS recon.
  const clearedTxnIds = db.prepare(`
    SELECT transaction_id FROM reconciliation_clears WHERE reconciliation_id = ?
  `).all(reconId).map(r => r.transaction_id);

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    // 1. Null cleared_at on the cleared set.
    if (clearedTxnIds.length > 0) {
      const placeholders = clearedTxnIds.map(() => '?').join(',');
      db.prepare(`
        UPDATE transactions SET cleared_at = NULL WHERE id IN (${placeholders})
      `).run(...clearedTxnIds);
    }
    // 2. Delete the recon (FK CASCADE removes reconciliation_clears rows).
    db.prepare('DELETE FROM reconciliations WHERE id = ?').run(reconId);
    // 3. Revert the account gate.
    if (prior) {
      db.prepare(`
        UPDATE accounts
        SET last_reconciled_at = ?,
            last_reconciled_balance = ?,
            updated_at = ?
        WHERE id = ?
      `).run(prior.as_of_date, prior.books_balance, now, recon.account_id);
    } else {
      db.prepare(`
        UPDATE accounts
        SET last_reconciled_at = NULL,
            last_reconciled_balance = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(now, recon.account_id);
    }
  });
  tx();

  // Build a "new latest" response so the UI can update.
  const newLatest = db.prepare(`
    SELECT * FROM reconciliations
    WHERE account_id = ? AND status = 'reconciled'
    ORDER BY as_of_date DESC, reconciled_at DESC
    LIMIT 1
  `).get(recon.account_id);

  return {
    rolled_back_recon_id: reconId,
    account_id: recon.account_id,
    cleared_txn_count: clearedTxnIds.length,
    new_latest_recon: newLatest || null,
    reverted_gate: prior
      ? { last_reconciled_at: prior.as_of_date, last_reconciled_balance: prior.books_balance }
      : { last_reconciled_at: null, last_reconciled_balance: null },
  };
}

// ---------------------------------------------------------------------------
// CANCEL DRAFT: DELETE /reconcile/:id (drafts only).
// ---------------------------------------------------------------------------
export function cancelDraft(reconId) {
  if (!reconId) {
    const err = new Error('recon_id is required');
    err.status = 400; err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const recon = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(reconId);
  if (!recon) {
    const err = new Error('Reconciliation not found');
    err.status = 404; err.code = 'NOT_FOUND';
    throw err;
  }
  if (recon.status === 'reconciled') {
    const err = new Error('Cannot delete a reconciled recon; use rollback');
    err.status = 404; err.code = 'CANNOT_DELETE_RECONCILED';
    throw err;
  }

  const clearedTxnIds = db.prepare(`
    SELECT transaction_id FROM reconciliation_clears WHERE reconciliation_id = ?
  `).all(reconId).map(r => r.transaction_id);

  const tx = db.transaction(() => {
    if (clearedTxnIds.length > 0) {
      const placeholders = clearedTxnIds.map(() => '?').join(',');
      db.prepare(`
        UPDATE transactions SET cleared_at = NULL WHERE id IN (${placeholders})
      `).run(...clearedTxnIds);
    }
    db.prepare('DELETE FROM reconciliations WHERE id = ?').run(reconId);
  });
  tx();

  return {
    cancelled_recon_id: reconId,
    cleared_txn_count: clearedTxnIds.length,
  };
}

// ---------------------------------------------------------------------------
// MUTATION HOOK: invalidate any reconciled recons that cleared this txn.
// Appends a JSON snapshot to stale_reason (preserves prior mutations).
// Returns an array of {recon_id, account_id, as_of_date, reason, stale_at}.
// ---------------------------------------------------------------------------
export function invalidateReconciliationOnMutation(txnId, mutationType, before, after) {
  if (!txnId) return [];

  // Find all reconciled recons that cleared this transaction.
  const reconRows = db.prepare(`
    SELECT r.id AS recon_id, r.account_id, r.as_of_date, r.stale_reason
    FROM reconciliations r
    JOIN reconciliation_clears rc ON rc.reconciliation_id = r.id
    WHERE rc.transaction_id = ? AND r.status = 'reconciled'
  `).all(txnId);

  if (reconRows.length === 0) return [];

  const now = new Date().toISOString();
  const warnings = [];

  const tx = db.transaction(() => {
    for (const r of reconRows) {
      // Parse existing envelope; fall back to a single-blob array.
      let envelope = [];
      if (r.stale_reason) {
        try {
          const parsed = JSON.parse(r.stale_reason);
          if (Array.isArray(parsed)) envelope = parsed;
          else if (parsed && typeof parsed === 'object') envelope = [parsed];
        } catch {
          // Legacy single-blob; wrap it.
          envelope = [{ type: 'legacy', raw: r.stale_reason, at: now }];
        }
      }
      envelope.push({
        type: mutationType,
        txn_id: txnId,
        before: before || null,
        after: after || null,
        at: now,
      });
      db.prepare(`
        UPDATE reconciliations
        SET stale = 1, stale_reason = ?, stale_at = ?
        WHERE id = ?
      `).run(JSON.stringify(envelope), now, r.recon_id);

      warnings.push({
        recon_id: r.recon_id,
        account_id: r.account_id,
        as_of_date: r.as_of_date,
        reason: mutationType,
        stale_at: now,
      });
    }
  });
  tx();

  // Enrich warnings with account_name/code for the UI.
  return warnings.map(w => {
    const a = db.prepare('SELECT code, name FROM accounts WHERE id = ?').get(w.account_id);
    return {
      ...w,
      account_code: a ? a.code : null,
      account_name: a ? a.name : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Internal: build the full detail payload (used by GET and POST /reconcile).
// ---------------------------------------------------------------------------
function buildReconDetail(recon, opts = {}) {
  const includePast = !!opts.includePast;
  const { uncleared, cleared } = splitTxnsForAsOf(recon.account_id, recon.as_of_date, includePast);

  // Running balance across cleared txns (cumulative sum in date order).
  let running = 0;
  const clearedWithBalance = cleared.map(t => {
    running = money(running + Number(t.amount));
    return { ...t, running_balance: running };
  });

  const account = db.prepare(`
    SELECT id, code, name, account_type, last_reconciled_at, last_reconciled_balance
    FROM accounts WHERE id = ?
  `).get(recon.account_id);

  // Pull all stale recons for this account, with their stale_reason envelopes,
  // so the UI can render the "See what has changed" list. Decoded for convenience.
  const staleRecons = db.prepare(`
    SELECT id, as_of_date, stale_reason, stale_at
    FROM reconciliations
    WHERE account_id = ? AND status = 'reconciled' AND stale = 1
  `).all(recon.account_id);

  const staleOffendingTxns = [];
  for (const sr of staleRecons) {
    let envelope = [];
    try {
      const parsed = JSON.parse(sr.stale_reason || '[]');
      envelope = Array.isArray(parsed) ? parsed : [parsed];
    } catch { /* ignore */ }
    for (const entry of envelope) {
      if (!entry || !entry.txn_id) continue;
      const txn = db.prepare(`
        SELECT id, txn_date, description, vendor_normalized, amount,
               category_account_id, status
        FROM transactions WHERE id = ?
      `).get(entry.txn_id);
      staleOffendingTxns.push({
        recon_id: sr.id,
        recon_as_of_date: sr.as_of_date,
        txn_id: entry.txn_id,
        reason: entry.type,
        before: entry.before || null,
        after: entry.after || null,
        at: entry.at,
        current_txn: txn || null,
      });
    }
  }

  return {
    reconciliation: recon,
    account,
    uncleared,
    cleared: clearedWithBalance,
    include_past: includePast,
    stale: !!recon.stale,
    stale_reason: recon.stale_reason || null,
    stale_offending_txns: staleOffendingTxns,
  };
}

function splitTxnsForAsOf(accountId, asOfDate, includePast) {
  const all = db.prepare(`
    SELECT id, txn_date, description, amount, vendor_normalized, cleared_at, status,
           category_account_id, near_duplicate_of
    FROM transactions
    WHERE account_id = ?
    ORDER BY txn_date, id
  `).all(accountId);

  const uncleared = [];
  const cleared = [];
  for (const t of all) {
    const nd = normalizeDate(t.txn_date);
    if (!nd) continue; // unparseable date — skip silently
    if (nd <= asOfDate) {
      if (t.cleared_at) cleared.push(t); else uncleared.push(t);
    } else if (includePast) {
      // Past-as_of_date: still show in uncleared so the user can match it into this recon.
      if (!t.cleared_at) uncleared.push(t);
    }
  }
  return { uncleared, cleared };
}
