// Virta Books — Phase E.2: Account Reconciliation (redesigned).
//   Three sub-views:
//     <ReconcileList>     — /books/reconcile              : account list w/ stale pills
//     <AccountGate>       — /books/reconcile/:account_id   : per-account gate
//                            (start form / draft-continue / reconciled summary
//                             + rollback + stale banner)
//     <ReconcileWorking>  — the two-column clear/unclear view once a draft
//                            is open, rendered inside <AccountGate>.
//
// Source of truth: ACCOUNTING-E2.md v4 (replaces the E.1 calendar-month model
// with a single as_of_date anchor + forward-only gate + rollback + mutation
// detection + staleness UI). See CINDER_BRIEF_E2.md §L2 for the UI spec.
//
// Styling cues carried over from the E.1 file: slate-800 borders, slate-900
// backgrounds, indigo primary buttons, emerald for "commit" actions, rose for
// destructive actions.

import { useState, useEffect, useCallback } from 'react';
import { booksApi } from './api.js';
import { TransactionEditorRow } from './TransactionEditor.jsx';

function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_STYLE = {
  reconciled:   'bg-emerald-900/40 text-emerald-300 border-emerald-700',
  investigating:'bg-amber-900/40 text-amber-300 border-amber-700',
  draft:        'bg-slate-800 text-slate-300 border-slate-700',
};

// =====================================================================
// LIST VIEW — <ReconcileList>
// =====================================================================
function ReconcileList({ navigate }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
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
    navigate(`/books/reconcile/${accountId}`);
  }

  return (
    <div className="p-2 text-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-light tracking-wide">Reconcile</h2>
        <div className="text-xs text-slate-500">
          Reconciliation is anchored to a statement "as of" date, not a calendar month
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
              <th className="px-4 py-2 text-right">Balance</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No asset/liability accounts found.</td></tr>
            ) : accounts.map(a => (
              <tr key={a.account_id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                <td className="px-4 py-2 font-mono text-slate-300">{a.account_code}</td>
                <td className="px-4 py-2 text-slate-100">{a.account_name}</td>
                <td className="px-4 py-2 text-slate-400 text-xs uppercase">{a.account_type}</td>
                <td className="px-4 py-2 text-slate-400">
                  {a.last_reconciled_at || <span className="text-slate-600">never</span>}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-300">
                  {a.last_reconciled_balance != null ? fmtMoney(a.last_reconciled_balance) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-2">
                  {a.stale ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs border bg-rose-900/40 text-rose-300 border-rose-700">
                      ⚠ stale
                    </span>
                  ) : a.last_status === 'reconciled' ? (
                    <span className={`inline-block px-2 py-0.5 rounded text-xs border ${STATUS_STYLE.reconciled}`}>
                      Reconciled as of {a.last_reconciled_at}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                  {a.open_reconciliation ? (
                    <button
                      onClick={() => handleReconcileClick(a.account_id)}
                      className="ml-2 text-xs text-indigo-400 hover:underline"
                    >
                      in progress: {a.open_reconciliation.as_of_date}
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
// Rollback confirmation modal (spec §6 exact wording).
// =====================================================================
function RollbackModal({ recon, prior, clearedCount, onConfirm, onCancel, busy }) {
  const priorDateText = prior && prior.as_of_date ? prior.as_of_date : 'the beginning (no prior reconciliation)';
  const priorBalanceText = prior && prior.books_balance != null ? fmtMoney(prior.books_balance) : '—';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-5">
        <h3 className="text-lg text-slate-100 font-medium mb-3">Roll back reconciliation?</h3>
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          This will remove the reconciliation as of <span className="font-mono text-slate-100">{recon.as_of_date}</span>.{' '}
          <span className="font-mono text-slate-100">{clearedCount}</span> cleared transactions will be marked uncleared.
          The account's last reconciliation will revert to{' '}
          <span className="font-mono text-slate-100">{priorDateText}</span>
          {prior && prior.as_of_date ? <> (balance: <span className="font-mono text-slate-100">{priorBalanceText}</span>)</> : null}.
          You will need to redo this reconciliation from scratch.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-3 py-1.5 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-sm"
          >
            {busy ? 'Rolling back…' : 'Confirm rollback'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Stale banner — red "Beginning balance is off" banner w/ expandable
// "See what has changed" list. Per VB-REC-34/35.
// =====================================================================
function StaleBanner({ offendingTxns, accounts, navigate, onEditSaved }) {
  const [expanded, setExpanded] = useState(false);
  const [editingTxnId, setEditingTxnId] = useState(null);

  if (!offendingTxns || offendingTxns.length === 0) return null;

  return (
    <div className="mb-4 bg-rose-950/40 border border-rose-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-rose-200 font-medium">⚠ Beginning balance is off</div>
          <div className="text-rose-300/80 text-xs mt-0.5">
            A transaction cleared by a past reconciliation has changed since it was reconciled.
          </div>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-rose-200 hover:text-white underline shrink-0 ml-4"
        >
          {expanded ? 'Hide' : 'See what has changed'}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-rose-800/60">
          {offendingTxns.map((o, i) => {
            const isEditing = editingTxnId === o.txn_id;
            return (
              <div key={`${o.recon_id}-${o.txn_id}-${i}`} className="border-b border-rose-900/40 last:border-b-0">
                <div
                  onClick={() => setEditingTxnId(isEditing ? null : o.txn_id)}
                  className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs cursor-pointer hover:bg-rose-900/20"
                >
                  <span className="text-rose-300 uppercase tracking-wide">{o.reason}</span>
                  <span className="text-slate-300">
                    {o.current_txn ? (o.current_txn.vendor_normalized || o.current_txn.description) : `txn ${o.txn_id.slice(0, 8)}…`}
                  </span>
                  <span className="text-slate-500">Reconciled as of {o.recon_as_of_date}</span>
                  <span className="ml-auto flex items-center gap-3 font-mono">
                    <span className="text-slate-400">
                      was: <span className="text-amber-200">{o.before ? fmtMoney(o.before.amount) : '—'}</span>
                    </span>
                    <span className="text-slate-400">
                      now: <span className="text-rose-200">{o.after ? fmtMoney(o.after.amount) : (o.current_txn ? fmtMoney(o.current_txn.amount) : 'deleted')}</span>
                    </span>
                  </span>
                  <span className="text-indigo-300">{isEditing ? '▾' : '▸ edit'}</span>
                </div>
                {isEditing && o.current_txn && (
                  <TransactionEditorRow
                    txn={o.current_txn}
                    accounts={accounts}
                    preMutationSnapshot={o.before}
                    reconLink={{ account_id: o.current_txn.account_id, as_of_date: o.recon_as_of_date }}
                    onSaved={(updated) => {
                      setEditingTxnId(null);
                      if (onEditSaved) onEditSaved(updated);
                    }}
                    onCancel={() => setEditingTxnId(null)}
                    onNavigate={navigate}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// AccountGate — per-account view. Branches on:
//   - no recon at all / prior reconciled only  -> start form
//   - open draft -> continue / cancel choice, then <ReconcileWorking>
//   - stale -> banner (always shown when stale, regardless of branch)
// =====================================================================
function AccountGate({ navigate, accountId }) {
  const [summary, setSummary] = useState(null); // one row from listReconciliations
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [asOfInput, setAsOfInput] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null); // active draft detail, once opened
  const [staleDetail, setStaleDetail] = useState(null); // stale_offending_txns source when no open draft
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [rollbackBusy, setRollbackBusy] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await booksApi.listReconciliations();
      const row = (list || []).find(a => a.account_id === accountId);
      setSummary(row || null);
      // If there's an open draft, load its full detail immediately (Continue path).
      if (row && row.open_reconciliation) {
        const d = await booksApi.getReconciliation(row.open_reconciliation.id);
        setDetail(d);
        setStaleDetail(null);
      } else {
        setDetail(null);
        // No open draft: if the account is stale, we still need the
        // stale_offending_txns list for the banner. buildReconDetail (server
        // side) computes this off the account's stale recons regardless of
        // which recon id is passed in, so the last-reconciled recon id works
        // as the anchor here.
        if (row && row.stale && row.last_reconciled_recon_id) {
          const d = await booksApi.getReconciliation(row.last_reconciled_recon_id);
          setStaleDetail(d);
        } else {
          setStaleDetail(null);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    booksApi.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  async function handleStart() {
    if (!asOfInput) { setError('as_of_date is required'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await booksApi.createReconciliation({ account_id: accountId, as_of_date: asOfInput });
      setDetail(result);
      await loadSummary();
    } catch (e) {
      if (e.code === 'RECON_DATE_NOT_FORWARD') {
        setError(`as_of_date must be after the last reconciliation (${e.last_reconciled_at || summary?.last_reconciled_at || 'unknown'}).`);
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelDraft() {
    if (!detail?.reconciliation?.id) return;
    setBusy(true);
    setError('');
    try {
      await booksApi.cancelReconciliation(detail.reconciliation.id);
      setDetail(null);
      await loadSummary();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRollback() {
    if (!summary?.last_reconciled_recon_id) return;
    setRollbackBusy(true);
    setError('');
    try {
      await booksApi.rollbackReconciliation(summary.last_reconciled_recon_id);
      setShowRollbackModal(false);
      await loadSummary();
    } catch (e) {
      setError(e.message);
    } finally {
      setRollbackBusy(false);
    }
  }

  function handleEditSaved() {
    // A stale-banner edit was saved — reload the account summary (may have
    // resolved the staleness, or added another mutation to the pile).
    loadSummary();
  }

  const account = summary
    ? { code: summary.account_code, name: summary.account_name, account_type: summary.account_type, id: summary.account_id }
    : null;

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

      {loading ? (
        <div className="text-center text-slate-500 py-8">Loading…</div>
      ) : (
        <>
          {/* Stale banner — visible whenever the account has any stale recon,
              regardless of draft state (spec: only on the account's reconcile page). */}
          {summary && summary.stale && (
            <StaleBanner
              offendingTxns={(detail || staleDetail)?.stale_offending_txns || []}
              accounts={accounts}
              navigate={navigate}
              onEditSaved={handleEditSaved}
            />
          )}

          {detail && detail.reconciliation ? (
            <ReconcileWorking
              detail={detail}
              setDetail={setDetail}
              onClosed={loadSummary}
              onCancelDraft={handleCancelDraft}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
            />
          ) : (
            <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-5 max-w-xl">
              {summary && summary.last_reconciled_at ? (
                <div className="mb-4 text-sm text-slate-300">
                  Last reconciled as of{' '}
                  <span className="font-mono text-slate-100">{summary.last_reconciled_at}</span>
                  {summary.last_reconciled_balance != null && (
                    <> — balance <span className="font-mono text-slate-100">{fmtMoney(summary.last_reconciled_balance)}</span></>
                  )}
                  {summary.stale && (
                    <span className="ml-2 text-rose-300">(⚠ stale — resolve above, or roll back to unlock)</span>
                  )}
                </div>
              ) : (
                <div className="mb-4 text-sm text-slate-500">No prior reconciliation for this account.</div>
              )}

              <div className="flex items-end gap-3 mb-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">As of date</label>
                  <input
                    type="date"
                    value={asOfInput}
                    onChange={(e) => setAsOfInput(e.target.value)}
                    className="bg-slate-800 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleStart}
                  disabled={busy || summary?.stale}
                  title={summary?.stale ? 'Resolve staleness or roll back before starting a new reconciliation' : ''}
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm"
                >
                  {busy ? 'Starting…' : 'Start reconciliation'}
                </button>
              </div>

              {summary && summary.last_reconciled_at && !summary.stale && (
                <button
                  onClick={() => setShowRollbackModal(true)}
                  className="mt-3 text-xs text-rose-300 hover:text-rose-100 underline"
                >
                  Roll back previous reconciliation
                </button>
              )}
            </div>
          )}
        </>
      )}

      {showRollbackModal && summary && (
        <RollbackModal
          recon={{ as_of_date: summary.last_reconciled_at }}
          prior={summary.prior_reconciliation}
          clearedCount={summary.last_cleared_count ?? 0}
          busy={rollbackBusy}
          onConfirm={handleRollback}
          onCancel={() => setShowRollbackModal(false)}
        />
      )}
    </div>
  );
}

// =====================================================================
// ReconcileWorking — the two-column clear/unclear view for an open draft.
// =====================================================================
function ReconcileWorking({ detail, setDetail, onClosed, onCancelDraft, busy, setBusy, setError }) {
  const [statementBalanceInput, setStatementBalanceInput] = useState(
    detail.reconciliation.statement_balance != null ? String(detail.reconciliation.statement_balance) : ''
  );
  const [includePast, setIncludePast] = useState(!!detail.include_past);
  // L3: TransactionEditor integration. The Reconcile working view is one of
  // the two "any transaction list" entry points per ACCOUNTING-E2.md §8.5 —
  // clicking a row's description (not its clear/unclear checkbox) expands
  // the general-purpose editor in place.
  const [expandedTxnId, setExpandedTxnId] = useState(null);
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    booksApi.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const reconciliation = detail.reconciliation;
  const account = detail.account;
  const uncleared = detail.uncleared || [];
  const cleared = detail.cleared || [];
  const sb = statementBalanceInput === '' ? null : Number(statementBalanceInput);
  const diff = sb !== null && Number.isFinite(sb) ? Number((reconciliation.books_balance - sb).toFixed(2)) : null;
  const canClose = diff !== null && Math.abs(diff) < 0.005;

  async function refetch(includePastNow) {
    const d = await booksApi.getReconciliation(reconciliation.id, { includePast: includePastNow });
    setDetail(d);
  }

  async function handleToggleIncludePast() {
    const next = !includePast;
    setIncludePast(next);
    setBusy(true);
    try {
      await refetch(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleClear(txnId) {
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

  async function handleClose() {
    if (sb === null || !Number.isFinite(sb)) {
      setError('Statement balance must be a number');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await booksApi.closeReconciliation(reconciliation.id, sb);
      setDetail(null);
      if (onClosed) await onClosed();
    } catch (e) {
      if (e.code === 'DIFF_NOT_ZERO') {
        setError(`Diff must be 0 to close (got ${e.diff != null ? fmtMoney(e.diff) : '?'})`);
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Draft continue/cancel bar */}
      <div className="mb-4 px-4 py-2 bg-slate-800/60 border border-slate-700 rounded-lg flex items-center justify-between text-sm">
        <span className="text-slate-300">
          Draft reconciliation as of <span className="font-mono text-slate-100">{reconciliation.as_of_date}</span>
        </span>
        <button
          onClick={onCancelDraft}
          disabled={busy}
          className="text-xs text-rose-300 hover:text-rose-100 underline disabled:opacity-50"
        >
          Cancel and delete reconciliation
        </button>
      </div>

      {/* Top bar: statement balance / books balance / diff / close */}
      <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
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

          <div>
            <label className="block text-xs text-slate-400 mb-1">Books Balance</label>
            <div className="px-3 py-1.5 bg-slate-800/60 rounded text-slate-300 text-sm font-mono tabular-nums min-w-[8rem] text-right">
              {fmtMoney(reconciliation.books_balance)}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Diff</label>
            <div className={`px-3 py-1.5 rounded text-sm font-mono tabular-nums min-w-[8rem] text-right ${
              diff === null ? 'bg-slate-800/60 text-slate-500' :
              Math.abs(diff) < 0.005 ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700' :
              'bg-rose-900/40 text-rose-300 border border-rose-700'
            }`}>
              {diff === null ? '—' : fmtMoney(diff)}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includePast}
              onChange={handleToggleIncludePast}
              disabled={busy}
              className="w-4 h-4 accent-indigo-500 cursor-pointer"
            />
            Include transactions past as-of-date
          </label>

          <div className="ml-auto">
            <button
              onClick={handleClose}
              disabled={busy || !canClose}
              className="px-4 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm"
              title={!canClose ? 'Diff must be 0 to close' : ''}
            >
              Close reconciliation
            </button>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900/50 rounded-lg border border-slate-800 flex flex-col" style={{ maxHeight: 'calc(100vh - 380px)' }}>
          <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm uppercase tracking-wider text-slate-400">Uncleared</h3>
            <span className="text-xs text-slate-500">{uncleared.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {uncleared.length === 0 ? (
              <div className="p-6 text-sm text-slate-500 text-center">No uncleared transactions as of this date.</div>
            ) : (
              <ul>
                {uncleared.map(t => (
                  <li key={t.id} className="border-b border-slate-800/60">
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-slate-800/30 text-sm">
                      <input
                        type="checkbox"
                        disabled={busy}
                        onChange={() => handleClear(t.id)}
                        className="w-4 h-4 accent-indigo-500 cursor-pointer"
                      />
                      <span className="text-slate-400 text-xs tabular-nums w-20 shrink-0">{t.txn_date}</span>
                      <span
                        onClick={() => setExpandedTxnId(id => id === t.id ? null : t.id)}
                        className="flex-1 truncate text-slate-200 cursor-pointer hover:underline"
                      >
                        {t.vendor_normalized || t.description}
                      </span>
                      <span className={`tabular-nums text-xs shrink-0 ${Number(t.amount) < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                        {fmtMoney(t.amount)}
                      </span>
                    </div>
                    {expandedTxnId === t.id && (
                      <TransactionEditorRow
                        txn={t}
                        accounts={accounts}
                        onSaved={async () => { setExpandedTxnId(null); await refetch(includePast); }}
                        onCancel={() => setExpandedTxnId(null)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-lg border border-slate-800 flex flex-col" style={{ maxHeight: 'calc(100vh - 380px)' }}>
          <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm uppercase tracking-wider text-slate-400">Cleared</h3>
            <span className="text-xs text-slate-500">{cleared.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {cleared.length === 0 ? (
              <div className="p-6 text-sm text-slate-500 text-center">No cleared transactions yet.</div>
            ) : (
              <ul>
                {cleared.map(t => (
                  <li key={t.id} className="border-b border-slate-800/60">
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-slate-800/30 text-sm">
                      <input
                        type="checkbox"
                        checked
                        disabled={busy}
                        onChange={() => handleUnClear(t.id)}
                        className="w-4 h-4 accent-emerald-500 cursor-pointer"
                      />
                      <span className="text-slate-400 text-xs tabular-nums w-20 shrink-0">{t.txn_date}</span>
                      <span
                        onClick={() => setExpandedTxnId(id => id === t.id ? null : t.id)}
                        className="flex-1 truncate text-slate-200 cursor-pointer hover:underline"
                      >
                        {t.vendor_normalized || t.description}
                      </span>
                      <span className={`tabular-nums text-xs shrink-0 ${Number(t.amount) < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                        {fmtMoney(t.amount)}
                      </span>
                      <span className="tabular-nums text-xs shrink-0 w-24 text-right text-slate-400 font-mono">
                        {fmtMoney(t.running_balance)}
                      </span>
                    </div>
                    {expandedTxnId === t.id && (
                      <TransactionEditorRow
                        txn={t}
                        accounts={accounts}
                        onSaved={async () => { setExpandedTxnId(null); await refetch(includePast); }}
                        onCancel={() => setExpandedTxnId(null)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// =====================================================================
// ROOT
// =====================================================================
export default function Reconcile({ navigate, accountId }) {
  if (accountId) {
    return <AccountGate navigate={navigate} accountId={accountId} />;
  }
  return <ReconcileList navigate={navigate} />;
}
