import { useEffect, useState } from 'react';
import { booksApi } from './api.js';

const STATUS_STYLE = {
  draft:   'bg-slate-700 text-slate-200',
  sent:    'bg-blue-900/50 text-blue-200',
  paid:    'bg-emerald-900/50 text-emerald-200',
  overdue: 'bg-red-900/50 text-red-200',
  void:    'bg-slate-800 text-slate-500',
};

function fmtMoney(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : '—';
}

export default function InvoiceView({ navigate, invoiceId }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionInFlight, setActionInFlight] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    booksApi.getInvoice(invoiceId)
      .then(setInvoice)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [invoiceId]);

  async function handleSend() {
    if (!confirm(`Send invoice ${invoice.number} to ${invoice.customer.email}?`)) return;
    setActionInFlight('send');
    setError(null);
    try {
      await booksApi.sendInvoice(invoiceId);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleVoid() {
    if (!confirm(`Void invoice ${invoice.number}? This is a soft-delete — the record stays for accounting trail.`)) return;
    setActionInFlight('void');
    setError(null);
    try {
      await booksApi.voidInvoice(invoiceId);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleDelete() {
    if (!confirm(`Permanently delete invoice ${invoice.number}? Only drafts can be deleted.`)) return;
    setActionInFlight('delete');
    setError(null);
    try {
      await booksApi.deleteInvoice(invoiceId);
      navigate('/books/invoices');
    } catch (e) {
      setError(e.message);
      setActionInFlight(null);
    }
  }

  if (loading) return <div className="text-slate-400 text-sm">Loading…</div>;
  if (!invoice) return null;

  const balance = Number(invoice.total) - Number(invoice.payments_total || 0);
  const isDraft = invoice.status === 'draft';
  const isVoid  = invoice.status === 'void';
  const isPaid  = invoice.status === 'paid';
  const isSentOrOverdue = ['sent', 'overdue'].includes(invoice.status);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-light tracking-wide text-slate-100 font-mono">{invoice.number}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[invoice.status] || 'bg-slate-700 text-slate-200'}`}>
            {invoice.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <button
              onClick={() => navigate(`/books/invoices/${invoiceId}/edit`)}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm"
            >
              Edit
            </button>
          )}
          <a
            href={booksApi.invoicePdfUrl(invoiceId)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm"
          >
            Download PDF
          </a>
          {isDraft && (
            <button
              onClick={handleSend}
              disabled={actionInFlight === 'send'}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {actionInFlight === 'send' ? 'Sending…' : 'Send'}
            </button>
          )}
          {isSentOrOverdue && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium"
            >
              Record Payment
            </button>
          )}
          {(isSentOrOverdue || isDraft) && !isPaid && !isVoid && (
            <button
              onClick={handleVoid}
              disabled={actionInFlight === 'void'}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm disabled:opacity-50"
            >
              {actionInFlight === 'void' ? 'Voiding…' : 'Void'}
            </button>
          )}
          {isDraft && (
            <button
              onClick={handleDelete}
              disabled={actionInFlight === 'delete'}
              className="px-3 py-2 bg-red-900/40 hover:bg-red-900/60 text-red-200 rounded-lg text-sm disabled:opacity-50"
            >
              {actionInFlight === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {/* Top section: meta + customer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Details</div>
          <Row label="Issue date" value={invoice.issue_date} />
          <Row label="Due date" value={invoice.due_date} />
          <Row label="Payment terms" value={invoice.payment_terms} />
          {invoice.sent_at && <Row label="Sent at" value={invoice.sent_at} />}
          {invoice.paid_at && <Row label="Paid at" value={invoice.paid_at} />}
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Bill To</div>
          <div className="text-slate-100">{invoice.customer?.name}</div>
          {invoice.customer?.company && <div className="text-slate-300 text-sm">{invoice.customer.company}</div>}
          {invoice.customer?.email && <div className="text-slate-400 text-sm mt-1">{invoice.customer.email}</div>}
          {invoice.customer?.address_line1 && <div className="text-slate-400 text-sm mt-2">{invoice.customer.address_line1}</div>}
          {invoice.customer?.address_line2 && <div className="text-slate-400 text-sm">{invoice.customer.address_line2}</div>}
          {(invoice.customer?.city || invoice.customer?.state || invoice.customer?.postal) && (
            <div className="text-slate-400 text-sm">
              {[invoice.customer?.city, invoice.customer?.state].filter(Boolean).join(', ')}
              {invoice.customer?.postal ? ` ${invoice.customer.postal}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* Line items */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
          Line items
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-400 text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-center">QTY</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {(invoice.line_items || []).map(li => (
              <tr key={li.id}>
                <td className="px-4 py-2 text-slate-100">{li.description}</td>
                <td className="px-4 py-2 text-center text-slate-300">{li.quantity}</td>
                <td className="px-4 py-2 text-right text-slate-300">{fmtMoney(li.unit_price)}</td>
                <td className="px-4 py-2 text-center text-slate-100">{fmtMoney(li.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-4">
        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between text-sm py-1">
              <span className="text-slate-400">Subtotal</span>
              <span className="text-slate-100">{fmtMoney(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-slate-400">Tax ({Number(invoice.tax || 0).toFixed(1)}%)</span>
              <span className="text-slate-100">{fmtMoney((Number(invoice.subtotal || 0)) * (Number(invoice.tax || 0) / 100))}</span>
            </div>
            <div className="flex justify-between text-base py-2 mt-1 border-t border-slate-700">
              <span className="text-slate-200">Total</span>
              <span className="text-slate-100">{fmtMoney(invoice.total)}</span>
            </div>
            {invoice.payments && invoice.payments.length > 0 && (
              <>
                <div className="flex justify-between text-sm py-1">
                  <span className="text-slate-400">Paid</span>
                  <span className="text-emerald-300">{fmtMoney(invoice.payments_total)}</span>
                </div>
                <div className="flex justify-between text-base py-2 mt-1 border-t border-slate-700">
                  <span className="text-slate-200">Balance</span>
                  <span className={balance > 0 ? 'text-red-300' : 'text-slate-100'}>{fmtMoney(balance)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Payments list */}
      {invoice.payments && invoice.payments.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
            Payments
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-slate-400 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {invoice.payments.map(p => (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  onDelete={async () => {
                    if (!confirm(`Delete this ${fmtMoney(p.amount)} payment?`)) return;
                    try {
                      await booksApi.deletePayment(p.id);
                      load();
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {invoice.notes && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-4">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Notes</div>
          <div className="text-sm text-slate-200 whitespace-pre-wrap">{invoice.notes}</div>
        </div>
      )}

      <div className="mt-4">
        <button
          onClick={() => navigate('/books/invoices')}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← Back to invoices
        </button>
      </div>

      {/* Payment modal */}
      {showPaymentModal && (
        <RecordPaymentModal
          invoice={invoice}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => { setShowPaymentModal(false); load(); }}
        />
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100">{value}</span>
    </div>
  );
}

function PaymentRow({ payment, onDelete }) {
  return (
    <tr>
      <td className="px-4 py-2 text-slate-100">{payment.paid_on}</td>
      <td className="px-4 py-2 text-slate-300">{payment.method || '—'}</td>
      <td className="px-4 py-2 text-slate-300">{payment.reference || '—'}</td>
      <td className="px-4 py-2 text-right text-emerald-300">{fmtMoney(payment.amount)}</td>
      <td className="px-4 py-2 text-right">
        <button onClick={onDelete} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
      </td>
    </tr>
  );
}

function RecordPaymentModal({ invoice, onClose, onSaved }) {
  const balance = Number(invoice.total) - Number(invoice.payments_total || 0);
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState('check');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await booksApi.createPayment({
        invoice_id: invoice.id,
        paid_on: paidOn,
        amount: Number(amount),
        method,
        reference: reference || null,
        notes: notes || null,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full">
        <h2 className="text-lg font-medium text-slate-100 mb-1">Record payment</h2>
        <p className="text-sm text-slate-400 mb-4">For invoice <span className="font-mono">{invoice.number}</span> · balance {fmtMoney(balance)}</p>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-2 mb-3 text-sm">{error}</div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Paid on</div>
              <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500" />
            </label>
            <label className="block">
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Amount</div>
              <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500" />
            </label>
          </div>
          <label className="block">
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Method</div>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500">
              <option value="check">Check</option>
              <option value="ach">ACH</option>
              <option value="paypal">PayPal</option>
              <option value="venmo">Venmo</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block">
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Reference</div>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="check #, transaction id, …"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
          </label>
          <label className="block">
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Notes</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
          </label>
        </div>

        <div className="flex items-center gap-3 mt-5 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-300 hover:text-white text-sm">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </form>
    </div>
  );
}