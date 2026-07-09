// Virta Books — Phase 1+2 Journal REST endpoints.
//
// Routes:
//   POST   /api/v1/books/journal/entries              create a balanced 2-line entry
//   GET    /api/v1/books/journal/entries              list GL entries with filters
//   GET    /api/v1/books/journal/entries/:id          full posting detail (+ audit)
//   GET    /api/v1/books/journal/entries/:id/audit    audit trail only
//
// All endpoints follow the existing pattern:
//   - { data: ... } envelope on success
//   - { error, code } envelope on failure (with stable code for client branching)

import { Router } from 'express';
import {
  createEntry,
  listEntries,
  getEntry,
  getEntryWithAudit,
} from '../../services/journalService.js';
import db from '../../db.js';

const router = Router();

// POST /journal/entries
// Body: { txn_date, type, category_account_id, matched_account_id,
//         name?, amount, description?, notes? }
// Returns the full new entry (with both lines and category/matched account info).
router.post('/entries', (req, res) => {
  try {
    const body = req.body || {};
    const entry = createEntry({
      txn_date: body.txn_date,
      type: body.type,
      category_account_id: body.category_account_id,
      matched_account_id: body.matched_account_id,
      name: body.name,
      amount: body.amount,
      description: body.description,
      notes: body.notes,
    });
    res.json({ data: entry });
  } catch (err) {
    // Map common validation errors to 400 with a stable code; everything else 500.
    const msg = String(err && err.message || '');
    const isValidation = /required|invalid|unknown|must be|must match|Type must|non-zero|under \$0\.005|different/i.test(msg);
    if (isValidation) {
      return res.status(400).json({ error: msg, code: 'VALIDATION_ERROR' });
    }
    console.error('[Books/Journal] createEntry failed', err);
    res.status(500).json({ error: msg, code: 'SERVER_ERROR' });
  }
});

// GET /journal/entries?date_from=&date_to=&category_id=&name_q=&limit=&offset=
// Powers the Transactions (GL) page. Filter is client-side-of-the-API.
// The match is inclusive on both date bounds.
router.get('/entries', (req, res) => {
  try {
    const result = listEntries({
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      category_id: req.query.category_id,
      name_q: req.query.name_q,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ data: result.rows, total: result.total, limit: result.limit, offset: result.offset });
  } catch (err) {
    console.error('[Books/Journal] listEntries failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// GET /journal/entries/:id
// Full posting detail (both lines + category/matched account info).
// Used by the click-to-reveal audit modal.
router.get('/entries/:id', (req, res) => {
  try {
    const entry = getEntryWithAudit(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Journal entry not found', code: 'NOT_FOUND' });
    res.json({ data: entry });
  } catch (err) {
    console.error('[Books/Journal] getEntry failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// GET /journal/entries/:id/audit
// Just the audit trail (useful for compact UI / future audit browser).
router.get('/entries/:id/audit', (req, res) => {
  try {
    const audit = db.prepare(`
      SELECT id, event, actor, occurred_at, source, source_id, summary, before_json, after_json
      FROM audit_log
      WHERE source = 'journal_entry' AND source_id = ?
      ORDER BY occurred_at DESC, id DESC
    `).all(req.params.id);
    res.json({ data: audit });
  } catch (err) {
    console.error('[Books/Journal] getAudit failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// DELETE /journal/entries/:id
// Removes a journal entry by ID. Used by the demo cleanup + future admin tools.
// Lines cascade via FK; audit rows stay (history) but no longer reference a live entry.
router.delete('/entries/:id', (req, res) => {
  try {
    const existing = db.prepare(`SELECT id FROM journal_entries WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Journal entry not found', code: 'NOT_FOUND' });
    db.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(req.params.id);
    res.json({ data: { success: true, id: req.params.id } });
  } catch (err) {
    console.error('[Books/Journal] delete failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;
