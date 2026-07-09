import { useEffect, useState } from 'react';
import { booksApi } from './api.js';

const STATUS_OPTIONS = [
  { value: '',          label: 'All' },
  { value: 'draft',     label: 'Draft' },
  { value: 'sent',      label: 'Sent' },
  { value: 'paid',      label: 'Paid' },
  { value: 'overdue',   label: 'Overdue' },
  { value: 'void',      label: 'Void' },
];

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

export default function InvoicesList({ navigate }) {
  const [invoices, setInvoices] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    booksApi.listInvoices(status)
      .then(setInvoices)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [status]);

  function statusBadge(s) {
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[s] || 'bg-slate-700 text-slate-200'}`}>
        {s}
      </span>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-light tracking-wide text-slate-100">Invoices</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/books/payments')}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm"
          >
            Payments In
          </button>
          <button
            onClick={() => navigate('/books/invoices/new')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          >
            + New invoice
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value || 'all'}
            onClick={() => setStatus(opt.value)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              status === opt.value
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : invoices.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <p className="text-slate-300 mb-1">No invoices {status ? `with status "${status}"` : 'yet'}.</p>
          <p className="text-slate-500 text-sm mb-4">
            {status === '' ? 'Create your first invoice to get started.' : 'Try a different filter.'}
          </p>
          {status === '' && (
            <button
              onClick={() => navigate('/books/invoices/new')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
            >
              + New invoice
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 border-b border-slate-700 text-slate-400 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5">Number</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Issue date</th>
                <th className="px-4 py-2.5">Due date</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {invoices.map(inv => (
                <tr
                  key={inv.id}
                  onClick={() => navigate(`/books/invoices/${inv.id}`)}
                  className="hover:bg-slate-700/30 cursor-pointer"
                >
                  <td className="px-4 py-2.5 text-slate-100 font-mono">{inv.number}</td>
                  <td className="px-4 py-2.5 text-slate-100">{inv.customer_name || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-300">{inv.issue_date}</td>
                  <td className="px-4 py-2.5 text-slate-300">{inv.due_date}</td>
                  <td className="px-4 py-2.5 text-right text-slate-100">{fmtMoney(inv.total)}</td>
                  <td className="px-4 py-2.5">{statusBadge(inv.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}