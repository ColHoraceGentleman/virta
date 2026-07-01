// Virta Books — Phase C: Settings → Vendor Rules.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 + §6 (vendor rules: pattern → category).

import { useState, useEffect } from 'react';
import { booksApi } from './api.js';

export default function SettingsVendorRules({ navigate }) {
  const [rules, setRules] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newPattern, setNewPattern] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [editing, setEditing] = useState(null);

  async function reload() {
    setLoading(true);
    try {
      const [r, a] = await Promise.all([booksApi.listVendorRules(), booksApi.listAccounts()]);
      setRules(r);
      setAccounts(a);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function handleDelete(id) {
    if (!confirm('Delete this vendor rule?')) return;
    try { await booksApi.deleteVendorRule(id); reload(); }
    catch (e) { setError(e.message); }
  }

  async function handleToggle(rule) {
    try {
      await booksApi.updateVendorRule(rule.id, { is_active: !rule.is_active });
      reload();
    } catch (e) { setError(e.message); }
  }

  async function handleSave() {
    try {
      await booksApi.updateVendorRule(editing.id, {
        vendor_pattern: editing.vendor_pattern,
        category_account_id: editing.category_account_id,
        is_active: editing.is_active ? 1 : 0,
      });
      setEditing(null);
      reload();
    } catch (e) { setError(e.message); }
  }

  async function handleCreate() {
    if (!newPattern || !newCategoryId) return;
    try {
      await booksApi.createVendorRule({
        vendor_pattern: newPattern,
        category_account_id: newCategoryId,
        apply_to_existing: true,
      });
      setCreating(false);
      setNewPattern('');
      setNewCategoryId('');
      reload();
    } catch (e) { setError(e.message); }
  }

  const cats = accounts.filter(a => a.account_type === 'expense' || a.account_type === 'income');

  return (
    <div className="p-2 text-slate-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-light tracking-wide">Vendor Rules</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setCreating(true)}
            className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
          >
            + New rule
          </button>
          <button
            onClick={() => navigate('/books/settings')}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm"
          >
            ← Back
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-900/40 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {creating && (
        <div className="mb-4 px-4 py-3 bg-slate-800 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Vendor pattern (substring match)</label>
              <input
                value={newPattern}
                onChange={e => setNewPattern(e.target.value)}
                placeholder="e.g. joann, amazon, etsy"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-slate-200 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Category account</label>
              <select
                value={newCategoryId}
                onChange={e => setNewCategoryId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-slate-200 text-sm"
              >
                <option value="">— Choose —</option>
                {cats.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newPattern || !newCategoryId}
              className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm">
              Create
            </button>
            <button onClick={() => setCreating(false)} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">
              Cancel
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Applies retroactively to all uncategorized transactions matching the pattern.
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="text-sm text-slate-500 p-6 bg-slate-900/50 rounded border border-slate-800 text-center">
          No vendor rules yet. Create one to auto-categorize recurring vendors.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-800">
                <th className="px-3 py-2">Pattern</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Match count</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-slate-800/60">
                  <td className="px-3 py-2 font-mono">{r.vendor_pattern}</td>
                  <td className="px-3 py-2 text-slate-400">{r.category_code} {r.category_name}</td>
                  <td className="px-3 py-2 tabular-nums">{r.match_count}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleToggle(r)}
                      className={`px-2 py-0.5 rounded text-xs ${r.is_active ? 'bg-emerald-900/60 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}
                    >
                      {r.is_active ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="px-3 py-2 flex gap-1">
                    <button
                      onClick={() => setEditing({ ...r })}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
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
          <div onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg mb-3">Edit vendor rule</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Pattern</label>
                <input
                  value={editing.vendor_pattern}
                  onChange={e => setEditing({ ...editing, vendor_pattern: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Category</label>
                <select
                  value={editing.category_account_id}
                  onChange={e => setEditing({ ...editing, category_account_id: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-200 text-sm"
                >
                  <option value="">— Choose —</option>
                  {cats.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                </select>
              </div>
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