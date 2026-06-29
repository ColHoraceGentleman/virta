import { useEffect, useMemo, useState } from 'react';
import { booksApi } from './api.js';

const TYPE_ORDER = ['income', 'expense', 'asset', 'liability', 'equity'];
const TYPE_LABELS = {
  income:    'Income',
  expense:   'Operating Expenses',
  asset:     'Assets',
  liability: 'Liabilities',
  equity:    'Equity',
};
const TYPE_ACCENT = {
  income:    'text-emerald-300 border-emerald-700/50',
  expense:   'text-rose-300    border-rose-700/50',
  asset:     'text-sky-300     border-sky-700/50',
  liability: 'text-amber-300   border-amber-700/50',
  equity:    'text-violet-300  border-violet-700/50',
};

export default function ChartOfAccounts({ navigate }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    booksApi.listAccounts().then(setAccounts).catch(e => setError(e.message)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  const grouped = useMemo(() => {
    const m = {};
    for (const a of accounts) {
      (m[a.account_type] ||= []).push(a);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.code.localeCompare(b.code));
    return m;
  }, [accounts]);

  async function handleDelete(a) {
    if (!confirm(`Delete account ${a.code} "${a.name}"? This cannot be undone.`)) return;
    setDeleting(a.id);
    try {
      await booksApi.deleteAccount(a.id);
      load();
    } catch (e) {
      // Dependent-record error from server returns a clear message; show it.
      alert(`Cannot delete: ${e.message}`);
    } finally {
      setDeleting(null);
    }
  }

  async function handleInlineRename(a, newName) {
    if (!newName || newName === a.name) return;
    try {
      await booksApi.updateAccount(a.id, { name: newName });
      load();
    } catch (e) {
      alert(`Rename failed: ${e.message}`);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-slate-100">Chart of accounts</h1>
          <p className="text-slate-400 text-sm mt-1">
            {accounts.length} accounts. <span className="text-slate-500">irs_line is read-only by convention.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/books/settings/accounts/merge')}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm"
          >
            ⇄ Merge accounts
          </button>
          <button
            onClick={() => navigate('/books/settings/accounts/new')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          >
            + New account
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-6">
          {TYPE_ORDER.filter(t => grouped[t]?.length).map(t => (
            <section key={t}>
              <h2 className={`text-xs uppercase tracking-wider mb-2 ${TYPE_ACCENT[t].split(' ')[0]}`}>
                {TYPE_LABELS[t]} <span className="text-slate-500">({grouped[t].length})</span>
              </h2>
              <div className={`bg-slate-800 border ${TYPE_ACCENT[t].split(' ')[1]} rounded-xl overflow-hidden`}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/50 border-b border-slate-700 text-slate-400 text-left text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2 w-20">Code</th>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">IRS line</th>
                      <th className="px-4 py-2 w-24">System</th>
                      <th className="px-4 py-2 w-32"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {grouped[t].map(a => (
                      <AccountRow
                        key={a.id}
                        account={a}
                        onRename={(name) => handleInlineRename(a, name)}
                        onDelete={() => handleDelete(a)}
                        onEdit={() => navigate(`/books/settings/accounts/${a.id}`)}
                        deleting={deleting === a.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountRow({ account, onRename, onDelete, onEdit, deleting }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(account.name);

  useEffect(() => { setVal(account.name); }, [account.name]);

  function commit() {
    setEditing(false);
    if (val !== account.name) onRename(val);
  }

  return (
    <tr className="hover:bg-slate-700/30">
      <td className="px-4 py-2 font-mono text-slate-300">{account.code}</td>
      <td className="px-4 py-2 text-slate-100">
        {editing ? (
          <input
            autoFocus
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setVal(account.name); setEditing(false); }
            }}
            className="bg-slate-900 border border-indigo-500 rounded px-2 py-0.5 text-sm text-slate-100 focus:outline-none w-full"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-left hover:text-indigo-300"
            title="Click to rename"
          >
            {account.name}
          </button>
        )}
      </td>
      <td className="px-4 py-2 text-slate-400 text-xs">{account.irs_line || '—'}</td>
      <td className="px-4 py-2 text-xs">
        {account.is_system ? (
          <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">seeded</span>
        ) : (
          <span className="text-slate-500">custom</span>
        )}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button
          onClick={onEdit}
          className="text-indigo-400 hover:text-indigo-300 text-xs mr-3"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50"
        >
          {deleting ? '…' : 'Delete'}
        </button>
      </td>
    </tr>
  );
}