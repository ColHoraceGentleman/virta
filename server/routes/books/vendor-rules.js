// Virta Books — Phase C: Vendor rules CRUD.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 + §6 (vendor rules: 3+ manual categorizations → prompt to create).

import { Router } from 'express';
import db from '../../db.js';
import { categorizeTransaction, applyVendorRulesToNewTransactions } from './imports.js';

const router = Router();

// GET /api/v1/books/vendor-rules — list all (active + inactive).
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT vr.*, a.code AS category_code, a.name AS category_name
      FROM vendor_rules vr
      LEFT JOIN accounts a ON a.id = vr.category_account_id
      ORDER BY vr.vendor_pattern
    `).all();
    res.json({ data: rows });
  } catch (err) {
    console.error('[Books/VendorRules] list failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/vendor-rules
// Body: { vendor_pattern, category_account_id, apply_to_existing?: bool }
// When apply_to_existing is true (default), retroactively applies the rule to all
// uncategorized transactions matching the vendor pattern.
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.vendor_pattern || !String(body.vendor_pattern).trim()) {
      return res.status(400).json({ error: 'vendor_pattern is required', code: 'VALIDATION_ERROR' });
    }
    if (!body.category_account_id) {
      return res.status(400).json({ error: 'category_account_id is required', code: 'VALIDATION_ERROR' });
    }
    const cat = db.prepare(`SELECT id FROM accounts WHERE id = ?`).get(body.category_account_id);
    if (!cat) return res.status(404).json({ error: 'Category account not found', code: 'NOT_FOUND' });

    const pattern = String(body.vendor_pattern).trim().toLowerCase();
    const applyExisting = body.apply_to_existing !== false; // default true

    // Check for existing rule with the same pattern + category.
    const existing = db.prepare(`
      SELECT id FROM vendor_rules WHERE vendor_pattern = ? AND category_account_id = ?
    `).get(pattern, body.category_account_id);
    if (existing) {
      const row = db.prepare(`SELECT * FROM vendor_rules WHERE id = ?`).get(existing.id);
      return res.status(409).json({
        error: 'A rule with this pattern + category already exists',
        code: 'DUPLICATE',
        data: row,
      });
    }

    const id = db.prepare(`SELECT lower(hex(randomblob(16))) AS id`).get().id;
    db.prepare(`
      INSERT INTO vendor_rules (id, vendor_pattern, category_account_id, match_count, is_active)
      VALUES (?, ?, ?, 0, 1)
    `).run(id, pattern, body.category_account_id);

    let appliedCount = 0;
    if (applyExisting) {
      // Find all uncategorized transactions whose vendor_normalized contains the pattern.
      const candidates = db.prepare(`
        SELECT id FROM transactions
        WHERE status = 'uncategorized'
          AND vendor_normalized IS NOT NULL
          AND vendor_normalized LIKE ? ESCAPE '\\'
      `).all(`%${pattern.replace(/[%_\\]/g, '\\$&')}%`);
      const ids = candidates.map(c => c.id);
      if (ids.length > 0) {
        appliedCount = applyVendorRulesToNewTransactions(ids);
      }
    }

    // Update match_count to reflect retroactively categorized rows (including any
    // already-categorized rows that match — informational only).
    const matchCount = db.prepare(`
      SELECT COUNT(*) AS c FROM transactions
      WHERE vendor_normalized IS NOT NULL
        AND vendor_normalized LIKE ? ESCAPE '\\'
    `).get(`%${pattern.replace(/[%_\\]/g, '\\$&')}%`).c;
    db.prepare(`UPDATE vendor_rules SET match_count = ? WHERE id = ?`).run(matchCount, id);

    const row = db.prepare(`
      SELECT vr.*, a.code AS category_code, a.name AS category_name
      FROM vendor_rules vr LEFT JOIN accounts a ON a.id = vr.category_account_id
      WHERE vr.id = ?
    `).get(id);

    res.json({ data: row, applied_to_existing: appliedCount });
  } catch (err) {
    console.error('[Books/VendorRules] create failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// PATCH /api/v1/books/vendor-rules/:id
// Body: { vendor_pattern?, category_account_id?, is_active? }
router.patch('/:id', (req, res) => {
  try {
    const existing = db.prepare(`SELECT * FROM vendor_rules WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Vendor rule not found', code: 'NOT_FOUND' });

    const body = req.body || {};
    const updates = [];
    const values = [];
    if (body.vendor_pattern !== undefined) {
      updates.push('vendor_pattern = ?');
      values.push(String(body.vendor_pattern).trim().toLowerCase());
    }
    if (body.category_account_id !== undefined) {
      const cat = db.prepare(`SELECT id FROM accounts WHERE id = ?`).get(body.category_account_id);
      if (!cat) return res.status(404).json({ error: 'Category account not found', code: 'NOT_FOUND' });
      updates.push('category_account_id = ?');
      values.push(body.category_account_id);
    }
    if (body.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(body.is_active ? 1 : 0);
    }
    if (updates.length === 0) return res.json({ data: existing });

    values.push(req.params.id);
    db.prepare(`UPDATE vendor_rules SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const row = db.prepare(`
      SELECT vr.*, a.code AS category_code, a.name AS category_name
      FROM vendor_rules vr LEFT JOIN accounts a ON a.id = vr.category_account_id
      WHERE vr.id = ?
    `).get(req.params.id);
    res.json({ data: row });
  } catch (err) {
    console.error('[Books/VendorRules] update failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// DELETE /api/v1/books/vendor-rules/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare(`SELECT id FROM vendor_rules WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Vendor rule not found', code: 'NOT_FOUND' });
    db.prepare(`DELETE FROM vendor_rules WHERE id = ?`).run(req.params.id);
    res.json({ data: { success: true, id: req.params.id } });
  } catch (err) {
    console.error('[Books/VendorRules] delete failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;