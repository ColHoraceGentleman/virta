import { useEffect, useState } from 'react';
import { booksApi } from './api.js';

// Phase A dashboard skeleton.
// Per spec: "renders 'Books dashboard' + a count of customers + a count of accounts.
// Stub KPIs only. Full dashboard lands in Phase F."
export default function Dashboard({ navigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accounts, customers, invoices] = await Promise.all([
          booksApi.listAccounts(),
          booksApi.listCustomers(),
          booksApi.listInvoices(),
        ]);
        if (!cancelled) setData({ accounts, customers, invoices });
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function kpiTile(label, value, sublabel) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">{label}</div>
        <div className="text-3xl font-light text-slate-100">{value}</div>
        {sublabel && <div className="text-xs text-slate-500 mt-2">{sublabel}</div>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-slate-100">Books dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Phase B · Invoicing. Full KPIs land in Phase F.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-slate-400 text-sm">Loading…</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {kpiTile('Accounts', data.accounts.length, 'chart of accounts seeded')}
            {kpiTile('Customers', data.customers.length, 'in your books')}
            {kpiTile('Invoices', data.invoices.length, 'all statuses')}
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-4">
            <h2 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-3">Quick actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <button
                onClick={() => navigate('/books/invoices/new')}
                className="text-left p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 transition-colors"
              >
                <div className="text-slate-100 text-sm font-medium">+ New invoice</div>
                <div className="text-slate-400 text-xs mt-1">Create a draft, line items, totals auto-compute</div>
              </button>
              <button
                onClick={() => navigate('/books/customers/new')}
                className="text-left p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 transition-colors"
              >
                <div className="text-slate-100 text-sm font-medium">+ New customer</div>
                <div className="text-slate-400 text-xs mt-1">Add someone you invoice</div>
              </button>
              <button
                onClick={() => navigate('/books/settings/invoices')}
                className="text-left p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 transition-colors"
              >
                <div className="text-slate-100 text-sm font-medium">🧾 Invoice settings</div>
                <div className="text-slate-400 text-xs mt-1">SMTP, auto-overdue, business identity</div>
              </button>
              <button
                onClick={() => navigate('/books/settings/accounts')}
                className="text-left p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 transition-colors"
              >
                <div className="text-slate-100 text-sm font-medium">⚙️ Chart of accounts</div>
                <div className="text-slate-400 text-xs mt-1">View, edit, merge, delete</div>
              </button>
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5">
            <h2 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-2">Coming in later phases</h2>
            <ul className="text-sm text-slate-400 space-y-1 list-disc list-inside">
              <li><strong>C:</strong> CSV import (Chase, AmEx, PayPal, Venmo, generic)</li>
              <li><strong>D:</strong> Categorization review UI + vendor rules</li>
              <li><strong>E:</strong> AR aging + Schedule C export</li>
              <li><strong>F:</strong> Asset register + full profitability dashboard</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}