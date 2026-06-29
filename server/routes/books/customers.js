import { Router } from 'express';
import db, { generateId } from '../../db.js';

const router = Router();

const ALLOWED_FIELDS = [
  'name', 'company', 'email',
  'address_line1', 'address_line2',
  'city', 'state', 'postal', 'country',
  'payment_terms', 'notes', 'is_active',
];

// Validate email format (loose — RFC-perfect is overkill for a single-user app)
function isValidEmail(s) {
  if (!s) return true; // empty is allowed
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// GET /api/v1/books/customers — list, optional ?q= substring match on name/company/email
router.get('/', (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let rows;
    if (q) {
      const like = `%${q}%`;
      rows = db.prepare(`
        SELECT * FROM customers
        WHERE name LIKE ? OR company LIKE ? OR email LIKE ?
        ORDER BY name COLLATE NOCASE
      `).all(like, like, like);
    } else {
      rows = db.prepare(`SELECT * FROM customers ORDER BY name COLLATE NOCASE`).all();
    }
    res.json({ data: rows });
  } catch (err) {
    console.error('[Books/Customers] list failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// GET /api/v1/books/customers/:id
router.get('/:id', (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found', code: 'NOT_FOUND' });
    res.json({ data: customer });
  } catch (err) {
    console.error('[Books/Customers] get failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/customers
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    const name = (body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' });
    }
    if (!isValidEmail(body.email)) {
      return res.status(400).json({ error: 'email is not a valid email address', code: 'VALIDATION_ERROR' });
    }
    const id = generateId();
    db.prepare(`
      INSERT INTO customers (
        id, name, company, email,
        address_line1, address_line2, city, state, postal, country,
        payment_terms, notes, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      name,
      body.company || null,
      body.email || null,
      body.address_line1 || null,
      body.address_line2 || null,
      body.city || null,
      body.state || null,
      body.postal || null,
      body.country || null,
      body.payment_terms || 'Net 30',
      body.notes || null,
    );
    const created = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.json({ data: created });
  } catch (err) {
    console.error('[Books/Customers] create failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// PATCH /api/v1/books/customers/:id
router.patch('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Customer not found', code: 'NOT_FOUND' });
    const body = req.body || {};

    if (body.name !== undefined && !String(body.name).trim()) {
      return res.status(400).json({ error: 'name cannot be empty', code: 'VALIDATION_ERROR' });
    }
    if (body.email !== undefined && !isValidEmail(body.email)) {
      return res.status(400).json({ error: 'email is not a valid email address', code: 'VALIDATION_ERROR' });
    }

    const updates = [];
    const values = [];
    for (const f of ALLOWED_FIELDS) {
      if (body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(f === 'is_active' ? (body[f] ? 1 : 0) : body[f]);
      }
    }
    if (updates.length === 0) {
      return res.json({ data: existing });
    }
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  } catch (err) {
    console.error('[Books/Customers] update failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// DELETE /api/v1/books/customers/:id
// Phase A: no invoices yet, so this always succeeds cleanly. Same shape as Phase B
// will be (return 409 if referenced).
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Customer not found', code: 'NOT_FOUND' });

    // Future-proofing: if invoices exist later, block delete with 409.
    try {
      const invCount = db.prepare('SELECT COUNT(*) as c FROM invoices WHERE customer_id = ?').get(req.params.id).c;
      if (invCount > 0) {
        return res.status(409).json({
          error: `Customer has ${invCount} invoices. Delete or reassign those first.`,
          code: 'CUSTOMER_IN_USE',
          invoice_count: invCount,
        });
      }
    } catch (e) { /* invoices table doesn't exist yet in Phase A — ok */ }

    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    res.json({ data: { success: true, id: req.params.id } });
  } catch (err) {
    console.error('[Books/Customers] delete failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;