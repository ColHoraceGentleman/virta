// Virta Books — Phase B: Invoices CRUD + line items + status transitions.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/

import { Router } from 'express';
import db, { generateId } from '../../db.js';
import { renderInvoicePdf } from '../../services/pdf.js';
import { sendInvoiceEmail, isSmtpConfigured, getSmtpSettings } from '../../services/email.js';

const router = Router();

// ----- Helpers ---------------------------------------------------------------

const VALID_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'void'];

// Parse "Net 30" → 30, "Net 45" → 45, "Due on receipt" → 0, "" → null.
function parseTermsDays(terms) {
  if (!terms) return null;
  const s = String(terms).trim();
  if (/^(due on receipt|immediately|receipt)$/i.test(s)) return 0;
  const m = s.match(/net\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  // Numeric-only (e.g. "30") → 30
  const n = parseInt(s, 10);
  if (Number.isFinite(n)) return n;
  return null;
}

// Add `days` to a YYYY-MM-DD date string. Returns YYYY-MM-DD.
function addDaysToDate(yyyy_mm_dd, days) {
  const d = new Date(yyyy_mm_dd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Compute and persist subtotal + total from current line_items rows.
function recomputeInvoiceTotals(invoiceId) {
  const sumRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS subtotal FROM line_items WHERE invoice_id = ?
  `).get(invoiceId);
  const subtotal = Number(sumRow.subtotal) || 0;
  const inv = db.prepare('SELECT tax FROM invoices WHERE id = ?').get(invoiceId);
  const tax = Number(inv?.tax || 0);
  const total = subtotal * (1 + tax / 100);
  db.prepare(`
    UPDATE invoices
    SET subtotal = ?, total = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(subtotal, total, invoiceId);
  return { subtotal, total };
}

// Generate the next invoice number: YYNNN format, scoped per year.
// Uses BEGIN IMMEDIATE inside better-sqlite3's transaction (serialized).
function generateNextInvoiceNumber(year2) {
  const prefix = String(year2);
  const tx = db.transaction(() => {
    const row = db.prepare(`
      SELECT MAX(number) AS max FROM invoices WHERE number LIKE ? || '%'
    `).get(prefix);
    let nextSeq = 1;
    if (row && row.max) {
      const tail = String(row.max).slice(2);
      const seq = parseInt(tail, 10);
      if (Number.isFinite(seq)) nextSeq = seq + 1;
    }
    return prefix + String(nextSeq).padStart(3, '0');
  });
  // Immediate would lock — better-sqlite3 transactions are immediate by default
  // when using db.transaction(...). We're safe here for single-process.
  return tx();
}

// Sum payments for an invoice, return { total, count }.
function sumPayments(invoiceId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM payments WHERE invoice_id = ?
  `).get(invoiceId);
  return { total: Number(row.total) || 0, count: Number(row.count) || 0 };
}

// Apply status transitions based on payment sum.
//   sent  → paid  when sum >= total
//   paid  is sticky (won't regress)
//   other statuses stay as-is
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

// Hydrate an invoice row with its customer + line_items + payments sums.
function hydrate(invoice) {
  if (!invoice) return null;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customer_id);
  const lineItems = db.prepare(`
    SELECT * FROM line_items WHERE invoice_id = ? ORDER BY position, created_at
  `).all(invoice.id);
  const payments = db.prepare(`
    SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_on, created_at
  `).all(invoice.id);
  const paymentSum = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  return {
    ...invoice,
    customer,
    line_items: lineItems,
    payments,
    payments_total: paymentSum,
  };
}

// ----- Routes ----------------------------------------------------------------

// GET /api/v1/books/invoices?status=
router.get('/', (req, res) => {
  try {
    const status = (req.query.status || '').trim();
    let rows;
    if (status && VALID_STATUSES.includes(status)) {
      rows = db.prepare(`
        SELECT i.*, c.name AS customer_name
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.status = ?
        ORDER BY i.issue_date DESC, i.number DESC
      `).all(status);
    } else {
      rows = db.prepare(`
        SELECT i.*, c.name AS customer_name
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        ORDER BY i.issue_date DESC, i.number DESC
      `).all();
    }
    // Lightweight hydration: skip line_items/payments for list view.
    res.json({ data: rows });
  } catch (err) {
    console.error('[Books/Invoices] list failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// GET /api/v1/books/invoices/:id
router.get('/:id', (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found', code: 'NOT_FOUND' });
    res.json({ data: hydrate(invoice) });
  } catch (err) {
    console.error('[Books/Invoices] get failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/invoices
// Body: { customer_id, issue_date, due_date?, payment_terms?, tax?, notes?, line_items? }
// Auto-copies payment_terms from customer if not provided. Auto-computes due_date
// from payment_terms + issue_date if due_date not provided.
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.customer_id) {
      return res.status(400).json({ error: 'customer_id is required', code: 'VALIDATION_ERROR' });
    }
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(body.customer_id);
    if (!customer) return res.status(404).json({ error: 'Customer not found', code: 'NOT_FOUND' });

    const issueDate = body.issue_date || new Date().toISOString().slice(0, 10);
    const terms = body.payment_terms || customer.payment_terms || 'Net 30';
    const termsDays = parseTermsDays(terms);
    let dueDate = body.due_date;
    if (!dueDate && termsDays !== null) {
      dueDate = addDaysToDate(issueDate, termsDays);
    } else if (!dueDate) {
      dueDate = addDaysToDate(issueDate, 30);
    }

    const tax = Number(body.tax || 0);
    if (!Number.isFinite(tax) || tax < 0) {
      return res.status(400).json({ error: 'tax must be a non-negative number', code: 'VALIDATION_ERROR' });
    }

    const year2 = String(new Date().getFullYear()).slice(-2);
    const number = generateNextInvoiceNumber(year2);

    const id = generateId();
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO invoices (id, customer_id, number, issue_date, due_date, payment_terms, status, subtotal, tax, total, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', 0, ?, 0, ?)
      `).run(id, body.customer_id, number, issueDate, dueDate, terms, tax, body.notes || null);

      // Insert line items if provided
      const lineItems = Array.isArray(body.line_items) ? body.line_items : [];
      let position = 1;
      for (const li of lineItems) {
        const desc = String(li.description || '').trim();
        if (!desc) continue;
        const qty = Number(li.quantity || 0);
        const price = Number(li.unit_price || 0);
        const amount = Number.isFinite(qty * price) ? qty * price : 0;
        db.prepare(`
          INSERT INTO line_items (id, invoice_id, position, description, quantity, unit_price, amount)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(generateId(), id, position, desc, qty, price, amount);
        position += 1;
      }
      recomputeInvoiceTotals(id);
    });
    tx();

    const created = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    res.json({ data: hydrate(created) });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Invoice number collision; please retry', code: 'CONFLICT' });
    }
    console.error('[Books/Invoices] create failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// PATCH /api/v1/books/invoices/:id
// Editable fields per spec: draft is fully editable; sent/overdue only allow limited
// edits (notes, payment_terms). paid/void: notes only.
router.patch('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found', code: 'NOT_FOUND' });

    const body = req.body || {};
    const updates = [];
    const values = [];

    // FULLY EDITABLE: only when status = 'draft'
    const fullyEditable = existing.status === 'draft';
    // LIMITED EDIT: notes + payment_terms for sent/overdue
    const limitedEditable = ['sent', 'overdue'].includes(existing.status);
    // READ-ONLY: notes for paid/void
    const readOnly = ['paid', 'void'].includes(existing.status);

    if (readOnly) {
      // Only `notes` is allowed on paid/void. Reject any other field silently? No — reject explicitly.
      const allowedInReadOnly = ['notes'];
      const sentFields = Object.keys(body).filter(k => body[k] !== undefined);
      const rejected = sentFields.filter(k => !allowedInReadOnly.includes(k));
      if (rejected.length > 0) {
        return res.status(409).json({
          error: `Cannot edit ${rejected.join(', ')} on a ${existing.status} invoice.`,
          code: 'INVALID_STATE_TRANSITION',
          status: existing.status,
        });
      }
    }

    if (body.issue_date !== undefined && fullyEditable) {
      updates.push('issue_date = ?'); values.push(body.issue_date);
    }
    if (body.due_date !== undefined && fullyEditable) {
      updates.push('due_date = ?'); values.push(body.due_date);
    }
    // payment_terms is editable on draft + sent/overdue (per spec: editable within invoice)
    let termsChangedFlag = null;
    if (body.payment_terms !== undefined && (fullyEditable || limitedEditable)) {
      const oldTerms = existing.payment_terms;
      const newTerms = String(body.payment_terms).trim() || 'Net 30';
      if (oldTerms !== newTerms) {
        // Fetch customer's current terms to flag for the UI prompt.
        const customer = db.prepare('SELECT payment_terms FROM customers WHERE id = ?').get(existing.customer_id);
        termsChangedFlag = {
          terms_changed: true,
          customer_terms: customer?.payment_terms || null,
          invoice_terms: newTerms,
        };
      }
      updates.push('payment_terms = ?'); values.push(newTerms);
    }
    if (body.tax !== undefined && fullyEditable) {
      const t = Number(body.tax);
      if (!Number.isFinite(t) || t < 0) {
        return res.status(400).json({ error: 'tax must be a non-negative number', code: 'VALIDATION_ERROR' });
      }
      updates.push('tax = ?'); values.push(t);
    }
    if (body.notes !== undefined) {
      updates.push('notes = ?'); values.push(body.notes || null);
    }
    if (body.customer_id !== undefined && fullyEditable) {
      const c = db.prepare('SELECT id FROM customers WHERE id = ?').get(body.customer_id);
      if (!c) return res.status(404).json({ error: 'Customer not found', code: 'NOT_FOUND' });
      updates.push('customer_id = ?'); values.push(body.customer_id);
    }

    // Replace line_items (if provided AND fully editable). Spec says create/update/delete
    // line items; simplest correct model: if `line_items` array is present, replace all.
    let replacedLineItems = null;
    if (Array.isArray(body.line_items)) {
      if (!fullyEditable) {
        return res.status(409).json({
          error: `Cannot modify line items on a ${existing.status} invoice.`,
          code: 'INVALID_STATE_TRANSITION',
          status: existing.status,
        });
      }
      replacedLineItems = body.line_items;
    }

    const tx = db.transaction(() => {
      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        values.push(req.params.id);
        db.prepare(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      }
      if (replacedLineItems !== null) {
        db.prepare('DELETE FROM line_items WHERE invoice_id = ?').run(req.params.id);
        let position = 1;
        for (const li of replacedLineItems) {
          const desc = String(li.description || '').trim();
          if (!desc) continue;
          const qty = Number(li.quantity || 0);
          const price = Number(li.unit_price || 0);
          const amount = Number.isFinite(qty * price) ? qty * price : 0;
          db.prepare(`
            INSERT INTO line_items (id, invoice_id, position, description, quantity, unit_price, amount)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(generateId(), req.params.id, position, desc, qty, price, amount);
          position += 1;
        }
      }
      // Recompute totals whenever line items or tax changed.
      if (replacedLineItems !== null || body.tax !== undefined) {
        recomputeInvoiceTotals(req.params.id);
      }
    });
    tx();

    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    const payload = hydrate(updated);
    if (termsChangedFlag) payload.terms_changed_flag = termsChangedFlag;
    res.json({ data: payload });
  } catch (err) {
    console.error('[Books/Invoices] update failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// DELETE /api/v1/books/invoices/:id
// Drafts only — per spec. Foreign keys cascade line_items but payments are blocked
// because we'd need to know the user wants to keep them.
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found', code: 'NOT_FOUND' });
    if (existing.status !== 'draft') {
      return res.status(409).json({
        error: `Only draft invoices can be deleted. This invoice is ${existing.status}.`,
        code: 'INVALID_STATE_TRANSITION',
        status: existing.status,
      });
    }
    // CASCADE handles line_items. We block if there are payments (shouldn't happen for drafts).
    const payCount = db.prepare('SELECT COUNT(*) AS c FROM payments WHERE invoice_id = ?').get(req.params.id).c;
    if (payCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete an invoice with recorded payments. Void it instead.',
        code: 'INVOICE_HAS_PAYMENTS',
        payments_count: payCount,
      });
    }
    db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
    res.json({ data: { success: true, id: req.params.id } });
  } catch (err) {
    console.error('[Books/Invoices] delete failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/invoices/:id/void
// Soft-delete: sets status = 'void', no row removal.
router.post('/:id/void', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found', code: 'NOT_FOUND' });
    if (existing.status === 'void') return res.json({ data: existing });
    if (existing.status === 'paid') {
      return res.status(409).json({
        error: 'Cannot void a paid invoice. Issue a refund/credit instead.',
        code: 'INVALID_STATE_TRANSITION',
        status: existing.status,
      });
    }
    db.prepare(`
      UPDATE invoices SET status = 'void', updated_at = datetime('now') WHERE id = ?
    `).run(req.params.id);
    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    res.json({ data: hydrate(updated) });
  } catch (err) {
    console.error('[Books/Invoices] void failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/invoices/:id/send
// Renders PDF, sends via SMTP, transitions draft → sent, sets sent_at.
// Returns { invoice, smtp_configured, ... }
router.post('/:id/send', async (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found', code: 'NOT_FOUND' });
    if (existing.status !== 'draft') {
      return res.status(409).json({
        error: `Only draft invoices can be sent. This invoice is ${existing.status}.`,
        code: 'INVALID_STATE_TRANSITION',
        status: existing.status,
      });
    }
    if (!isSmtpConfigured()) {
      return res.status(409).json({
        error: 'SMTP is not configured. Open Settings → Invoices → Email to set it up.',
        code: 'SMTP_NOT_CONFIGURED',
      });
    }
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.customer_id);
    if (!customer || !customer.email) {
      return res.status(409).json({
        error: 'Customer has no email address on file. Add one before sending.',
        code: 'CUSTOMER_NO_EMAIL',
      });
    }
    const settings = db.prepare('SELECT * FROM settings_invoices WHERE id = 1').get();
    const businessName = settings?.business_name || 'Virta Books';

    // 1. Render PDF
    const pdfBuffer = await renderInvoicePdf(req.params.id);
    // 2. Send email with PDF attached
    const subject = `Invoice ${existing.number} from ${businessName}`;
    const text =
      `Hi ${customer.name || 'there'},\n\n` +
      `Please find invoice ${existing.number} attached. Total due: $${Number(existing.total).toFixed(2)}.\n` +
      `Due date: ${existing.due_date}.\n\n` +
      `Thank you!\n${businessName}`;
    await sendInvoiceEmail({
      to: customer.email,
      subject,
      text,
      pdf: { filename: `Invoice-${existing.number}.pdf`, content: pdfBuffer },
    });
    // 3. Transition status
    db.prepare(`
      UPDATE invoices
      SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(req.params.id);

    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    res.json({ data: hydrate(updated) });
  } catch (err) {
    if (err.code === 'SMTP_NOT_CONFIGURED' || err.code === 'SMTP_PASSWORD_MISSING') {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    console.error('[Books/Invoices] send failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// GET /api/v1/books/invoices/:id/pdf — returns the PDF binary
router.get('/:id/pdf', async (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found', code: 'NOT_FOUND' });
    const buffer = await renderInvoicePdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Invoice-${existing.number}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error('[Books/Invoices] PDF render failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/invoices/:id/customer-terms
// Optional helper — when the user accepts the "update customer too?" prompt.
// Updates the customer's payment_terms to the invoice's current terms.
router.post('/:id/customer-terms', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found', code: 'NOT_FOUND' });
    db.prepare(`
      UPDATE customers SET payment_terms = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(existing.payment_terms, existing.customer_id);
    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.customer_id);
    res.json({ data: updated });
  } catch (err) {
    console.error('[Books/Invoices] customer-terms update failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;
// Exported helpers for tests / cron
export { maybeTransitionToPaid, sumPayments, recomputeInvoiceTotals };