// Virta Books — Phase E.2: Account Reconciliation (route shell).
// All business logic lives in `server/services/reconciliation.js`. This file
// is just thin HTTP translation: parse input, call the service, format the
// response.
//
// Endpoints:
//   GET    /api/v1/books/reconcile                       — listAccountsWithReconStatus
//   POST   /api/v1/books/reconcile                       — getOrCreateRecon
//   GET    /api/v1/books/reconcile/:recon_id             — getReconDetail (?include_past=1)
//   PATCH  /api/v1/books/reconcile/:recon_id             — inline (statement_balance, notes)
//   POST   /api/v1/books/reconcile/:recon_id/close       — closeRecon
//   POST   /api/v1/books/reconcile/:recon_id/rollback    — rollbackRecon
//   DELETE /api/v1/books/reconcile/:recon_id             — cancelDraft
//   POST   /api/v1/books/reconcile/:recon_id/clear       — inline (clears a txn)
//   DELETE /api/v1/books/reconcile/:recon_id/clear/:txn_id — inline (un-clears a txn)
//
// Source of truth: ACCOUNTING-E2.md v4. The previous E.1 calendar-month
// period model is fully replaced — write paths reject period_start /
// period_end. Legacy read paths (the in-app E.1 client code) were already
// updated in the D/F1/E.1 fix-pass to use the new endpoint shape; no
// backwards-compat shim is needed in production code.

import { Router } from 'express';
import db from '../../db.js';
import {
  listAccountsWithReconStatus,
  getOrCreateRecon,
  getReconDetail,
  closeRecon,
  rollbackRecon,
  cancelDraft,
} from '../../services/reconciliation.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/books/reconcile
//   List all asset/liability accounts with last-reconciliation status.
//   Used by /books/reconcile (account-select screen).
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  try {
    const data = listAccountsWithReconStatus();
    res.json({ data });
  } catch (err) {
    console.error('[Books/Reconcile] list failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/books/reconcile
//   Body: { account_id, as_of_date }
//   Idempotent on (account_id, status='draft'). 409 if as_of_date is not
//   strictly greater than accounts.last_reconciled_at.
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    // Reject E.1 calendar-month body shape — these fields are gone.
    if (body.period_start !== undefined || body.period_end !== undefined) {
      return res.status(400).json({
        error: 'period_start / period_end are no longer accepted; use as_of_date',
        code: 'VALIDATION_ERROR',
      });
    }
    const { detail, created } = getOrCreateRecon(body.account_id, body.as_of_date);
    res.json({ data: detail, created });
  } catch (err) {
    if (err.status && err.code) {
      return res.status(err.status).json({
        error: err.message, code: err.code,
        ...(err.diff !== undefined ? { diff: err.diff } : {}),
        ...(err.last_reconciled_at ? { last_reconciled_at: err.last_reconciled_at } : {}),
      });
    }
    console.error('[Books/Reconcile] create-draft failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/books/reconcile/:recon_id
//   Optional ?include_past=1 to expand the uncleared set past as_of_date.
// ---------------------------------------------------------------------------
router.get('/:recon_id', (req, res) => {
  try {
    const includePast = req.query.include_past === '1' || req.query.include_past === 'true';
    const detail = getReconDetail(req.params.recon_id, includePast);
    res.json({ data: detail });
  } catch (err) {
    if (err.status && err.code) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[Books/Reconcile] get detail failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/books/reconcile/:recon_id
//   Body: { statement_balance?, notes? }
//   Only drafts accept this — the new model has no 'investigating' status
//   and reconciled recons are immutable (use rollback).
// ---------------------------------------------------------------------------
router.patch('/:recon_id', (req, res) => {
  try {
    const recon = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(req.params.recon_id);
    if (!recon) {
      return res.status(404).json({ error: 'Reconciliation not found', code: 'NOT_FOUND' });
    }
    if (recon.status === 'reconciled') {
      return res.status(409).json({
        error: 'Reconciled reconciliations are immutable; use rollback to reopen',
        code: 'RECON_LOCKED',
      });
    }
    const { statement_balance, notes } = req.body || {};
    if (statement_balance === undefined && notes === undefined) {
      return res.status(400).json({ error: 'No updatable fields provided', code: 'VALIDATION_ERROR' });
    }

    const updates = [];
    const params = [];
    if (statement_balance !== undefined) {
      if (typeof statement_balance !== 'number' || !Number.isFinite(statement_balance)) {
        return res.status(400).json({ error: 'statement_balance must be a number', code: 'VALIDATION_ERROR' });
      }
      updates.push('statement_balance = ?');
      params.push(Math.round(statement_balance * 100) / 100);
      const diff = Math.round((recon.books_balance - statement_balance) * 100) / 100;
      updates.push('diff = ?');
      params.push(diff);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes === null ? null : String(notes));
    }
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(recon.id);

    db.prepare(`UPDATE reconciliations SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(recon.id);
    res.json({ data: { ...buildDetailLite(updated), notes: updated.notes } });
  } catch (err) {
    console.error('[Books/Reconcile] patch failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/books/reconcile/:recon_id/close
//   Body: { statement_balance }
//   Atomic commit on diff==0. Sets accounts.last_reconciled_*.
// ---------------------------------------------------------------------------
router.post('/:recon_id/close', (req, res) => {
  try {
    const { statement_balance } = req.body || {};
    const result = closeRecon(req.params.recon_id, Number(statement_balance));
    res.json({ data: result.detail, account: result.account });
  } catch (err) {
    if (err.status && err.code) {
      return res.status(err.status).json({
        error: err.message, code: err.code,
        ...(err.diff !== undefined ? { diff: err.diff } : {}),
      });
    }
    console.error('[Books/Reconcile] close failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/books/reconcile/:recon_id/rollback
//   Latest-only rollback. See service for the atomicity contract.
// ---------------------------------------------------------------------------
router.post('/:recon_id/rollback', (req, res) => {
  try {
    const result = rollbackRecon(req.params.recon_id);
    res.json({ data: result });
  } catch (err) {
    if (err.status && err.code) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[Books/Reconcile] rollback failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/books/reconcile/:recon_id
//   Cancel a draft (or legacy 'investigating') recon. 404 for reconciled —
//   the caller must use rollback.
// ---------------------------------------------------------------------------
router.delete('/:recon_id', (req, res) => {
  try {
    const result = cancelDraft(req.params.recon_id);
    res.json({ data: result });
  } catch (err) {
    if (err.status && err.code) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[Books/Reconcile] cancel-draft failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/books/reconcile/:recon_id/clear
//   Body: { transaction_id }
//   Locks if status='reconciled' (E1-S1 contract preserved).
// ---------------------------------------------------------------------------
router.post('/:recon_id/clear', (req, res) => {
  try {
    const recon = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(req.params.recon_id);
    if (!recon) {
      return res.status(404).json({ error: 'Reconciliation not found', code: 'NOT_FOUND' });
    }
    if (recon.status === 'reconciled') {
      return res.status(409).json({
        error: 'Cannot modify clears on a reconciled period.',
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
    db.prepare(`
      INSERT OR IGNORE INTO reconciliation_clears (reconciliation_id, transaction_id)
      VALUES (?, ?)
    `).run(recon.id, transaction_id);
    db.prepare(`UPDATE transactions SET cleared_at = datetime('now') WHERE id = ? AND cleared_at IS NULL`).run(transaction_id);
    db.prepare(`
      UPDATE reconciliations
      SET cleared_count = (SELECT COUNT(*) FROM reconciliation_clears WHERE reconciliation_id = ?),
          updated_at = ?
      WHERE id = ?
    `).run(recon.id, new Date().toISOString(), recon.id);

    const updated = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(recon.id);
    res.json({ data: getReconDetail(updated.id) });
  } catch (err) {
    console.error('[Books/Reconcile] clear failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/books/reconcile/:recon_id/clear/:transaction_id
// ---------------------------------------------------------------------------
router.delete('/:recon_id/clear/:transaction_id', (req, res) => {
  try {
    const recon = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(req.params.recon_id);
    if (!recon) {
      return res.status(404).json({ error: 'Reconciliation not found', code: 'NOT_FOUND' });
    }
    if (recon.status === 'reconciled') {
      return res.status(409).json({
        error: 'Cannot modify clears on a reconciled period.',
        code: 'RECON_LOCKED',
      });
    }
    const { transaction_id } = req.params;
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
    res.json({ data: getReconDetail(updated.id) });
  } catch (err) {
    console.error('[Books/Reconcile] un-clear failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// Lightweight shape for PATCH (re-uses the service for the full shape).
// ---------------------------------------------------------------------------
function buildDetailLite(recon) {
  return {
    reconciliation: recon,
    account: db.prepare('SELECT id, code, name, account_type FROM accounts WHERE id = ?').get(recon.account_id),
  };
}

export default router;
