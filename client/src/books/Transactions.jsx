// Virta Books — Phase 1+2: Transactions / General Ledger page (D59, D68).
//
// Columns per D59:
//   Date | Type | Name | Amount | Description | Category | Matched with | Status
//
// Filters per Phase 2 spec:
//   - Date range (date_from / date_to)
//   - Category (filter to entries touching the picked account)
//   - Name (case-insensitive substring match on the entry name)
//
// Audit click-to-reveal modal (D66): clicking the row opens a modal showing
// "Created by user on YYYY-MM-DD HH:MM" and the full posting detail (the two
// journal_lines + amount/sign breakdown).
//
// Reconciliation status semantics per D59: three placeholders for v1 — empty,
// in progress, reconciled. Transitions are Phase 9.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { booksApi } from './api.js';
import ManualEntryModal from './ManualEntryModal.jsx';

const TYPE_LABELS = {
  manual_entry: 'Manual',
  manual: 'Manual',
  transaction_import: 'Import',
  invoice_payment: 'Invoice',
};

function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', signDisplay: 'never' });
}

function ReconStatusBadge({ status }) {
  if (status === 'reconciled') {
    return <span className="px-2 py-0.5 rounded-full bg-emerald-700/30 border border-emerald-700/50 text-emerald-300 text-xs">Reconciled</span>;
  }
  if (status === 'in_progress') {
    return <span className="px-2 py-0.5 rounded-full bg-amber-700/30 border border-amber-700/50 text-amber-300 text-xs">In progress</span>;
  }
  return <span className="text-slate-500 text-xs">—</span>;
}

function AuditModal({ entry, onClose }) {
  if (!entry) return null;
  const created = entry.audit && entry.audit.find(a => a.event === 'created');
  const createdAt = created?.occurred_at || entry.created_at;
  const createdBy = created?.summary || 'Created by user';
  // Re-derive the signed amount string from total_debit (== total_credit for a balanced entry).
  const absAmount = Number(entry.amount || entry.total_debit || 0);
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[90vh] flex flex-col my-auto shadow-2xl">
        <div className="px-5 py-3 border-b border-slate-700 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-medium text-slate-100">Audit detail</h3>
            <div className="text-xs text-slate-400 mt-1">{createdBy}</div>
            <div className="text-xs text-slate-500 mt-0.5">{createdAt}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 text-xl leading-none"
            aria-label="Close audit modal"
          >×</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto text-sm text-slate-200" style={{ flex: '1 1 auto' }}>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Stat label="Date" value={entry.txn_date} mono />
            <Stat label="Amount" value={fmtMoney(absAmount)} mono />
            <Stat
              label="Status"
              value={<ReconStatusBadge status={entry.recon_status} />}
            />
          </div>
          <div className="mb-3">
            <div className="text-xs text-slate-400 mb-0.5">Description</div>
            <div className="text-slate-200">{entry.description || '—'}</div>
          </div>
          <div className="mb-3">
            <div className="text-xs text-slate-400 mb-0.5">Name</div>
            <div className="text-slate-200">{entry.name || '—'}</div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-400 mb-1">Posting (always balanced)</div>
            <div className="rounded border border-slate-700 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/50 text-slate-400 text-left">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Account</th>
                    <th className="px-2 py-1.5 font-medium text-right w-24">Debit</th>
                    <th className="px-2 py-1.5 font-medium text-right w-24">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {(entry.lines || []).map((l, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5 text-slate-200">
                        <div className="font-mono text-slate-500 inline-block w-12 mr-2">{l.account_code}</div>
                        <span>{l.account_name}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-300">{l.debit ? fmtMoney(l.debit) : ''}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-rose-300">{l.credit ? fmtMoney(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {entry.notes && (
            <div className="mt-4">
              <div className="text-xs text-slate-400 mb-0.5">Notes <span className="text-slate-500">(internal only)</span></div>
              <div className="text-slate-200 whitespace-pre-wrap">{entry.notes}</div>
            </div>
          )}

          <div className="mt-4 text-[11px] text-slate-500">
            Entry id <span className="font-mono">{entry.id.slice(0, 8)}…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, mono }) {
  return (
    <div className="bg-slate-900/40 border border-slate-700/60 rounded px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono tabular-nums text-slate-100' : 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

export default function Transactions({ navigate }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [accounts, setAccounts] = useState([]);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterName, setFilterName] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [auditEntry, setAuditEntry] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // load accounts (for the filter dropdown)
  useEffect(() => {
    booksApi.listAccounts().then(setAccounts).catch(() => {});
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;
      if (filterCategoryId) params.category_id = filterCategoryId;
      if (filterName.trim()) params.name_q = filterName.trim();
      const res = await booksApi.listJournalEntries(params);
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterDateFrom, filterDateTo, filterCategoryId, filterName]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  async function handleOpenAudit(entryRow) {
    setAuditLoading(true);
    try {
      const detail = await booksApi.getJournalEntry(entryRow.id);
      setAuditEntry(detail);
    } catch (e) {
      alert(`Could not load audit detail: ${e.message}`);
    } finally {
      setAuditLoading(false);
    }
  }

  function clearFilters() {
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterCategoryId('');
    setFilterName('');
  }

  // Summary metrics (Phase 1+2 v1: simple)
  const metrics = useMemo(() => {
    let monthCount = 0;
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    for (const r of rows) {
      if ((r.txn_date || '').startsWith(yearMonth)) monthCount++;
    }
    return { monthCount };
  }, [rows]);

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-slate-100">Transactions</h1>
          <p className="text-slate-400 text-sm mt-1">
            Every money event, balanced behind the scenes. {total.toLocaleString()} entries shown.
          </p>
        </div>
        <button
          onClick={() => setShowManualEntry(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
        >
          New entry
        </button>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Metric label="Entries this month" value={metrics.monthCount.toLocaleString()} />
        <Metric label="Unbalanced entries" value="0" />
        <Metric label="User action needed" value="None" />
      </div>

      {/* Filter bar */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From">
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </Field>
          <Field label="Category">
            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All categories</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <input
              type="text"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              placeholder="Vendor or customer…"
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 w-44"
            />
          </Field>
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-slate-400 hover:text-slate-100 underline self-end pb-1.5"
          >
            Clear filters
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-900/30 border border-red-700 rounded text-red-200 text-sm">{error}</div>
      )}

      {/* GL table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading transactions…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-400 text-center">
            No entries match your filters.
            <button
              onClick={() => setShowManualEntry(true)}
              className="block mx-auto mt-3 text-xs text-indigo-300 hover:text-indigo-200 underline"
            >
              New entry
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-slate-400 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 w-24">Date</th>
                <th className="px-3 py-2 w-20">Type</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 text-right w-28">Amount</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Matched with</th>
                <th className="px-3 py-2 w-28">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {rows.map(r => (
                <tr
                  key={r.id}
                  className="hover:bg-slate-700/30 cursor-pointer"
                  onClick={() => handleOpenAudit(r)}
                  title="Click to view audit detail"
                >
                  <td className="px-3 py-2 text-slate-400 text-xs tabular-nums">{r.txn_date}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 text-xs">
                      {TYPE_LABELS[r.source] || r.source}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-200 truncate max-w-[160px]" title={r.name}>
                    {r.name || <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-100">
                    {fmtMoney(r.amount || r.total_debit)}
                  </td>
                  <td className="px-3 py-2 text-slate-300 truncate max-w-[200px]" title={r.description}>
                    {r.description || <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {r.category_code ? (
                      <><span className="font-mono text-slate-500 mr-1">{r.category_code}</span>{r.category_name}</>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {r.matched_code ? (
                      <><span className="font-mono text-slate-500 mr-1">{r.matched_code}</span>{r.matched_name}</>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2"><ReconStatusBadge status={r.recon_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {auditLoading && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center text-slate-200 text-sm pointer-events-none">
          Loading audit detail…
        </div>
      )}

      <AuditModal entry={auditEntry} onClose={() => setAuditEntry(null)} />

      <ManualEntryModal
        isOpen={showManualEntry}
        onClose={() => setShowManualEntry(false)}
        onPosted={(entry, { keepOpen } = {}) => {
          // D71: Save and new must keep the modal open. Only close on Save.
          if (!keepOpen) setShowManualEntry(false);
          loadEntries();
        }}
        defaultMatchedAccountId={accounts.find(a => a.account_type === 'asset' && /checking/i.test(a.name))?.id || ''}
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-xl text-slate-100 mt-0.5 tabular-nums font-light">{value}</div>
    </div>
  );
}
