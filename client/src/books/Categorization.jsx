// Virta Books — Phase C: Categorization Review UI.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §6 (Categorization Review UI).
//
// Two-pane review. Left: tabbed list (Pending / Auto / Excluded). Right: account
// picker + transaction detail + keyboard shortcuts.
//
// Keyboard shortcuts:
//   j / k — next / prev transaction in current tab
//   1-9   — assign to top-9 accounts (hardcoded per spec; v2 makes it configurable)
//   Enter — confirm + advance
//   r     — open rule creator
//   s     — split editor (v1: 2 accounts max, amounts must sum to original)
//   e     — exclude (mark as personal/non-business)
//   ?     — toggle shortcut overlay
//
// Top-9 default (per Patrick 2026-06-29):
//   4000 Wholesale Sales, 4010 Etsy Sales, 6210 Merchant Fees, 6010 Software Subscriptions,
//   6200 Shipping & Postage, 6100 Office Supplies, 6700 Education & Training,
//   6800 Home Office, 6900 Other Expenses.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { booksApi } from './api.js';

const TABS = [
  { key: 'uncategorized', label: 'Pending' },
  { key: 'categorized',   label: 'Auto-categorized' },
  { key: 'excluded',      label: 'Excluded' },
];

const TOP9_CODES = ['4000', '4010', '6210', '6010', '6200', '6100', '6700', '6800', '6900'];

export default function Categorization({ navigate }) {
  const [tab, setTab] = useState('uncategorized');
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showOverlay, setShowOverlay] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [rulePrompt, setRulePrompt] = useState(null); // {vendor, category, count}
  const [vendorRulePromptShown, setVendorRulePromptShown] = useState(new Set());

  // Ref the keydown handler reads for Enter — the right-pane picker's current value.
  const pickerValueRef = useRef('');

  // Fetch accounts once.
  useEffect(() => {
    booksApi.listAccounts().then(setAccounts).catch(e => setError(e.message));
  }, []);

  // Fetch transactions for the current tab.
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await booksApi.listTransactions({ status: tab, limit: 500 });
      setRows(data.data);
      setSelectedIdx(0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { reload(); }, [reload]);

  const accountsByCode = useMemo(() => {
    const map = new Map();
    for (const a of accounts) map.set(a.code, a);
    return map;
  }, [accounts]);

  const top9 = useMemo(
    () => TOP9_CODES.map(code => accountsByCode.get(code)).filter(Boolean),
    [accountsByCode]
  );

  const expenseAccounts = useMemo(
    () => accounts.filter(a => a.account_type === 'expense').sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );

  const incomeAccounts = useMemo(
    () => accounts.filter(a => a.account_type === 'income').sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );

  const selected = rows[selectedIdx];

  // Helpers ---------------------------------------------------------------

  // Pick an account by id and persist.
  const categorize = useCallback(async (categoryAccountId, advanceAfter = true) => {
    if (!selected) return;
    try {
      await booksApi.updateTransaction(selected.id, { category_account_id: categoryAccountId });
      // Remove from current list (Pending tab) or update in place.
      if (tab === 'uncategorized') {
        setRows(rs => rs.filter((_, i) => i !== selectedIdx));
        if (selectedIdx >= rows.length - 1) setSelectedIdx(Math.max(0, selectedIdx - 1));
      } else {
        setRows(rs => rs.map((r, i) => i === selectedIdx ? { ...r, status: 'categorized', category_account_id: categoryAccountId } : r));
      }
      // Vendor rule prompt: if this is a manual categorization and vendor has 3+ manual
      // categorizations to this account, prompt to create a rule.
      if (selected.vendor_normalized) {
        try {
          const counts = await booksApi.vendorManualCounts(selected.vendor_normalized);
          const top = counts.data?.[0];
          if (top && Number(top.count) >= 3 && top.category_account_id === categoryAccountId
              && !vendorRulePromptShown.has(selected.vendor_normalized)) {
            const account = accounts.find(a => a.id === categoryAccountId);
            setRulePrompt({
              vendor: selected.vendor_normalized,
              category: account,
              count: top.count,
            });
            setVendorRulePromptShown(s => new Set([...s, selected.vendor_normalized]));
          }
        } catch { /* non-fatal */ }
      }
    } catch (e) {
      setError(e.message);
    }
  }, [selected, selectedIdx, rows, tab, accounts, vendorRulePromptShown]);

  const exclude = useCallback(async () => {
    if (!selected) return;
    try {
      await booksApi.excludeTransaction(selected.id);
      if (tab === 'uncategorized') {
        setRows(rs => rs.filter((_, i) => i !== selectedIdx));
        if (selectedIdx >= rows.length - 1) setSelectedIdx(Math.max(0, selectedIdx - 1));
      } else {
        setRows(rs => rs.map((r, i) => i === selectedIdx ? { ...r, status: 'excluded' } : r));
      }
    } catch (e) {
      setError(e.message);
    }
  }, [selected, selectedIdx, rows, tab]);

  // Keyboard shortcuts ----------------------------------------------------

  useEffect(() => {
    function onKey(e) {
      // Skip when typing in an input/textarea.
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (e.key === '?') {
        e.preventDefault();
        setShowOverlay(s => !s);
        return;
      }
      if (showOverlay) return;
      if (e.key === 'Escape') {
        setShowOverlay(false);
        setSplitOpen(false);
        return;
      }
      if (e.key === 'j') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(rows.length - 1, i + 1));
      } else if (e.key === 'k') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(0, i - 1));
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < top9.length) {
          e.preventDefault();
          categorize(top9[idx].id);
        }
      } else if (e.key === 'Enter') {
        // Confirm the right-pane picker selection (if any) + advance.
        const pv = pickerValueRef.current;
        if (pv) {
          e.preventDefault();
          categorize(pv);
        }
      } else if (e.key === 'e') {
        e.preventDefault();
        exclude();
      } else if (e.key === 'r') {
        e.preventDefault();
        if (selected && selected.vendor_normalized) {
          setRulePrompt({
            vendor: selected.vendor_normalized,
            category: selected.category_account_id ? accountsByCode.get(selected.category_code) : null,
            count: 0,
            manual: true,
          });
        }
      } else if (e.key === 's') {
        e.preventDefault();
        setSplitOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, top9, categorize, exclude, showOverlay, selected, accountsByCode]);

  // Render ----------------------------------------------------------------

  return (
    <div className="p-2 text-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-light tracking-wide">Categorize</h2>
        <button
          onClick={() => navigate('/books/import')}
          className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm"
        >
          + Import CSV
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-900/40 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        {/* Left: tabbed list */}
        <div className="col-span-2 bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          <div className="flex border-b border-slate-800">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 px-3 py-2 text-sm transition-colors ${
                  tab === t.key
                    ? 'bg-slate-800 text-slate-100 border-b-2 border-indigo-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {t.label}
                <span className="ml-2 text-xs text-slate-500">
                  {tab === t.key && !loading ? `(${rows.length})` : ''}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-sm text-slate-500">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-slate-500 text-center">
                {tab === 'uncategorized' && (
                  <>
                    No pending transactions.<br />
                    <button onClick={() => navigate('/books/import')} className="mt-3 text-indigo-400 hover:underline">Import a CSV to get started</button>
                  </>
                )}
                {tab === 'categorized' && 'No auto-categorized rows.'}
                {tab === 'excluded' && 'No excluded rows.'}
              </div>
            ) : (
              <ul>
                {rows.map((r, i) => (
                  <li
                    key={r.id}
                    onClick={() => setSelectedIdx(i)}
                    className={`px-3 py-2 cursor-pointer border-b border-slate-800/60 text-sm transition-colors ${
                      i === selectedIdx ? 'bg-indigo-900/30 border-l-2 border-l-indigo-400' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 truncate" style={{ maxWidth: '70%' }}>
                        {r.vendor_normalized || r.description}
                      </span>
                      <span className={`tabular-nums text-xs ${
                        Number(r.amount) < 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}>
                        {Number(r.amount).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-0.5">
                      <span>{r.txn_date}</span>
                      {r.category_code && <span className="text-slate-400">{r.category_code}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: detail + actions */}
        <div className="col-span-3 bg-slate-900/50 rounded-lg border border-slate-800 p-4">
          {!selected ? (
            <div className="text-slate-500 text-sm">No transaction selected.</div>
          ) : (
            <TxnDetail
              txn={selected}
              top9={top9}
              expenseAccounts={expenseAccounts}
              incomeAccounts={incomeAccounts}
              onCategorize={categorize}
              onExclude={exclude}
              onOpenRule={(vendor) => {
                if (!vendor) return;
                setRulePrompt({
                  vendor,
                  category: selected.category_account_id ? accountsByCode.get(selected.category_code) : null,
                  count: 0,
                  manual: true,
                });
              }}
              onResolveDup={reload}
              pickerValueRef={pickerValueRef}
              splitOpen={splitOpen}
              setSplitOpen={setSplitOpen}
            />
          )}
        </div>
      </div>

      {showOverlay && <ShortcutOverlay onClose={() => setShowOverlay(false)} />}

      {rulePrompt && (
        <RulePromptModal
          prompt={rulePrompt}
          accounts={accounts}
          onConfirm={async () => {
            try {
              await booksApi.createVendorRule({
                vendor_pattern: rulePrompt.vendor,
                category_account_id: rulePrompt.category?.id || selected?.category_account_id,
              });
            } catch (e) {
              setError(e.message);
            }
            setRulePrompt(null);
          }}
          onCancel={() => setRulePrompt(null)}
        />
      )}
    </div>
  );
}

function TxnDetail({ txn, top9, expenseAccounts, incomeAccounts, onCategorize, onExclude, onOpenRule, onResolveDup, pickerValueRef, splitOpen, setSplitOpen }) {
  const [pickerValue, setPickerValue] = useState(txn.category_account_id || '');
  useEffect(() => setPickerValue(txn.category_account_id || ''), [txn.id, txn.category_account_id]);

  // Mirror pickerValue into the parent's ref so the keydown handler (Enter) can read it.
  useEffect(() => {
    if (pickerValueRef) pickerValueRef.current = pickerValue;
  }, [pickerValue, pickerValueRef]);

  const nearDupInfo = txn.near_duplicate_info;
  const [dupBusy, setDupBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [originalTxn, setOriginalTxn] = useState(null);

  async function resolveDup(action) {
    setDupBusy(true);
    try {
      await booksApi.resolveDuplicate(txn.id, action);
      // Parent reloads the list after the action completes.
      if (typeof onResolveDup === 'function') onResolveDup();
    } catch (e) {
      alert(`Failed to resolve duplicate: ${e.message}`);
    } finally {
      setDupBusy(false);
    }
  }

  async function viewOriginal() {
    if (originalTxn) { setShowOriginal(s => !s); return; }
    try {
      const orig = await booksApi.getNearDuplicate(txn.id);
      setOriginalTxn(orig);
      setShowOriginal(true);
    } catch (e) {
      alert(`Failed to load original: ${e.message}`);
    }
  }

  const isIncome = Number(txn.amount) >= 0;
  const accountList = isIncome ? incomeAccounts : expenseAccounts;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-500">{txn.txn_date} · {txn.account_code} {txn.account_name}</div>
        <div className={`text-lg font-light tabular-nums ${
          Number(txn.amount) < 0 ? 'text-rose-300' : 'text-emerald-300'
        }`}>
          {Number(txn.amount) < 0 ? '−' : '+'}${Math.abs(Number(txn.amount)).toFixed(2)}
        </div>
      </div>

      <div className="text-base text-slate-100 mb-1">{txn.description}</div>
      <div className="text-xs text-slate-500 mb-4">
        Vendor: <span className="text-slate-400">{txn.vendor_normalized || '—'}</span>
      </div>

      {/* Near-duplicate warning banner (R8 dedupe upgrade) */}
      {nearDupInfo && (
        <div className="mb-4 px-4 py-3 bg-amber-900/40 border border-amber-700 rounded text-amber-100 text-sm">
          <div className="font-medium mb-1">
            ⚠️ Possible duplicate — matches a transaction from {nearDupInfo.days_apart} day{nearDupInfo.days_apart === 1 ? '' : 's'} ago
          </div>
          <div className="text-xs text-amber-200 mb-2">
            <span className="text-amber-100">{nearDupInfo.vendor_normalized || nearDupInfo.description}</span>
            {' · '}
            ${Math.abs(Number(nearDupInfo.amount)).toFixed(2)}
            {' · '}
            {nearDupInfo.txn_date}
            {nearDupInfo.account_code ? ` · ${nearDupInfo.account_code}` : ''}
            {' · '}
            <button
              onClick={viewOriginal}
              className="underline hover:text-amber-50"
            >
              View original {showOriginal ? '▴' : '↗'}
            </button>
          </div>
          {showOriginal && originalTxn && (
            <div className="mb-3 px-3 py-2 bg-slate-900/60 rounded text-xs text-slate-300">
              <div>Date: {originalTxn.txn_date}</div>
              <div>Description: {originalTxn.description}</div>
              <div>Amount: ${Math.abs(Number(originalTxn.amount)).toFixed(2)}</div>
              <div>Account: {originalTxn.account_code} {originalTxn.account_name}</div>
              <div>Status: {originalTxn.status}</div>
            </div>
          )}
          <div className="text-xs text-amber-100 mb-2">What would you like to do?</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => resolveDup('keep_both')}
              disabled={dupBusy}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-xs"
            >
              Keep both
            </button>
            <button
              onClick={() => resolveDup('keep_this')}
              disabled={dupBusy}
              className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs"
            >
              Keep this one
            </button>
            <button
              onClick={() => resolveDup('keep_original')}
              disabled={dupBusy}
              className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs"
            >
              Keep original
            </button>
          </div>
        </div>
      )}

      {/* Top-9 quick keys */}
      <div className="grid grid-cols-9 gap-1.5 mb-4">
        {top9.map((a, i) => (
          <button
            key={a.id}
            onClick={() => onCategorize(a.id)}
            title={`${a.code} ${a.name} (key ${i+1})`}
            className="px-2 py-2 rounded bg-slate-800 hover:bg-indigo-700 text-slate-200 text-xs transition-colors"
          >
            <div className="text-[10px] text-slate-500">{i + 1}</div>
            <div className="font-mono">{a.code}</div>
          </button>
        ))}
      </div>

      {/* Account picker */}
      <div className="mb-4">
        <label className="text-xs text-slate-500 block mb-1">Account</label>
        <div className="flex gap-2">
          <select
            value={pickerValue}
            onChange={e => setPickerValue(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-slate-200 text-sm"
          >
            <option value="">— Choose —</option>
            {accountList.map(a => (
              <option key={a.id} value={a.id}>{a.code} {a.name}</option>
            ))}
          </select>
          <button
            onClick={() => pickerValue && onCategorize(pickerValue)}
            disabled={!pickerValue}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm"
          >
            Apply (Enter)
          </button>
        </div>
      </div>

      {/* Notes */}
      <textarea
        placeholder="Notes (optional)"
        defaultValue={txn.notes || ''}
        onBlur={e => {
          if (e.target.value !== (txn.notes || '')) {
            booksApi.updateTransaction(txn.id, { notes: e.target.value }).catch(() => {});
          }
        }}
        rows={2}
        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-slate-200 text-sm mb-3"
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <button onClick={onExclude} className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">
          Exclude (e)
        </button>
        <button
          onClick={() => setSplitOpen(true)}
          className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
        >
          Split (s)
        </button>
        <button
          onClick={() => onOpenRule && onOpenRule(txn.vendor_normalized)}
          className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
        >
          Rule (r)
        </button>
      </div>

      {splitOpen && (
        <SplitEditor
          txn={txn}
          accounts={accountList}
          onClose={() => setSplitOpen(false)}
          onApply={async (lines) => {
            // v1: apply sequentially via updateTransaction (creates journal entries).
            // Note: this is the simple path; a more sophisticated v2 would handle
            // compound journal entries in a single transaction.
            for (const line of lines) {
              if (line.account_id) {
                await onCategorize(line.account_id);
              }
            }
            setSplitOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SplitEditor({ txn, accounts, onClose, onApply }) {
  const total = Math.abs(Number(txn.amount));
  const [lines, setLines] = useState([
    { account_id: '', amount: total.toFixed(2) },
    { account_id: '', amount: '0.00' },
  ]);
  const sum = lines.reduce((acc, l) => acc + Number(l.amount || 0), 0);
  const diff = Math.abs(sum - total);
  const valid = diff < 0.005 && lines.every(l => l.account_id && Number(l.amount) > 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg mb-1">Split transaction</h3>
        <p className="text-xs text-slate-500 mb-4">
          Two accounts max · amounts must sum to ${total.toFixed(2)}
        </p>

        <div className="space-y-2 mb-3">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <select
                value={l.account_id}
                onChange={e => {
                  const ns = [...lines]; ns[i] = { ...l, account_id: e.target.value }; setLines(ns);
                }}
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-sm"
              >
                <option value="">— Account —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </select>
              <input
                type="number"
                step="0.01"
                value={l.amount}
                onChange={e => {
                  const ns = [...lines]; ns[i] = { ...l, amount: e.target.value }; setLines(ns);
                }}
                className="w-28 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-sm text-right tabular-nums"
              />
            </div>
          ))}
        </div>

        <div className={`text-xs mb-4 ${valid ? 'text-emerald-400' : 'text-amber-400'}`}>
          Sum: ${sum.toFixed(2)} {valid ? '✓' : `(needs to equal $${total.toFixed(2)}, off by $${diff.toFixed(2)})`}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">
            Cancel
          </button>
          <button
            disabled={!valid}
            onClick={() => onApply(lines)}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm"
          >
            Apply split
          </button>
        </div>
      </div>
    </div>
  );
}

function RulePromptModal({ prompt, accounts, onConfirm, onCancel }) {
  const [category, setCategory] = useState(prompt.category?.id || '');
  const allCats = accounts.filter(a => a.account_type === 'expense' || a.account_type === 'income');
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg mb-2">Always categorize this way?</h3>
        <p className="text-sm text-slate-400 mb-4">
          {prompt.count >= 3
            ? <>You've categorized <span className="text-slate-200">{prompt.vendor}</span> as <span className="text-slate-200">{prompt.category?.code} {prompt.category?.name}</span> {prompt.count} times.</>
            : <>Create a rule: future rows from <span className="text-slate-200">{prompt.vendor}</span> auto-categorize to:</>
          }
        </p>

        <div className="mb-4">
          <label className="text-xs text-slate-500 block mb-1">Account</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-sm"
          >
            <option value="">— Choose —</option>
            {allCats.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">
            Not now
          </button>
          <button
            disabled={!category}
            onClick={onConfirm}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm"
          >
            Create rule
          </button>
        </div>
      </div>
    </div>
  );
}

function ShortcutOverlay({ onClose }) {
  const items = [
    ['j / k', 'Next / previous transaction'],
    ['1-9', 'Assign to top-9 accounts'],
    ['Enter', 'Confirm selected category + advance'],
    ['r', 'Open rule creator'],
    ['s', 'Split editor (2 lines max)'],
    ['e', 'Exclude (mark as personal)'],
    ['?', 'Toggle this overlay'],
    ['Esc', 'Dismiss modal / overlay'],
  ];
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
    >
      <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg mb-3">Keyboard shortcuts</h3>
        <table className="w-full text-sm">
          <tbody>
            {items.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-800 last:border-0">
                <td className="py-1.5 pr-4 font-mono text-indigo-300 w-24">{k}</td>
                <td className="py-1.5 text-slate-300">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 text-right">
          <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}