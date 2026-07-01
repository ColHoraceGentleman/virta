// Virta Books — Phase C: CSV source mappings CRUD.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 (Mappings, R1, R5).

import { Router } from 'express';
import db from '../../db.js';

const router = Router();

// GET /api/v1/books/source-mappings — list all saved mappings.
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT csm.*, a.code AS memorized_account_code, a.name AS memorized_account_name
      FROM csv_source_mappings csm
      LEFT JOIN accounts a ON a.id = csm.memorized_account_id
      ORDER BY csm.last_used_at DESC, csm.created_at DESC
    `).all();
    res.json({ data: rows });
  } catch (err) {
    console.error('[Books/SourceMappings] list failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/source-mappings — create new mapping.
// Body: { source_key, header_signature, date_col, description_col, amount_col,
//          amount_sign_convention?, memorized_account_id? }
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.source_key || !body.header_signature || !body.date_col || !body.description_col || !body.amount_col) {
      return res.status(400).json({
        error: 'source_key, header_signature, date_col, description_col, amount_col are required',
        code: 'VALIDATION_ERROR',
      });
    }
    const sign = body.amount_sign_convention || 'negative_outflow';
    if (!['negative_outflow', 'positive_outflow'].includes(sign)) {
      return res.status(400).json({
        error: 'amount_sign_convention must be one of negative_outflow|positive_outflow',
        code: 'VALIDATION_ERROR',
      });
    }

    // Validate FK.
    if (body.memorized_account_id) {
      const acc = db.prepare(`SELECT id FROM accounts WHERE id = ?`).get(body.memorized_account_id);
      if (!acc) return res.status(404).json({ error: 'Memorized account not found', code: 'NOT_FOUND' });
    }

    // Reject duplicates on (source_key, header_signature).
    const existing = db.prepare(`
      SELECT id FROM csv_source_mappings WHERE source_key = ? AND header_signature = ?
    `).get(body.source_key, body.header_signature);
    if (existing) {
      return res.status(409).json({
        error: 'A mapping for this (source_key, header_signature) already exists. PATCH it instead.',
        code: 'DUPLICATE',
      });
    }

    const id = db.prepare(`SELECT lower(hex(randomblob(16))) AS id`).get().id;
    db.prepare(`
      INSERT INTO csv_source_mappings
        (id, source_key, header_signature, date_col, description_col, amount_col,
         amount_sign_convention, memorized_account_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.source_key, body.header_signature, body.date_col, body.description_col,
           body.amount_col, sign, body.memorized_account_id || null);

    const row = db.prepare(`
      SELECT csm.*, a.code AS memorized_account_code, a.name AS memorized_account_name
      FROM csv_source_mappings csm
      LEFT JOIN accounts a ON a.id = csm.memorized_account_id
      WHERE csm.id = ?
    `).get(id);
    res.json({ data: row });
  } catch (err) {
    console.error('[Books/SourceMappings] create failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// PATCH /api/v1/books/source-mappings/:id
// Body: { date_col?, description_col?, amount_col?, amount_sign_convention?, memorized_account_id? }
router.patch('/:id', (req, res) => {
  try {
    const existing = db.prepare(`SELECT * FROM csv_source_mappings WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Source mapping not found', code: 'NOT_FOUND' });

    const body = req.body || {};
    const updates = [];
    const values = [];
    for (const f of ['date_col', 'description_col', 'amount_col', 'amount_sign_convention']) {
      if (body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(body[f]);
      }
    }
    if (body.memorized_account_id !== undefined) {
      if (body.memorized_account_id === null || body.memorized_account_id === '') {
        updates.push('memorized_account_id = NULL');
      } else {
        const acc = db.prepare(`SELECT id FROM accounts WHERE id = ?`).get(body.memorized_account_id);
        if (!acc) return res.status(404).json({ error: 'Memorized account not found', code: 'NOT_FOUND' });
        updates.push('memorized_account_id = ?');
        values.push(body.memorized_account_id);
      }
    }
    if (updates.length === 0) return res.json({ data: existing });

    // Always bump last_used_at on edit so recency-sorted lists move it up.
    updates.push(`last_used_at = datetime('now')`);
    values.push(req.params.id);
    db.prepare(`UPDATE csv_source_mappings SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const row = db.prepare(`
      SELECT csm.*, a.code AS memorized_account_code, a.name AS memorized_account_name
      FROM csv_source_mappings csm
      LEFT JOIN accounts a ON a.id = csm.memorized_account_id
      WHERE csm.id = ?
    `).get(req.params.id);
    res.json({ data: row });
  } catch (err) {
    console.error('[Books/SourceMappings] update failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// DELETE /api/v1/books/source-mappings/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare(`SELECT id FROM csv_source_mappings WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Source mapping not found', code: 'NOT_FOUND' });
    db.prepare(`DELETE FROM csv_source_mappings WHERE id = ?`).run(req.params.id);
    res.json({ data: { success: true, id: req.params.id } });
  } catch (err) {
    console.error('[Books/SourceMappings] delete failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;