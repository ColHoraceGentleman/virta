import { useEffect, useState } from 'react';
import { booksApi } from './api.js';

const TYPES = [
  { value: 'income',    label: 'Income' },
  { value: 'expense',   label: 'Operating Expense' },
  { value: 'asset',     label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity',    label: 'Equity' },
];

const EMPTY = { code: '', name: '', account_type: 'expense', irs_line: '' };

export default function AccountForm({ navigate, accountId }) {
  const isEdit = !!accountId;
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const a = await booksApi.getAccount(accountId);
        if (!cancelled) setForm({ code: a.code, name: a.name, account_type: a.account_type, irs_line: a.irs_line || '' });
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, isEdit]);

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        account_type: form.account_type,
        irs_line: form.irs_line || null,
      };
      if (!payload.code || !payload.name) {
        throw new Error('Code and name are required');
      }
      if (isEdit) {
        await booksApi.updateAccount(accountId, payload);
      } else {
        await booksApi.createAccount(payload);
      }
      navigate('/books/settings/accounts');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-light tracking-wide text-slate-100 mb-4">
        {isEdit ? 'Edit account' : 'New account'}
      </h1>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
        <label className="block">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Code *</div>
          <input
            value={form.code}
            onChange={e => update('code', e.target.value)}
            required
            placeholder="e.g. 6050"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </label>
        <label className="block">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Name *</div>
          <input
            value={form.name}
            onChange={e => update('name', e.target.value)}
            required
            placeholder="e.g. Print Supplies"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </label>
        <label className="block">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Account type *</div>
          <select
            value={form.account_type}
            onChange={e => update('account_type', e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
          >
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">IRS line</div>
          <input
            value={form.irs_line}
            onChange={e => update('irs_line', e.target.value)}
            placeholder="e.g. Line 18"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Optional. Used by the Schedule C export (Phase E).
          </p>
        </label>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create account')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/books/settings/accounts')}
            className="px-4 py-2 text-slate-300 hover:text-white text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}