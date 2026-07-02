// Virta Books — Phase E.1: Account Reconciliation
//   Two views:
//     - /books/reconcile                : list of asset/liability accounts
//     - /books/reconcile/:account_id    : detail (two-column: uncleared / cleared)
//
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §13 (Account Reconciliation).

import { useState, useEffect, useCallback } from 'react';
import { booksApi } from './api.js';

const dm = true; // single dark theme for now

function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Build YYYY-MM-DD strings for the previous month given "today" (defaults to
// actual today). Returns {start, end, year, month}.
function previousMonth(today = new Date()) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth(); // 0-indexed
  const prevYear = m === 0 ? y - 1 : y;
  const prevMonth = m === 0 ? 12 : m; // 1..12
  const start = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  // Last day of previous month: day 0 of current month gives last day of previous.
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, year: prevYear, month: prevMonth };
}

// Build YYYY-MM-DD strings for an arbitrary (year, month).
function monthBounds(year, month /* 1..12 */) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

// Status pill colors
const STATUS_STYLE = {
  reconciled:   'bg-emerald-900/40 text-emerald-300 border-emerald-700',
  investigating:'bg-amber-900/40 text-amber-300 border-amber-700',
  draft:        'bg-slate-800 text-slate-300 border-slate-700',
};

// =====================================================================
// LIST VIEW
// =====================================================================
function ReconcileList({ navigate }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // booksApi.listReconciliations() returns the `data` array (api helper unwraps).
      const data = await booksApi.listReconciliations();
      setAccounts(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  function handleReconcileClick(accountId) {
    const { year, month } = previousMonth();
    navigate(`/books/reconcile/${accountId}?period=${year}-${String(month).padStart(2, '0')}`);
  }

  function handleOpenExisting(accountId, periodStart) {
    const period = periodStart.slice(0, 7); // YYYY-MM
    navigate(`/books/reconcile/${accountId}?period=${period}`);
  }

  return (
    <div className="p-2 text-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-light tracking-wide">Reconcile</h2>
        <div className="text-xs text-slate-500">
          Period defaults to previous month when starting a new reconciliation
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-900/40 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2 text-left">Code</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">Last Reconciled</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No asset/liability accounts found.</td></tr>
            ) : accounts.map(a => (
              <tr key={a.account_id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                <td className="px-4 py-2 font-mono text-slate-300">{a.account_code}</td>
                <td className="px-4 py-2 text-slate-100">{a.account_name}</td>
                <td className="px-4 py-2 text-slate-400 text-xs uppercase">{a.account_type}</td>
                <td className="px-4 py-2 text-slate-400">
                  {a.last_reconciled_period || <span className="text-slate-600">never</span>}
                </td>
                <td className="px-4 py-2">
                  {a.last_status ? (
                    <span className={`inline-block px-2 py-0.5 rounded text-xs border ${STATUS_STYLE[a.last_status] || ''}`}>
                      {a.last_status}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                  {a.open_reconciliation && a.open_reconciliation.period_start ? (
                    <button
                      onClick={() => handleOpenExisting(a.account_id, a.open_reconciliation.period_start)}
                      className="ml-2 text-xs text-indigo-400 hover:underline"
                    >
                      in-progress: {String(a.open_reconciliation.period_start).slice(0,7)}
                    </button>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleReconcileClick(a.account_id)}
                    className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
                  >
                    Reconcile
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =====================================================================
// DETAIL VIEW
// =====================================================================
function ReconcileDetail({ navigate, accountId, initialPeriod }) {
  // Period state: year + month (1..12)
  const [periodYear, setPeriodYear] = useState(() => {
    if (initialPeriod && /^\d{4}-\d{2}$/.test(initialPeriod)) {
      return Number(initialPeriod.slice(0, 4));
    }
    return previousMonth().year;
  });
  const [periodMonth, setPeriodMonth] = useState(() => {
    if (initialPeriod && /^\d{4}-\d{2}$/.test(initialPeriod)) {
      return Number(initialPeriod.slice(5, 7));
    }
    return previousMonth().month;
  });

  const [detail, setDetail] = useState(null); // { reconciliation, account, uncleared, cleared }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statementBalanceInput, setStatementBalanceInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [busy, setBusy] = useState(false);

  // Build the recon (idempotent) and pull detail.
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { start, end } = monthBounds(periodYear, periodMonth);
      // createReconciliation returns the full detail payload (api helper unwraps .data).
      const data = await booksApi.createReconciliation({
        account_id: accountId,
        period_start: start,
        period_end: end,
      });
      setDetail(data);
      if (data && data.reconciliation) {
        setStatementBalanceInput(
          data.reconciliation.statement_balance != null
            ? String(data.reconciliation.statement_balance)
            : ''
        );
        setNotesInput(data.reconciliation.notes || '');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accountId, periodYear, periodMonth]);

  useEffect(() => { reload(); }, [reload]);

  const reconciliation = detail?.reconciliation;
  const account = detail?.account;
  const uncleared = detail?.uncleared || [];
  const cleared = detail?.cleared || [];
  const diff = reconciliation?.diff ?? null;
  const canReconcile = diff !== null && Math.abs(Number(diff)) < 0.005 && reconciliation?.status !== 'reconciled';

  async function handleStatementSave() {
    if (!reconciliation) return;
    const sb = statementBalanceInput === '' ? null : Number(statementBalanceInput);
    if (sb !== null && !Number.isFinite(sb)) {
      setError('Statement balance must be a number');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await booksApi.updateReconciliation(reconciliation.id, {
        statement_balance: sb,
        notes: notesInput,
      });
      setDetail(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkReconciled() {
    if (!reconciliation) return;
    setBusy(true);
    setError('');
    try {
      const data = await booksApi.updateReconciliation(reconciliation.id, {
        status: 'reconciled',
        statement_balance: Number(statementBalanceInput) || reconciliation.statement_balance,
      });
      setDetail(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleClear(txnId) {
    if (!reconciliation) return;
    setBusy(true);
    setError('');
    try {
      const data = await booksApi.clearTransaction(reconciliation.id, txnId);
      setDetail(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnClear(txnId) {
    if (!reconciliation) return;
    setBusy(true);
    setError('');
    try {
      const data = await booksApi.unClearTransaction(reconciliation.id, txnId);
      setDetail(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Period navigation
  function changePeriod(delta) {
    let m = periodMonth + delta;
    let y = periodYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setPeriodMonth(m);
    setPeriodYear(y);
  }

  return (
    <div className="p-2 text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/books/reconcile')}
            className="text-slate-400 hover:text-slate-100 text-sm"
          >
            ← Reconcile
          </button>
          {account && (
            <h2 className="text-2xl font-light tracking-wide">
              <span className="font-mono text-slate-400 mr-2">{account.code}</span>
              {account.name}
              <span className="ml-3 text-xs uppercase text-slate-500">{account.account_type}</span>
            </h2>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-900/40 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Period + top bar */}
      <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Period picker */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Period</label>
            <div className="flex items-center gap-1">
              <button onClick={() => changePeriod(-1)} className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-sm">‹</button>
              <span className="px-3 py-1.5 bg-slate-800 rounded text-slate-100 text-sm font-mono tabular-nums">
                {periodYear}-{String(periodMonth).padStart(2, '0')}
              </span>
              <button onClick={() => changePeriod(1)} className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-sm">›</button>
            </div>
          </div>

          {/* Statement balance */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Statement Balance</label>
            <input
              type="number"
              step="0.01"
              value={statementBalanceInput}
              onChange={(e) => setStatementBalanceInput(e.target.value)}
              placeholder="0.00"
              className="w-36 bg-slate-800 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none tabular-nums"
            />
          </div>

          {/* Books balance (read-only) */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Books Balance</label>
            <div className="px-3 py-1.5 bg-slate-800/60 rounded text-slate-300 text-sm font-mono tabular-nums min-w-[8rem] text-right">
              {reconciliation ? fmtMoney(reconciliation.books_balance) : '—'}
            </div>
          </div>

          {/* Diff */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Diff</label>
            <div className={`px-3 py-1.5 rounded text-sm font-mono tabular-nums min-w-[8rem] text-right ${
              diff === null ? 'bg-slate-800/60 text-slate-500' :
              Math.abs(Number(diff)) < 0.005 ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700' :
              'bg-rose-900/40 text-rose-300 border border-rose-700'
            }`}>
              {diff === null ? '—' : fmtMoney(diff)}
            </div>
          </div>

          {/* Status pill */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Status</label>
            {reconciliation && (
              <span className={`inline-block px-2 py-1 rounded text-xs border ${STATUS_STYLE[reconciliation.status]}`}>
                {reconciliation.status}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="ml-auto flex gap-2">
            <button
              onClick={handleStatementSave}
              disabled={busy || !reconciliation}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-sm"
            >
              Save Draft
            </button>
            <button
              onClick={handleMarkReconciled}
              disabled={busy || !canReconcile}
              className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm"
              title={!canReconcile ? 'Diff must be 0 to mark as reconciled' : ''}
            >
              Reconcile
            </button>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-3">
          <label className="block text-xs text-slate-400 mb-1">Notes</label>
          <textarea
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            onBlur={handleStatementSave}
            rows={1}
            placeholder="Optional notes about this reconciliation"
            className="w-full bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Two-column layout */}
      {loading ? (
        <div className="text-center text-slate-500 py-8">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Uncleared */}
          <div className="bg-slate-900/50 rounded-lg border border-slate-800 flex flex-col" style={{ maxHeight: 'calc(100vh - 320px)' }}>
            <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm uppercase tracking-wider text-slate-400">Uncleared</h3>
              <span className="text-xs text-slate-500">{uncleared.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {uncleared.length === 0 ? (
                <div className="p-6 text-sm text-slate-500 text-center">No uncleared transactions in this period.</div>
              ) : (
                <ul>
                  {uncleared.map(t => (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 hover:bg-slate-800/30 text-sm"
                    >
                      <input
                        type="checkbox"
                        disabled={busy}
                        onChange={() => handleClear(t.id)}
                        className="w-4 h-4 accent-indigo-500 cursor-pointer"
                      />
                      <span className="text-slate-400 text-xs tabular-nums w-20 shrink-0">{t.txn_date}</span>
                      <span className="flex-1 truncate text-slate-200">
                        {t.vendor_normalized || t.description}
                      </span>
                      <span className={`tabular-nums text-xs shrink-0 ${
                        Number(t.amount) < 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}>
                        {fmtMoney(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Right: Cleared with running balance */}
          <div className="bg-slate-900/50 rounded-lg border border-slate-800 flex flex-col" style={{ maxHeight: 'calc(100vh - 320px)' }}>
            <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm uppercase tracking-wider text-slate-400">Cleared</h3>
              <span className="text-xs text-slate-500">{cleared.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {cleared.length === 0 ? (
                <div className="p-6 text-sm text-slate-500 text-center">No cleared transactions in this period yet.</div>
              ) : (
                <ul>
                  {cleared.map(t => (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 hover:bg-slate-800/30 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked
                        disabled={busy}
                        onChange={() => handleUnClear(t.id)}
                        className="w-4 h-4 accent-emerald-500 cursor-pointer"
                      />
                      <span className="text-slate-400 text-xs tabular-nums w-20 shrink-0">{t.txn_date}</span>
                      <span className="flex-1 truncate text-slate-200">
                        {t.vendor_normalized || t.description}
                      </span>
                      <span className={`tabular-nums text-xs shrink-0 ${
                        Number(t.amount) < 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}>
                        {fmtMoney(t.amount)}
                      </span>
                      <span className="tabular-nums text-xs shrink-0 w-24 text-right text-slate-400 font-mono">
                        {fmtMoney(t.running_balance)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// ROOT
// =====================================================================
export default function Reconcile({ navigate, accountId, initialPeriod }) {
  if (accountId) {
    return <ReconcileDetail navigate={navigate} accountId={accountId} initialPeriod={initialPeriod} />;
  }
  return <ReconcileList navigate={navigate} />;
}