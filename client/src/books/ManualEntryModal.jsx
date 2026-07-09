// Virta Books — Phase 2: Manual Journal Entry Modal
//
// Port of the wireframe's `__openManualEntry()` (D62/D70/D71/R26/R27).
// Implements R26's collapsed-default pattern: 5 default fields (Date, Type,
// Category, Name, Amount); Description and Notes hide behind "+ Add X" links;
// Matched-with is always visible (required for double-entry — R27).
//
// Sign convention (D63/D64): positive = the picked Category account went up.
// The system converts to debit/credit server-side; this UI never surfaces
// debit/credit language.
//
// D70: Sage-style yellow warning fires under Matched-with when the user picks
// an import-driven account (Credit Card / Checking / Savings / Bank / Stripe /
// PayPal / Venmo / Square / Plaid / Import). The reminder: "this account is
// usually updated by statement imports …"
//
// D71: Save and new resets the form, collapses optional fields, leaves the
// modal open + refocuses the Date field. Save closes the modal.
//
// Props:
//   isOpen            — boolean controlling visibility
//   onClose           — () => void
//   onPosted(entry, { keepOpen })
//                      — called after every successful post. The second arg
//                        tells the parent which button was clicked, so the
//                        parent can choose to keep the modal open on
//                        "Save and new" (D71) instead of always closing.
//   defaultMatchedAccountId — optional override (Settings → default cash account).
//                            Falls back to the first asset account on mount.
import { useEffect, useMemo, useState, useRef } from 'react';
import { booksApi } from './api.js';

const TYPE_OPTIONS = ['Expense', 'Income', 'Asset', 'Liability', 'Equity'];
const TYPE_LABELS = {
  Expense:   { short: 'expense',   pos: 'You spent this much',  neg: 'You got a refund (or a negative expense)' },
  Income:    { short: 'income',    pos: 'You earned this much', neg: 'You had a reversal' },
  Asset:     { short: 'asset',     pos: 'The asset went up',    neg: 'The asset went down' },
  Liability: { short: 'liability', pos: 'You paid it down',     neg: 'You took on more debt' },
  Equity:    { short: 'equity',    pos: 'Owner took money out', neg: 'Owner put money in' },
};

// D70: import-driven Matched-with detection. Case-insensitive substring match
// against the account name. Mirror of the wireframe's __jeCheckMatched.
const IMPORT_TOKENS = ['credit card', 'checking', 'savings', 'bank', 'stripe', 'paypal', 'venmo', 'square', 'plaid', 'import'];
function isImportDriven(accountName) {
  if (!accountName) return false;
  const lower = String(accountName).toLowerCase();
  return IMPORT_TOKENS.some(t => lower.includes(t));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function buildAccountOptions(accounts, filterType) {
  const list = filterType
    ? accounts.filter(a => a.account_type === filterType.toLowerCase())
    : accounts;
  return list.map(a => ({ id: a.id, label: `${a.code} — ${a.name}`, type: a.account_type, name: a.name }));
}

export default function ManualEntryModal({ isOpen, onClose, onPosted, defaultMatchedAccountId }) {
  const [accounts, setAccounts] = useState([]);
  const [type, setType] = useState('Expense');
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [matchedId, setMatchedId] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const dateRef = useRef(null);

  // Load accounts on first open.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    booksApi.listAccounts().then(list => {
      if (cancelled) return;
      setAccounts(list);
      // Pre-fill matched-from: defaultMatchedAccountId if given, else first asset (cash-like).
      const def = defaultMatchedAccountId
        || list.find(a => a.account_type === 'asset' && /checking/i.test(a.name))?.id
        || list.find(a => a.account_type === 'asset')?.id
        || list[0]?.id
        || '';
      setMatchedId(def);
      // Pre-fill category to first account of the initial type (Expense).
      const t = 'expense';
      const first = list.find(a => a.account_type === t)?.id || '';
      setCategoryId(first);
    }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [isOpen, defaultMatchedAccountId]);

  // When type changes, reset category to the first matching-type account.
  useEffect(() => {
    if (!accounts.length) return;
    const match = accounts.find(a => a.account_type === type.toLowerCase());
    if (match) setCategoryId(match.id);
  }, [type, accounts]);

  const filteredCategoryOptions = useMemo(
    () => buildAccountOptions(accounts, type),
    [accounts, type]
  );
  const allAccountOptions = useMemo(
    () => buildAccountOptions(accounts, null),
    [accounts]
  );

  const matchedAccount = accounts.find(a => a.id === matchedId);
  const categoryAccount = accounts.find(a => a.id === categoryId);

  const labels = TYPE_LABELS[type] || TYPE_LABELS.Expense;
  const importWarning = isImportDriven(matchedAccount?.name);

  if (!isOpen) return null;

  function resetForm() {
    // D71: Save and new KEEPS Type and Date at their current values.
    // (The wireframe's canonical __jeSave(true) — WIREFRAMES.html ~1169 — only
    // clears je-change/je-name/je-desc/je-other/je-note; it never touches Type
    // or Date. The whole point is fast sequential entry, e.g. five Office
    // Supplies expenses without re-picking Type/Date each time.)
    // We also collapse the optional Description/Notes panels back to their
    // "+ Add X" links, clear the error, and re-pick the default Category for
    // the (now-unchanged) Type. The Matched-with default is re-applied too.
    setName('');
    setAmount('');
    setDescription('');
    setNotes('');
    setShowDescription(false);
    setShowNotes(false);
    setError('');
    if (accounts.length) {
      const t = type.toLowerCase();  // current type — preserved per D71
      setCategoryId(accounts.find(a => a.account_type === t)?.id || '');
      setMatchedId(defaultMatchedAccountId
        || accounts.find(a => a.account_type === 'asset' && /checking/i.test(a.name))?.id
        || accounts.find(a => a.account_type === 'asset')?.id
        || '');
    }
    // Refocus Date for fast next-entry typing (D71).
    setTimeout(() => dateRef.current?.focus(), 0);
  }

  async function handleSubmit({ keepOpen }) {
    setError('');
    const numericAmount = Number(amount);
    if (!date) { setError('Date is required.'); return; }
    if (!categoryId) { setError('Pick a category for the account that changed.'); return; }
    if (!matchedId) { setError('Pick the matched-with account that moved in the opposite direction.'); return; }
    if (Number.isNaN(numericAmount)) { setError('Enter the amount as a number (e.g. 45.20 or -45.20).'); return; }
    if (Math.abs(numericAmount) < 0.005) { setError('Enter an amount greater than zero (or negative, if it went down).'); return; }
    if (categoryId === matchedId) {
      setError('Category and Matched-with must be different accounts.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        txn_date: date,
        type,
        category_account_id: categoryId,
        matched_account_id: matchedId,
        name: name.trim() || undefined,
        amount: numericAmount,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const created = await booksApi.createJournalEntry(payload);
      // Tell the parent *before* resetting/closing so it can refresh the
      // underlying list and decide whether to keep the modal open.
      if (onPosted) onPosted(created, { keepOpen: !!keepOpen });
      if (keepOpen) {
        resetForm();
      } else {
        onClose();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !submitting) onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && !submitting) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleBackdrop}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-full max-w-xl max-h-[90vh] flex flex-col my-auto" role="dialog" aria-modal="true" aria-labelledby="man-entry-title">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-700">
          <h2 id="man-entry-title" className="text-base font-medium text-slate-100">New entry</h2>
          <p className="text-xs text-slate-400 mt-1">
            Pick the type of account that changed, then the specific category, the amount, and who it's with. The system handles the balanced ledger entry behind the scenes — no debits or credits to think about.
          </p>
        </div>

        {/* Body — scrollable */}
        <div className="px-5 py-4 overflow-y-auto" style={{ flex: '1 1 auto' }}>
          {/* Date */}
          <div className="mb-3.5">
            <label className="block text-xs text-slate-400 mb-1" htmlFor="man-date">Date</label>
            <input
              id="man-date"
              ref={dateRef}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Type */}
          <div className="mb-3.5">
            <label className="block text-xs text-slate-400 mb-1" htmlFor="man-type">Type</label>
            <select
              id="man-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="text-xs text-slate-500 mt-1">Pick the type first — it filters the Category list below.</div>
          </div>

          {/* Category (the picked account that changed) */}
          <div className="mb-3.5">
            <label className="block text-xs text-slate-400 mb-1" htmlFor="man-category">Category</label>
            <select
              id="man-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">— select —</option>
              {filteredCategoryOptions.map(a => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
            <div className="text-xs text-slate-500 mt-1">
              Only {labels.short} accounts are shown. Pick the specific category that changed.
            </div>
          </div>

          {/* Name */}
          <div className="mb-3.5">
            <label className="block text-xs text-slate-400 mb-1" htmlFor="man-name">Name</label>
            <input
              id="man-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Amazon, Acme Corp, John Smith"
              className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
            />
            <div className="text-xs text-slate-500 mt-1">Who this is with — vendor for expenses, customer for income. Optional.</div>
          </div>

          {/* Amount */}
          <div className="mb-3.5">
            <label className="block text-xs text-slate-400 mb-1" htmlFor="man-amount">Amount</label>
            <input
              id="man-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
            />
            <div className="text-xs text-slate-500 mt-1">
              Positive = {labels.pos}. Negative = {labels.neg}.
            </div>
          </div>

          {/* + Add description link (when collapsed) */}
          {!showDescription && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowDescription(true)}
                className="text-xs text-indigo-300 hover:text-indigo-200 underline"
              >
                + Add description
              </button>
            </div>
          )}
          {showDescription && (
            <div className="mb-3.5">
              <div className="flex items-end justify-between gap-3 mb-1">
                <label className="block text-xs text-slate-400" htmlFor="man-desc">Description</label>
                <button
                  type="button"
                  onClick={() => { setShowDescription(false); setDescription(''); }}
                  className="text-xs text-slate-500 hover:text-slate-300 underline"
                >
                  remove
                </button>
              </div>
              <input
                id="man-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Office supplies from Amazon, customer refund, paid credit card"
                className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
              />
              <div className="text-xs text-slate-500 mt-1">Optional, but useful for finding this entry later.</div>
            </div>
          )}

          {/* Matched-with — always visible (required for double-entry; R27) */}
          <div className="mb-3.5">
            <label className="block text-xs text-slate-400 mb-1" htmlFor="man-matched">Matched with</label>
            <select
              id="man-matched"
              value={matchedId}
              onChange={(e) => setMatchedId(e.target.value)}
              className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">— select —</option>
              {allAccountOptions.map(a => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
            <div className="text-xs text-slate-500 mt-1">
              The other side of the entry — the account that moved in the opposite direction. Defaults to your default cash account from Setup Wizard.
            </div>
            {importWarning && (
              <div className="mt-2 px-3 py-2 rounded bg-amber-900/30 border border-amber-700 text-amber-200 text-xs">
                <strong className="font-semibold">Heads up:</strong> This account is usually updated by statement imports. A manual entry will create a separate transaction that you will need to reconcile against the import later.
              </div>
            )}
          </div>

          {/* + Add note link (when collapsed) */}
          {!showNotes && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="text-xs text-indigo-300 hover:text-indigo-200 underline"
              >
                + Add note
              </button>
            </div>
          )}
          {showNotes && (
            <div className="mb-3.5">
              <div className="flex items-end justify-between gap-3 mb-1">
                <label className="block text-xs text-slate-400" htmlFor="man-notes">
                  Notes <span className="text-slate-500">(internal only)</span>
                </label>
                <button
                  type="button"
                  onClick={() => { setShowNotes(false); setNotes(''); }}
                  className="text-xs text-slate-500 hover:text-slate-300 underline"
                >
                  remove
                </button>
              </div>
              <textarea
                id="man-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional internal note"
                className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
              />
              <div className="text-xs text-slate-500 mt-1">Not shown in the GL table. Only visible when you open transaction details.</div>
            </div>
          )}

          {/* Soft warning — bottom of modal */}
          <div className="mt-3 px-3 py-2 rounded bg-amber-900/20 border border-amber-800 text-amber-200 text-xs">
            This is a manual accounting adjustment. Most day-to-day entries should come from invoices, bills, payments, and statement imports.
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 px-3 py-2 bg-red-900/30 border border-red-700 text-red-200 rounded text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="px-5 py-3 border-t border-slate-700 bg-slate-800/80 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm text-slate-300 hover:text-slate-100 px-3 py-1.5 disabled:opacity-50"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSubmit({ keepOpen: true })}
              disabled={submitting}
              className="text-sm bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save and new'}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit({ keepOpen: false })}
              disabled={submitting}
              className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-1.5 font-medium disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
