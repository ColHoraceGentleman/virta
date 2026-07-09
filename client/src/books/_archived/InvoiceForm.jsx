import { useEffect, useState, useMemo } from 'react';
import { booksApi } from './api.js';

const EMPTY_LINE = { description: '', quantity: 1, unit_price: 0 };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(yyyy_mm_dd, days) {
  const d = new Date(yyyy_mm_dd + 'T00:00:00');
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function parseNetDays(terms) {
  if (!terms) return null;
  const s = String(terms).trim();
  if (/^(due on receipt|receipt|immediately)/i.test(s)) return 0;
  const m = s.match(/net\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function fmtMoney(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : '$0.00';
}

export default function InvoiceForm({ navigate, invoiceId }) {
  const isEdit = !!invoiceId;
  const [loading, setLoading] = useState(isEdit);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [customerTerms, setCustomerTerms] = useState('Net 30');
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(addDays(todayIso(), 30));
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [termsTouched, setTermsTouched] = useState(false); // user explicitly changed the terms
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState([{ ...EMPTY_LINE }]);
  const [originalCustomerId, setOriginalCustomerId] = useState('');
  const [originalTerms, setOriginalTerms] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [termsChangePrompt, setTermsChangePrompt] = useState(null); // { customerTerms, invoiceTerms }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await booksApi.listCustomers();
        if (!cancelled) setCustomers(list);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const inv = await booksApi.getInvoice(invoiceId);
        if (cancelled) return;
        setCustomerId(inv.customer_id);
        setOriginalCustomerId(inv.customer_id);
        setIssueDate(inv.issue_date);
        setDueDate(inv.due_date);
        setPaymentTerms(inv.payment_terms);
        setOriginalTerms(inv.payment_terms);
        setTermsTouched(true); // existing value is "set"
        setTax(Number(inv.tax || 0));
        setNotes(inv.notes || '');
        setLineItems((inv.line_items || []).length > 0
          ? inv.line_items.map(li => ({
              id: li.id,
              description: li.description,
              quantity: Number(li.quantity),
              unit_price: Number(li.unit_price),
            }))
          : [{ ...EMPTY_LINE }]);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [invoiceId, isEdit]);

  // When customer changes, update default payment_terms + recompute due date.
  useEffect(() => {
    if (!customerId) return;
    const c = customers.find(c => c.id === customerId);
    if (!c) return;
    setCustomerTerms(c.payment_terms || 'Net 30');
    if (!termsTouched) {
      // First-load (new invoice) or customer just changed — adopt customer terms + recompute due.
      const days = parseNetDays(c.payment_terms);
      setPaymentTerms(c.payment_terms || 'Net 30');
      if (days !== null) setDueDate(addDays(issueDate, days));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // When user edits payment_terms explicitly, recompute due_date (unless they've also touched due_date — we just always recompute when terms change).
  useEffect(() => {
    if (!termsTouched) return;
    const days = parseNetDays(paymentTerms);
    if (days !== null) setDueDate(addDays(issueDate, days));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentTerms]);

  // When issue date changes, recompute due date from current terms.
  useEffect(() => {
    const days = parseNetDays(paymentTerms);
    if (days !== null) setDueDate(addDays(issueDate, days));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueDate]);

  const subtotal = useMemo(
    () => lineItems.reduce((acc, li) => acc + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0),
    [lineItems]
  );
  const total = subtotal * (1 + (Number(tax) || 0) / 100);

  function setLineItem(idx, patch) {
    setLineItems(items => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addLine() {
    setLineItems(items => [...items, { ...EMPTY_LINE, position: items.length + 1 }]);
  }
  function removeLine(idx) {
    setLineItems(items => items.filter((_, i) => i !== idx));
  }
  function moveLine(idx, dir) {
    setLineItems(items => {
      const next = [...items];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return items;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Filter out empty line items
      const cleanLines = lineItems
        .filter(li => String(li.description || '').trim() !== '')
        .map(li => ({
          description: String(li.description).trim(),
          quantity: Number(li.quantity) || 0,
          unit_price: Number(li.unit_price) || 0,
        }));
      if (cleanLines.length === 0) {
        throw new Error('Add at least one line item with a description.');
      }
      const payload = {
        customer_id: customerId,
        issue_date: issueDate,
        due_date: dueDate,
        payment_terms: paymentTerms,
        tax: Number(tax) || 0,
        notes: notes || null,
        line_items: cleanLines,
      };
      let saved;
      if (isEdit) {
        saved = await booksApi.updateInvoice(invoiceId, payload);
        // If the backend flagged a terms change, prompt.
        if (saved.terms_changed_flag) {
          setTermsChangePrompt({
            customerTerms: saved.terms_changed_flag.customer_terms,
            invoiceTerms: saved.terms_changed_flag.invoice_terms,
          });
        }
      } else {
        saved = await booksApi.createInvoice(payload);
      }
      navigate(`/books/invoices/${saved.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function applyTermsToCustomer() {
    try {
      await booksApi.applyCustomerTerms(invoiceId);
      setTermsChangePrompt(null);
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-light tracking-wide text-slate-100 mb-4">
        {isEdit ? 'Edit invoice' : 'New invoice'}
      </h1>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
        {/* Customer + dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Customer *</div>
            <select
              value={customerId}
              onChange={e => { setCustomerId(e.target.value); setTermsTouched(false); }}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="">— Pick a customer —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Issue date</div>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500" />
            </label>
            <label className="block">
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Due date</div>
              <input type="date" value={dueDate} onChange={e => { setDueDate(e.target.value); setTermsTouched(true); }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500" />
            </label>
          </div>
        </div>

        {/* Terms + tax */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Payment terms</div>
            <input
              type="text"
              value={paymentTerms}
              onChange={e => { setPaymentTerms(e.target.value); setTermsTouched(true); }}
              placeholder="Net 30"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <div className="text-xs text-slate-500 mt-1">Customer default: {customerTerms || '—'}</div>
          </label>
          <label className="block">
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Tax (%)</div>
            <input
              type="number" min="0" step="0.01"
              value={tax}
              onChange={e => setTax(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </label>
          <div className="text-right pt-6">
            <div className="text-xs text-slate-400">Subtotal: <span className="text-slate-100">{fmtMoney(subtotal)}</span></div>
            <div className="text-lg text-slate-100 font-light mt-1">Total: {fmtMoney(total)}</div>
          </div>
        </div>

        {/* Line items */}
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Line items</div>
          <div className="space-y-2">
            {lineItems.map((li, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                <input
                  type="text"
                  placeholder="Description"
                  value={li.description}
                  onChange={e => setLineItem(idx, { description: e.target.value })}
                  className="col-span-6 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="number" min="0" step="0.01"
                  placeholder="Qty"
                  value={li.quantity}
                  onChange={e => setLineItem(idx, { quantity: e.target.value })}
                  className="col-span-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 text-right"
                />
                <input
                  type="number" min="0" step="0.01"
                  placeholder="Unit price"
                  value={li.unit_price}
                  onChange={e => setLineItem(idx, { unit_price: e.target.value })}
                  className="col-span-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 text-right"
                />
                <div className="col-span-2 flex items-center gap-1">
                  <span className="text-sm text-slate-300 flex-1 text-right">
                    {fmtMoney((Number(li.quantity) || 0) * (Number(li.unit_price) || 0))}
                  </span>
                  <button type="button" onClick={() => moveLine(idx, -1)} disabled={idx === 0}
                    className="text-slate-500 hover:text-slate-200 disabled:opacity-30 px-1 text-xs">↑</button>
                  <button type="button" onClick={() => moveLine(idx, +1)} disabled={idx === lineItems.length - 1}
                    className="text-slate-500 hover:text-slate-200 disabled:opacity-30 px-1 text-xs">↓</button>
                  <button type="button" onClick={() => removeLine(idx)}
                    className="text-red-400 hover:text-red-300 px-1 text-xs">×</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addLine}
            className="mt-2 text-sm text-indigo-400 hover:text-indigo-300">+ Add line</button>
        </div>

        {/* Notes */}
        <label className="block">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Notes</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </label>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create invoice')}
          </button>
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/books/invoices/${invoiceId}` : '/books/invoices')}
            className="px-4 py-2 text-slate-300 hover:text-white text-sm"
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Terms-change modal */}
      {termsChangePrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-lg font-medium text-slate-100 mb-2">Update customer's default terms?</h2>
            <p className="text-sm text-slate-300 mb-4">
              You changed the invoice's payment terms to <strong>{termsChangePrompt.invoiceTerms}</strong>.
              The customer's default is currently <strong>{termsChangePrompt.customerTerms || 'Net 30'}</strong>.
            </p>
            <p className="text-sm text-slate-300 mb-5">
              Update the customer's default so future invoices inherit the new terms — or keep this as a one-time change?
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setTermsChangePrompt(null)}
                className="px-4 py-2 text-slate-300 hover:text-white text-sm"
              >
                Keep one-time
              </button>
              <button
                onClick={applyTermsToCustomer}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
              >
                Update customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}