// Virta Books — Phase B: Payments In screen.
// Shows payments recorded against invoices (no separate "queue of payments to record"
// in v1 since invoices are the entry point — you have to send an invoice to bill).
// Provides a quick way to filter / confirm / link recorded payments to open invoices.
// Per spec, this also handles non-invoiced revenue (a payment that came in but isn't
// tied to any invoice). v1: allow listing payments + their invoice match status.

import { useEffect, useState, useMemo } from 'react';
import { booksApi } from './api.js';

function fmtMoney(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : '—';
}

const STATUS_STYLE = {
  draft:   'bg-slate-700 text-slate-200',
  sent:    'bg-blue-900/50 text-blue-200',
  paid:    'bg-emerald-900/50 text-emerald-200',
  overdue: 'bg-red-900/50 text-red-200',
  void:    'bg-slate-800 text-slate-500',
};

export default function PaymentsIn({ navigate }) {
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      booksApi.listPayments(),
      booksApi.listInvoices(),
    ])
      .then(([pays, invs]) => { setPayments(pays); setInvoices(invs); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  // For each payment, find a candidate open invoice from the same customer with
  // balance >= payment amount (or close to it).
  const candidatesByPayment = useMemo(() => {
    const map = new Map();
    const openInvoices = invoices.filter(i => ['sent', 'overdue'].includes(i.status));
    for (const p of payments) {
      const matches = openInvoices
        .filter(i => i.customer_id === p.customer_id)
        .filter(i => Math.abs(Number(i.total) - Number(p.amount)) < 0.01 // exact match
                  || (Number(i.total) - (Number(invoices.find(x => x.id === i.id)?.payments_total || 0))) >= Number(p.amount))
        .slice(0, 3);
      map.set(p.id, matches);
    }
    return map;
  }, [payments, invoices]);

  const filtered = useMemo(() => {
    if (!q.trim()) return payments;
    const needle = q.trim().toLowerCase();
    return payments.filter(p =>
      (p.invoice_number || '').toLowerCase().includes(needle) ||
      (p.customer_name || '').toLowerCase().includes(needle) ||
      (p.reference || '').toLowerCase().includes(needle) ||
      String(p.amount).includes(needle)
    );
  }, [payments, q]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-slate-100">Payments In</h1>
          <p className="text-slate-400 text-sm mt-1">Recorded payments, matched against open invoices.</p>
        </div>
        <button
          onClick={() => navigate('/books/invoices')}
          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm"
        >
          ← Invoices
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by invoice #, customer, reference, amount…"
          className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <p className="text-slate-300 mb-1">No payments recorded yet.</p>
          <p className="text-slate-500 text-sm">
            Send an invoice first, then record payments from the invoice view.
          </p>
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 border-b border-slate-700 text-slate-400 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5">Paid on</th>
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5">Reference</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Match candidates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filtered.map(p => {
                const candidates = candidatesByPayment.get(p.id) || [];
                const onInvoice = p.invoice_id && invoices.find(i => i.id === p.invoice_id);
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 text-slate-100">{p.paid_on}</td>
                    <td className="px-4 py-2.5">
                      {onInvoice ? (
                        <button onClick={() => navigate(`/books/invoices/${onInvoice.id}`)}
                          className="text-indigo-400 hover:text-indigo-300 font-mono text-xs">
                          {onInvoice.number}
                        </button>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{p.customer_name || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-300">{p.method || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-300">{p.reference || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-300">{fmtMoney(p.amount)}</td>
                    <td className="px-4 py-2.5">
                      {candidates.length === 0 ? (
                        <span className="text-xs text-slate-500">No open match</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {candidates.map(c => (
                            <button
                              key={c.id}
                              onClick={() => navigate(`/books/invoices/${c.id}`)}
                              className="text-xs px-2 py-0.5 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-200"
                              title={c.status}
                            >
                              {c.number} <span className={`ml-1 ${STATUS_STYLE[c.status] || ''} px-1 rounded`}>{c.status}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-xs text-slate-500">
        Note: "Non-invoiced revenue" entries (a payment received without an invoice) aren't modeled
        in v1 — invoices are the entry point. Add a draft invoice for any ad-hoc income, send it,
        then record the payment.
      </div>
    </div>
  );
}