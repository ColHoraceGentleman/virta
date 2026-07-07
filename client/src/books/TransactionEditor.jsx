// Virta Books — Phase E.2: General-purpose transaction editor (in-line).
//
// Per spec §8.5: this is a general-purpose tool, not just a stale-banner entry
// point. The most common reason to open it is normal bookkeeping work. The
// stale banner is one of two entry points.
//
// Editor model: when a transaction is "selected" the row expands in place
// showing all editable fields populated with current values. Save commits via
// PATCH /transactions/:id; Discard reverts the form to the last-saved state
// with no server call.
//
// Editable fields:
//   - txn_date, vendor_normalized, description
//   - amount
//   - account_id (the *source* account — the bank/CC/etc the row came from)
//   - category_account_id (the categorized-to account)
//   - notes
//
// Read-only fields surfaced for context:
//   - id, created_at, imported_at, dedupe_hash, cleared_at (as "Reconciled: ...")
//
// When Save triggers a stale recon (PATCH returns non-empty
// reconciliation_warnings), the editor surfaces an inline alert naming the
// affected account + as_of_date with a link to that account's reconcile page.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { booksApi } from './api.js';

function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Pull only the fields we need from a server row to build the form state.
// The server row is the source of truth; everything else is derived.
function rowToFormState(row) {
  if (!row) return null;
  return {
    txn_date: row.txn_date ? String(row.txn_date).slice(0, 10) : '',
    description: row.description || '',
    vendor_normalized: row.vendor_normalized || '',
    amount: row.amount != null ? String(row.amount) : '0',
    account_id: row.account_id || '',
    category_account_id: row.category_account_id || '',
    notes: row.notes || '',
    status: row.status || 'uncategorized',
  };
}

// Reconcile button on the editor surfaces a link to the affected account.
function ReconciliationWarningAlert({ warnings, onNavigate }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="mt-3 px-3 py-2 bg-amber-900/30 border border-amber-700 rounded text-amber-200 text-sm">
      <div className="font-medium mb-1">⚠ This change affects reconciliation</div>
      <ul className="space-y-1">
        {warnings.map((w, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span className="text-xs">
              {w.account_code} — {w.account_name} (as of {w.as_of_date}) — {w.reason}
            </span>
            {onNavigate && w.account_id ? (
              <button
                onClick={() => onNavigate(`/books/reconcile/${w.account_id}`)}
                className="text-xs text-indigo-300 hover:text-indigo-100 underline"
              >
                Open reconcile page
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// =====================================================================
// Expanded editor row.
// `accounts` is the full list of active accounts (id, code, name, account_type).
// Pass `categoryAccounts` separately for the category dropdown (income/expense
// types). Falls back to `accounts` if not provided.
// =====================================================================
export function TransactionEditorRow({
  txn,
  accounts = [],
  categoryAccounts,
  onSaved,
  onCancel,
  onNavigate,
  preMutationSnapshot = null, // { amount, category_account_id, txn_date } from the stale banner
  reconLink = null,           // { account_id, as_of_date } when entered from the stale banner
}) {
  const cats = categoryAccounts || accounts.filter(a => ['income', 'expense'].includes(a.account_type));
  const initial = useMemo(() => rowToFormState(txn), [txn]);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);

  // If the txn prop changes (e.g. user re-opens the same row), reset.
  useEffect(() => { setForm(initial); setError(''); setWarnings([]); }, [initial]);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  // Discard = revert to last-saved state (no server call).
  function handleDiscard() {
    setForm(rowToFormState(txn));
    setError('');
    setWarnings([]);
  }

  // Save = PATCH the row, surface reconciliation_warnings if any.
  async function handleSave() {
    setBusy(true);
    setError('');
    setWarnings([]);
    try {
      // Coerce numeric + empty-string fields. Empty category = null.
      const payload = {};
      if (form.txn_date !== txn.txn_date) payload.txn_date = form.txn_date;
      if (form.description !== (txn.description || '')) payload.description = form.description;
      if (form.vendor_normalized !== (txn.vendor_normalized || '')) payload.vendor_normalized = form.vendor_normalized;
      if (Number(form.amount) !== Number(txn.amount)) payload.amount = Number(form.amount);
      if (form.account_id !== (txn.account_id || '')) payload.account_id = form.account_id;
      const newCategory = form.category_account_id === '' ? null : form.category_account_id;
      if (newCategory !== (txn.category_account_id || null)) payload.category_account_id = newCategory;
      if (form.notes !== (txn.notes || '')) payload.notes = form.notes;
      if (form.status !== (txn.status || 'uncategorized')) payload.status = form.status;

      const updated = await booksApi.updateTransaction(txn.id, payload);
      const w = updated.reconciliation_warnings || [];
      setWarnings(w);
      if (onSaved) onSaved(updated);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  const isCleared = !!txn.cleared_at;

  return (
    <div className="px-4 py-3 bg-slate-800/40 border-t border-slate-800">
      {/* Read-only context line */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mb-3">
        <span>ID: <span className="font-mono text-slate-500">{txn.id.slice(0, 8)}…</span></span>
        <span>Created: {txn.created_at || '—'}</span>
        <span>Imported: {txn.imported_at || '—'}</span>
        {isCleared ? (
          <span className="text-emerald-300">
            ✓ Reconciled (cleared at {txn.cleared_at})
          </span>
        ) : (
          <span className="text-slate-500">Not reconciled</span>
        )}
      </div>

      {/* Pre-mutation snapshot from the stale banner */}
      {preMutationSnapshot && (
        <div className="mb-3 px-3 py-2 bg-amber-900/20 border border-amber-800 rounded text-xs text-amber-200">
          <div className="font-medium mb-1">Original (reconciled-time) values:</div>
          <div className="grid grid-cols-3 gap-2 font-mono">
            <div>Amount: <span className="text-amber-100">{fmtMoney(preMutationSnapshot.amount)}</span></div>
            <div>Date: <span className="text-amber-100">{preMutationSnapshot.txn_date || '—'}</span></div>
            <div>Category: <span className="text-amber-100">{preMutationSnapshot.category_account_id || '—'}</span></div>
          </div>
        </div>
      )}

      {/* Form grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Date" hint="YYYY-MM-DD">
          <input
            type="text"
            value={form.txn_date}
            onChange={(e) => update('txn_date', e.target.value)}
            placeholder="2026-07-04"
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          />
        </Field>
        <Field label="Amount" hint="negative for outflows">
          <input
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(e) => update('amount', e.target.value)}
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none tabular-nums"
          />
        </Field>
        <Field label="Description">
          <input
            type="text"
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          />
        </Field>
        <Field label="Vendor (normalized)">
          <input
            type="text"
            value={form.vendor_normalized}
            onChange={(e) => update('vendor_normalized', e.target.value)}
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          />
        </Field>
        <Field label="Account (source)">
          <select
            value={form.account_id}
            onChange={(e) => update('account_id', e.target.value)}
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">— select —</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select
            value={form.category_account_id}
            onChange={(e) => update('category_account_id', e.target.value)}
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">— uncategorized —</option>
            {cats.map(a => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => update('status', e.target.value)}
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="uncategorized">uncategorized</option>
            <option value="categorized">categorized</option>
            <option value="excluded">excluded</option>
            <option value="personal">personal</option>
          </select>
        </Field>
        <Field label="Notes" full>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={2}
            className="w-full bg-slate-900 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          />
        </Field>
      </div>

      {error && (
        <div className="mt-3 px-3 py-2 bg-red-900/30 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      <ReconciliationWarningAlert warnings={warnings} onNavigate={onNavigate} />

      {/* Buttons */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={handleDiscard}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm"
        >
          Discard
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 rounded text-slate-400 hover:text-slate-200 text-sm"
          >
            Close
          </button>
        )}
        {reconLink && onNavigate && (
          <button
            onClick={() => onNavigate(`/books/reconcile/${reconLink.account_id}`)}
            className="ml-auto px-3 py-1.5 rounded text-indigo-300 hover:text-indigo-100 text-sm underline"
          >
            View affected reconciliation
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, full, children }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="block text-xs text-slate-400 mb-1">
        {label}
        {hint && <span className="ml-1 text-slate-500">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

// =====================================================================
// Helper: TransactionList — a self-contained list that knows how to expand
// a row into the editor. Used by the Reconcile page (and as a model for
// future transaction-list consumers).
// =====================================================================
export function TransactionList({
  rows,
  onNavigate,
  emptyText = 'No transactions.',
  showReconciledBadge = true,
}) {
  const [expandedTxnId, setExpandedTxnId] = useState(null);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    booksApi.listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  function toggle(id) {
    setExpandedTxnId(prev => prev === id ? null : id);
  }

  if (!rows || rows.length === 0) {
    return <div className="p-6 text-sm text-slate-500 text-center">{emptyText}</div>;
  }

  return (
    <ul>
      {rows.map(t => {
        const isExpanded = expandedTxnId === t.id;
        const isCleared = !!t.cleared_at;
        return (
          <li key={t.id} className="border-b border-slate-800/60">
            <div
              onClick={() => toggle(t.id)}
              className={`flex items-center gap-2 px-3 py-2 hover:bg-slate-800/30 text-sm cursor-pointer ${isExpanded ? 'bg-slate-800/40' : ''}`}
            >
              <span className="text-slate-500 w-3 text-center">{isExpanded ? '▾' : '▸'}</span>
              <span className="text-slate-400 text-xs tabular-nums w-20 shrink-0">{t.txn_date}</span>
              <span className="flex-1 truncate text-slate-200">
                {t.vendor_normalized || t.description}
              </span>
              <span className={`tabular-nums text-xs shrink-0 ${
                Number(t.amount) < 0 ? 'text-rose-300' : 'text-emerald-300'
              }`}>
                {fmtMoney(t.amount)}
              </span>
              {showReconciledBadge && isCleared && (
                <span className="text-xs text-emerald-400 border border-emerald-700 px-1.5 py-0.5 rounded">
                  ✓
                </span>
              )}
            </div>
            {isExpanded && (
              <TransactionEditorRow
                txn={t}
                accounts={accounts}
                onSaved={(updated) => {
                  // Replace the row in-place if the parent re-renders.
                  if (updated) Object.assign(t, updated);
                  setExpandedTxnId(null);
                }}
                onCancel={() => setExpandedTxnId(null)}
                onNavigate={onNavigate}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default TransactionEditorRow;
