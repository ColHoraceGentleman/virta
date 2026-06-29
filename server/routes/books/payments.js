// Virta Books — Phase B: Payments CRUD + status transition.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/

import { Router } from 'express';
import db, { generateId } from '../../db.js';

const router = Router();

const VALID_METHODS = ['check', 'ach', 'paypal', 'venmo', 'card', 'cash', 'other'];
const ALLOWED_FIELDS = ['invoice_id', 'paid_on', 'method', 'amount', 'reference', 'notes'];

// Sum payments for an invoice, return { total, count }.
function sumPayments(invoiceId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
    FROM payments WHERE invoice_id = ?
  `).get(invoiceId);
  return { total: Number(row.total) || 0, count: Number(row.count) || 0 };
}

// After a payment CRUD op, check if invoice should transition sent → paid.
// IMPORTANT: this function performs writes AND queries (UPDATE for paid transition).
// Callers MUST run it inside a `db.transaction(...)` together with the upstream write so
// the INSERT/UPDATE/DELETE and the status transition are atomic. If something inside
// throws, the whole batch rolls back and no payment is recorded.
function maybeTransitionToPaid(invoiceId) {
  const inv = db.prepare('SELECT id, status, total FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) return null;
  if (inv.status === 'paid' || inv.status === 'void') return inv.status;
  if (inv.status !== 'sent' && inv.status !== 'overdue') return inv.status;
  const { total } = sumPayments(invoiceId);
  if (total + 0.0001 >= Number(inv.total)) {
    db.prepare(`
      UPDATE invoices
      SET status = 'paid', paid_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(invoiceId);
    return 'paid';
  }
  return inv.status;
}

// After deleting a payment, decide whether a `paid` invoice should revert to `sent`.
// Same atomicity requirement: call inside the DELETE transaction.
function maybeRevertPaidToSent(invoiceId) {
  const inv = db.prepare('SELECT id, status, total FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) return null;
  if (inv.status !== 'paid') return inv.status;
  const { total } = sumPayments(invoiceId);
  if (total + 0.0001 < Number(inv.total)) {
    db.prepare(`
      UPDATE invoices
      SET status = 'sent', paid_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(invoiceId);
    return 'sent';
  }
  return 'paid';
}

// ----- Routes ----------------------------------------------------------------

// GET /api/v1/books/payments — list (optional ?invoice_id=, ?unmatched=1)
router.get('/', (req, res) => {
  try {
    const invoiceId = req.query.invoice_id;
    if (invoiceId) {
      const rows = db.prepare(`
        SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_on, created_at
      `).all(invoiceId);
      return res.json({ data: rows });
    }
    // No "unmatched payments" table in v1 — payments are always against an invoice.
    // Return all payments, newest first, with invoice number joined.
    const rows = db.prepare(`
      SELECT p.*, i.number AS invoice_number, i.customer_id, c.name AS customer_name
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      LEFT JOIN customers c ON c.id = i.customer_id
      ORDER BY p.paid_on DESC, p.created_at DESC
    `).all();
    res.json({ data: rows });
  } catch (err) {
    console.error('[Books/Payments] list failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// GET /api/v1/books/payments/:id
router.get('/:id', (req, res) => {
  try {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found', code: 'NOT_FOUND' });
    res.json({ data: payment });
  } catch (err) {
    console.error('[Books/Payments] get failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/payments
// Body: { invoice_id, paid_on, amount, method?, reference?, notes? }
//
// B2 + S6 fix: INSERT payment and any status transition run inside a single
// `db.transaction(...)`. If anything inside throws after the INSERT, the whole thing
// rolls back and no payment is recorded.
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.invoice_id) {
      return res.status(400).json({ error: 'invoice_id is required', code: 'VALIDATION_ERROR' });
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number', code: 'VALIDATION_ERROR' });
    }
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(body.invoice_id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found', code: 'NOT_FOUND' });
    if (invoice.status === 'void') {
      return res.status(409).json({
        error: 'Cannot record a payment against a void invoice.',
        code: 'INVALID_STATE_TRANSITION',
        status: invoice.status,
      });
    }
    if (body.method && !VALID_METHODS.includes(body.method)) {
      return res.status(400).json({ error: `method must be one of ${VALID_METHODS.join('|')}`, code: 'VALIDATION_ERROR' });
    }
    const paidOn = body.paid_on || new Date().toISOString().slice(0, 10);

    const id = generateId();
    let resultingStatus = invoice.status;

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO payments (id, invoice_id, paid_on, method, amount, reference, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        body.invoice_id,
        paidOn,
        body.method || null,
        amount,
        body.reference || null,
        body.notes || null,
      );
      // After payment recorded, flip sent/overdue → paid if sum >= total.
      resultingStatus = maybeTransitionToPaid(body.invoice_id);
    });
    tx();

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    const invoiceAfter = db.prepare('SELECT * FROM invoices WHERE id = ?').get(body.invoice_id);
    const sum = sumPayments(body.invoice_id);
    res.json({
      data: payment,
      invoice_status: invoiceAfter.status,
      invoice_paid_at: invoiceAfter.paid_at,
      payments_total: sum.total,
      invoice_total: invoiceAfter.total,
    });
  } catch (err) {
    console.error('[Books/Payments] create failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// PATCH /api/v1/books/payments/:id
//
// S6 fix: UPDATE payment + any status recompute run inside a single transaction.
router.patch('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Payment not found', code: 'NOT_FOUND' });
    const body = req.body || {};

    if (body.amount !== undefined) {
      const a = Number(body.amount);
      if (!Number.isFinite(a) || a <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number', code: 'VALIDATION_ERROR' });
      }
    }
    if (body.method !== undefined && body.method !== null && !VALID_METHODS.includes(body.method)) {
      return res.status(400).json({ error: `method must be one of ${VALID_METHODS.join('|')}`, code: 'VALIDATION_ERROR' });
    }

    const updates = [];
    const values = [];
    for (const f of ALLOWED_FIELDS) {
      if (body[f] !== undefined && f !== 'invoice_id') {
        // Don't allow moving a payment between invoices via this endpoint.
        updates.push(`${f} = ?`);
        values.push(body[f] === '' ? null : body[f]);
      }
    }
    if (updates.length === 0) {
      return res.json({ data: existing });
    }
    values.push(req.params.id);

    const tx = db.transaction(() => {
      db.prepare(`UPDATE payments SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      // Recompute paid status in case amount changed.
      maybeTransitionToPaid(existing.invoice_id);
    });
    tx();

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    const invoiceAfter = db.prepare('SELECT status, paid_at, total FROM invoices WHERE id = ?').get(existing.invoice_id);
    const sum = sumPayments(existing.invoice_id);
    res.json({
      data: payment,
      invoice_status: invoiceAfter.status,
      invoice_paid_at: invoiceAfter.paid_at,
      payments_total: sum.total,
      invoice_total: invoiceAfter.total,
    });
  } catch (err) {
    console.error('[Books/Payments] update failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// DELETE /api/v1/books/payments/:id
//
// B2 + S5 fix: DELETE payment + any paid → sent revert run inside a single transaction.
// If anything inside throws, the payment is not deleted and the invoice stays paid.
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Payment not found', code: 'NOT_FOUND' });

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
      // After deleting a payment, an invoice that was `paid` may now need to revert to `sent`.
      // Spec is silent on this exact flow, but it's clearly the desired behavior for accuracy:
      // if the remaining sum < total, drop the paid marking. We revert to `sent` (not `overdue`,
      // since the invoice was originally sent). Clear paid_at.
      maybeRevertPaidToSent(existing.invoice_id);
    });
    tx();

    res.json({ data: { success: true, id: req.params.id, invoice_id: existing.invoice_id } });
  } catch (err) {
    console.error('[Books/Payments] delete failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;
