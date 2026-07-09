// Virta Books — Phase C: Settings → Source Mappings.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 (Mappings, R1, R5).

import { useState, useEffect } from 'react';
import { booksApi } from './api.js';

export default function SettingsSourceMappings({ navigate }) {
  const [mappings, setMappings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  async function reload() {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([booksApi.listSourceMappings(), booksApi.listAccounts()]);
      setMappings(m);
      setAccounts(a.filter(x => x.account_type === 'asset' || x.account_type === 'liability'));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function handleDelete(id) {
    if (!confirm('Delete this source mapping?')) return;
    try { await booksApi.deleteSourceMapping(id); reload(); }
    catch (e) { setError(e.message); }
  }

  async function handleSave() {
    try {
      await booksApi.updateSourceMapping(editing.id, {
        date_col: editing.date_col,
        description_col: editing.description_col,
        amount_col: editing.amount_col,
        amount_sign_convention: editing.amount_sign_convention,
        memorized_account_id: editing.memorized_account_id || null,
      });
      setEditing(null);
      reload();
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="p-2 text-slate-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-light tracking-wide">CSV Source Mappings</h2>
        <button
          onClick={() => navigate('/books/settings')}
          className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm"
        >
          ← Back
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-900/40 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : mappings.length === 0 ? (
        <div className="text-sm text-slate-500 p-6 bg-slate-900/50 rounded border border-slate-800 text-center">
          No source mappings yet. Mappings are saved automatically when you import a CSV and check "Save this mapping for future imports".
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-800">
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Date col</th>
                <th className="px-3 py-2">Description col</th>
                <th className="px-3 py-2">Amount col</th>
                <th className="px-3 py-2">Sign</th>
                <th className="px-3 py-2">Memorized account</th>
                <th className="px-3 py-2">Last used</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.id} className="border-b border-slate-800/60">
                  <td className="px-3 py-2 font-mono text-indigo-300">{m.source_key}</td>
                  <td className="px-3 py-2">{m.date_col}</td>
                  <td className="px-3 py-2">{m.description_col}</td>
                  <td className="px-3 py-2">{m.amount_col}</td>
                  <td className="px-3 py-2 text-xs">{m.amount_sign_convention}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {m.memorized_account_code ? `${m.memorized_account_code} ${m.memorized_account_name}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{m.last_used_at}</td>
                  <td className="px-3 py-2 flex gap-1">
                    <button
                      onClick={() => setEditing({ ...m })}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-red-900 text-xs text-rose-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4" onClick={() => setEditing(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-700 rounded-lg max-w-lg w-full p-6">
            <h3 className="text-lg mb-3">Edit mapping</h3>
            <div className="space-y-3">
              <Field label="Date column">
                <input
                  value={editing.date_col}
                  onChange={e => setEditing({ ...editing, date_col: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-200 text-sm"
                />
              </Field>
              <Field label="Description column">
                <input
                  value={editing.description_col}
                  onChange={e => setEditing({ ...editing, description_col: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-200 text-sm"
                />
              </Field>
              <Field label="Amount column">
                <input
                  value={editing.amount_col}
                  onChange={e => setEditing({ ...editing, amount_col: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-200 text-sm"
                />
              </Field>
              <Field label="Sign convention">
                <select
                  value={editing.amount_sign_convention}
                  onChange={e => setEditing({ ...editing, amount_sign_convention: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-200 text-sm"
                >
                  <option value="negative_outflow">negative_outflow</option>
                  <option value="positive_outflow">positive_outflow</option>
                </select>
              </Field>
              <Field label="Memorized source account">
                <select
                  value={editing.memorized_account_id || ''}
                  onChange={e => setEditing({ ...editing, memorized_account_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-200 text-sm"
                >
                  <option value="">— None —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">
                Cancel
              </button>
              <button onClick={handleSave} className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      {children}
    </div>
  );
}