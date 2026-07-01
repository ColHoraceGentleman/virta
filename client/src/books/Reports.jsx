// Virta Books — Phase D: Reports
//   Two tabs:
//     - AR Aging: JSON report, bucketed by days past due, grouped by customer.
//     - Schedule C Export: pick a year and download a ZIP of 3 CSVs.

import { useEffect, useState, useCallback } from 'react';
import { booksApi } from './api.js';

const dm = true; // single dark theme for now

const BUCKET_HEADERS = [
  { key: 'current', label: 'Current' },
  { key: 'days_30', label: '1–30' },
  { key: 'days_60', label: '31–60' },
  { key: 'days_90', label: '61–90' },
  { key: 'days_90_plus', label: '90+' },
];

function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm rounded-t border-b-2 transition-colors ${
        active
          ? 'border-indigo-500 text-white bg-slate-800'
          : dm
          ? 'border-transparent text-slate-400 hover:text-white hover:bg-slate-800/60'
          : 'border-transparent text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

function ArAgingTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [asOf, setAsOf] = useState('');

  const load = useCallback(async (override) => {
    setLoading(true);
    setError(null);
    try {
      const result = await booksApi.arAging(override || (asOf || undefined));
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load AR aging');
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => { load(); /* initial */ /* eslint-disable-next-line */ }, []);

  function handleApply() {
    load(asOf || undefined);
  }

  function handleClear() {
    setAsOf('');
    load(undefined);
  }

  return (
    <div>
      <div className="flex items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">As of (optional)</label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="bg-slate-800 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleApply}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded"
        >
          Apply
        </button>
        <button
          onClick={handleClear}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded"
        >
          Today
        </button>
        {data && (
          <div className="ml-auto text-xs text-slate-400">
            as_of: <span className="text-slate-200">{data.as_of}</span>
          </div>
        )}
      </div>

      {loading && <div className="text-slate-400 text-sm">Loading…</div>}
      {error && (
        <div className="text-rose-400 text-sm bg-rose-900/20 border border-rose-800 rounded p-3">
          {error}
        </div>
      )}

      {data && !loading && !error && (
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 text-slate-300">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Customer</th>
                {BUCKET_HEADERS.map((b) => (
                  <th key={b.key} className="text-right px-3 py-2 font-medium">{b.label}</th>
                ))}
                <th className="text-right px-3 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.data.length === 0 ? (
                <tr>
                  <td colSpan={BUCKET_HEADERS.length + 2} className="text-center py-6 text-slate-500">
                    No outstanding invoices.
                  </td>
                </tr>
              ) : (
                data.data.map((row) => (
                  <tr key={row.customer_id} className="border-t border-slate-800 hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-slate-200">{row.customer_name || '(unknown)'}</td>
                    {BUCKET_HEADERS.map((b) => (
                      <td key={b.key} className="text-right px-3 py-2 text-slate-300 tabular-nums">
                        {fmtMoney(row[b.key])}
                      </td>
                    ))}
                    <td className="text-right px-3 py-2 text-slate-100 font-medium tabular-nums">
                      {fmtMoney(row.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {data.data.length > 0 && (
              <tfoot className="bg-slate-800/60 text-slate-200 font-medium">
                <tr className="border-t border-slate-700">
                  <td className="px-3 py-2">Totals</td>
                  {BUCKET_HEADERS.map((b) => (
                    <td key={b.key} className="text-right px-3 py-2 tabular-nums">
                      {fmtMoney(data.totals[b.key])}
                    </td>
                  ))}
                  <td className="text-right px-3 py-2 tabular-nums">{fmtMoney(data.totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {data && data.data.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Bucket: Current (not yet due) · 1–30 (1–30 days past) · 31–60 · 61–90 · 90+.
          Outstanding = invoice total (no partial-payment tracking in v1).
        </p>
      )}
    </div>
  );
}

function ScheduleCTab() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [error, setError] = useState(null);

  function handleExport() {
    setError(null);
    const y = String(year).trim();
    if (!/^\d{4}$/.test(y)) {
      setError('Enter a 4-digit year (e.g. 2026)');
      return;
    }
    // Direct download — let the browser handle the ZIP + filename from
    // Content-Disposition. Clicking the link avoids any CORS/streaming issues.
    const url = booksApi.scheduleCUrl(y);
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="max-w-xl">
      <p className="text-sm text-slate-300 mb-4">
        Download a ZIP of three CSVs for the selected tax year: Schedule C income,
        Schedule C expenses, and a trial balance. All derived mechanically from
        posted journal entries.
      </p>

      <div className="flex items-end gap-3 mb-2">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Year</label>
          <input
            type="number"
            min="1900"
            max="2999"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="bg-slate-800 text-slate-100 text-sm rounded px-2 py-1.5 w-32 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded"
        >
          Export ZIP
        </button>
      </div>

      {error && (
        <div className="text-rose-400 text-sm bg-rose-900/20 border border-rose-800 rounded p-3">
          {error}
        </div>
      )}

      <div className="mt-6 text-xs text-slate-500">
        <div className="font-medium text-slate-400 mb-1">What's in the ZIP</div>
        <ul className="list-disc list-inside space-y-0.5">
          <li><code className="text-slate-300">schedule_c_income.csv</code> — gross receipts from income accounts (4000–4999)</li>
          <li><code className="text-slate-300">schedule_c_expenses.csv</code> — expense lines with IRS line mapping (6000–6999)</li>
          <li><code className="text-slate-300">trial_balance.csv</code> — all other accounts (1000–3999, 5000–5999)</li>
        </ul>
      </div>
    </div>
  );
}

export default function Reports({ navigate }) {
  const [tab, setTab] = useState('ar-aging');

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-xl text-slate-100" style={{ fontWeight: 300, letterSpacing: '0.04em' }}>
            Reports
          </h2>
          <p className="text-sm text-slate-400 mt-1">AR aging and Schedule C export.</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-800 mb-4">
        <TabButton active={tab === 'ar-aging'} onClick={() => setTab('ar-aging')}>
          AR Aging
        </TabButton>
        <TabButton active={tab === 'schedule-c'} onClick={() => setTab('schedule-c')}>
          Schedule C Export
        </TabButton>
      </div>

      {tab === 'ar-aging' ? <ArAgingTab /> : <ScheduleCTab />}
    </div>
  );
}
