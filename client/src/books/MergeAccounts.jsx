import { useEffect, useMemo, useState } from 'react';
import { booksApi } from './api.js';

// Merge two accounts of the same type.
// Source → Destination: all journal_lines + transactions on source get re-pointed
// to destination in a single SQL transaction; source is then deleted.
// Cross-type merges are blocked.
export default function MergeAccounts({ navigate }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceId, setSourceId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [error, setError] = useState(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    booksApi.listAccounts().then(setAccounts).finally(() => setLoading(false));
  }, []);

  // Group by type for nicer dropdowns
  const grouped = useMemo(() => {
    const m = {};
    for (const a of accounts) (m[a.account_type] ||= []).push(a);
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.code.localeCompare(b.code));
    return m;
  }, [accounts]);

  const source = accounts.find(a => a.id === sourceId);
  const destination = accounts.find(a => a.id === destinationId);
  const sameType = source && destination && source.account_type === destination.account_type;
  const valid = sourceId && destinationId && sourceId !== destinationId && sameType;

  async function handleMerge() {
    if (!valid) return;
    if (!confirm(
      `Merge account ${source.code} "${source.name}" into ${destination.code} "${destination.name}"?\n\n` +
      `All journal lines and transactions on the source will be re-pointed to the destination, then the source will be deleted.\n\n` +
      `This cannot be undone.`
    )) return;
    setMerging(true);
    setError(null);
    try {
      const r = await booksApi.mergeAccounts(sourceId, destinationId);
      alert(
        `Merged successfully.\n\n` +
        `Repointed ${r.repointed.repointedJournalLines} journal lines and ${r.repointed.repointedTransactions} transactions.`
      );
      navigate('/books/settings/accounts');
    } catch (e) {
      setError(e.message);
    } finally {
      setMerging(false);
    }
  }

  if (loading) return <div className="text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-light tracking-wide text-slate-100 mb-4">Merge accounts</h1>
      <p className="text-slate-400 text-sm mb-6">
        Combine two accounts of the <strong>same type</strong>. Source will be re-pointed and then deleted.
        Cross-type merges are blocked.
      </p>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
        <AccountPicker
          label="Source (will be deleted)"
          accounts={accounts}
          grouped={grouped}
          value={sourceId}
          onChange={setSourceId}
        />
        <div className="text-center text-slate-500 text-xs">↓</div>
        <AccountPicker
          label="Destination (will absorb source)"
          accounts={accounts}
          grouped={grouped}
          value={destinationId}
          onChange={setDestinationId}
          filterType={source?.account_type} // restrict to same type as source
        />

        {source && destination && !sameType && (
          <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 text-sm">
            Cannot merge a <strong>{source.account_type}</strong> account into a <strong>{destination.account_type}</strong> account.
            Cross-type merges are blocked.
          </div>
        )}

        {source && destination && sameType && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300">
            All journal lines and transactions on <strong className="text-slate-100">{source.code} {source.name}</strong> will be
            re-pointed to <strong className="text-slate-100">{destination.code} {destination.name}</strong>, then the source will be deleted.
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            disabled={!valid || merging}
            onClick={handleMerge}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {merging ? 'Merging…' : 'Merge accounts'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/books/settings/accounts')}
            className="px-4 py-2 text-slate-300 hover:text-white text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountPicker({ label, accounts, grouped, value, onChange, filterType }) {
  const filtered = filterType
    ? accounts.filter(a => a.account_type === filterType)
    : accounts;
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">{label}</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
      >
        <option value="">— pick an account —</option>
        {Object.keys(grouped).map(t => {
          const list = filterType && filterType !== t ? [] : grouped[t];
          if (!list.length) return null;
          return (
            <optgroup key={t} label={t.toUpperCase()}>
              {list.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      {filterType && (
        <p className="text-xs text-slate-500 mt-1.5">
          Showing only <strong>{filterType}</strong> accounts to enforce same-type rule.
        </p>
      )}
    </label>
  );
}