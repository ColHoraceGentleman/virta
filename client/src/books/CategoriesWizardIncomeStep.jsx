// Virta Books — Categories Wizard Step 3: Income categories.
//
// Per TASK-b3a-categories-wizard-first-half.md §4. Same layout as Step 2
// (sticky header, sortable columns, Hide/Delete, tax-line popover, +Add
// placeholder modal). Default order (per CategoriesWizard.jsx's
// DEFAULT_INCOME) is Sales → Refunds & Returns → Other Income — NOT
// alphabetical (CW-007 exception) — but the table remains sortable; the
// user can still click "Name" to sort alphabetically if they want.
import { useMemo, useState } from 'react';
import PlaceholderAddAccountModal from './PlaceholderAddAccountModal.jsx';

// IRS_LINE_OPTIONS — Schedule C Part I line descriptors (income side).
export const IRS_LINE_OPTIONS = [
  'Part I line 1',
  'Part I line 2',
  'Part I line 4',
  'Part I line 6',
  'Part I line 7',
];

function SortHeader({ label, field, sort, onSort }) {
  const active = sort.field === field;
  const arrow = active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕';
  return (
    <th
      className="px-3 py-2 cursor-pointer select-none group"
      onClick={() => onSort(field)}
      data-testid={`income-sort-${field}`}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className={active ? 'text-indigo-300' : 'text-slate-600 group-hover:text-slate-400'}>
          {arrow}
        </span>
      </span>
    </th>
  );
}

function TaxLinePopover({ account, onChange, onClose }) {
  return (
    <div
      className="absolute z-40 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 w-56"
      data-testid={`income-taxline-popover-${account.id}`}
    >
      <div className="text-xs text-slate-400 mb-2">
        Current: <span className="text-slate-200">{account.irs_line || '—'}</span>
      </div>
      <select
        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 mb-2"
        value={account.irs_line || ''}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`income-taxline-select-${account.id}`}
      >
        <option value="">— None —</option>
        {IRS_LINE_OPTIONS.map((line) => (
          <option key={line} value={line}>{line}</option>
        ))}
      </select>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-100"
          data-testid={`income-taxline-close-${account.id}`}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// DEFAULT_ORDER_INDEX — used as the initial sort key so the unsorted view
// respects Sales → Refunds & Returns → Other Income (VB-CATWIZ-STEP3-02)
// instead of falling back to array order alone once accounts are added/
// removed. `sort.field === null` means "no explicit sort chosen yet" and
// we render in this default order; clicking any column header switches to
// that explicit sort.
export default function CategoriesWizardIncomeStep({
  accounts,
  showAccountNumbers,
  updateAccount,
  hideAccount,
  deleteAccount,
  setStep,
}) {
  const [sort, setSort] = useState({ field: null, dir: 'asc' });
  const [editingNameId, setEditingNameId] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [openTaxPopoverId, setOpenTaxPopoverId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const onSort = (field) => {
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }));
  };

  const sorted = useMemo(() => {
    // No explicit sort chosen: preserve the incoming array order, which
    // CategoriesWizard.jsx seeds as DEFAULT_INCOME's intentional
    // Sales / Refunds & Returns / Other Income order.
    if (!sort.field) return accounts;
    const copy = [...accounts];
    const dir = sort.dir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      const av = (a[sort.field] ?? '').toString().toLowerCase();
      const bv = (b[sort.field] ?? '').toString().toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return copy;
  }, [accounts, sort]);

  const startEditName = (acc) => {
    setEditingNameId(acc.id);
    setNameDraft(acc.name);
  };
  const commitEditName = (acc) => {
    if (nameDraft.trim() && nameDraft !== acc.name) {
      updateAccount(acc.id, { name: nameDraft.trim() });
    }
    setEditingNameId(null);
  };

  const confirmDeleteAccount = confirmDeleteId != null ? accounts.find((a) => a.id === confirmDeleteId) : null;

  return (
    <div data-testid="cat-wizard-step3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-light text-slate-100 m-0">Income categories</h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          data-testid="cat-wizard-add-income"
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
        >
          + Add income category
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-8 text-center mb-6" data-testid="income-empty-state">
          <p className="text-slate-300 text-sm mb-3">No income categories. Click +Add to create your first.</p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
          >
            + Add income category
          </button>
        </div>
      ) : (
        <div className="max-h-[420px] overflow-auto border border-slate-700 rounded-lg mb-6">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left text-xs uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <SortHeader label="Name" field="name" sort={sort} onSort={onSort} />
                {showAccountNumbers && <SortHeader label="Code" field="code" sort={sort} onSort={onSort} />}
                <SortHeader label="Tax line" field="irs_line" sort={sort} onSort={onSort} />
                <th className="px-3 py-2">Descriptor</th>
                <th className="px-3 py-2 text-right" style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {sorted.map((acc) => {
                const hasTx = (acc.transactions_count || 0) > 0;
                return (
                  <tr key={acc.id} className={`hover:bg-slate-700/30 ${acc.system ? 'opacity-70' : ''}`} data-testid={`income-row-${acc.id}`}>
                    <td className="px-3 py-2 text-slate-100">
                      {editingNameId === acc.id ? (
                        <input
                          autoFocus
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          onBlur={() => commitEditName(acc)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitEditName(acc); if (e.key === 'Escape') setEditingNameId(null); }}
                          className="bg-slate-900 border border-indigo-500 rounded px-1.5 py-0.5 text-sm text-slate-100 w-full"
                          data-testid={`income-name-input-${acc.id}`}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => !acc.system && startEditName(acc)}
                          className={`text-left ${acc.system ? 'cursor-default' : 'hover:underline'}`}
                          data-testid={`income-name-${acc.id}`}
                        >
                          {acc.name}
                          {acc.system && <span className="ml-1.5 text-[10px] text-slate-500">(System)</span>}
                        </button>
                      )}
                    </td>
                    {showAccountNumbers && (
                      <td className="px-3 py-2 text-slate-300 font-mono text-xs">{acc.code}</td>
                    )}
                    <td className="px-3 py-2 text-xs relative">
                      <button
                        type="button"
                        onClick={() => setOpenTaxPopoverId(openTaxPopoverId === acc.id ? null : acc.id)}
                        className="inline-block px-2 py-0.5 rounded-full bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600"
                        data-testid={`income-taxline-badge-${acc.id}`}
                      >
                        {acc.irs_line || '—'}
                      </button>
                      {openTaxPopoverId === acc.id && (
                        <TaxLinePopover
                          account={acc}
                          onChange={(val) => updateAccount(acc.id, { irs_line: val })}
                          onClose={() => setOpenTaxPopoverId(null)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{acc.descriptor}</td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => hideAccount(acc.id)}
                        className="text-indigo-400 hover:text-indigo-300 mr-3"
                        data-testid={`income-hide-${acc.id}`}
                      >
                        {acc.is_hidden ? 'Unhide' : 'Hide'}
                      </button>
                      {hasTx ? (
                        <span
                          className="text-slate-600 cursor-not-allowed"
                          title="This account has transactions. Manage it from Categories after setup."
                          data-testid={`income-delete-disabled-${acc.id}`}
                        >
                          Delete
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(acc.id)}
                          className="text-red-400 hover:text-red-300"
                          data-testid={`income-delete-${acc.id}`}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setStep(2)}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => setStep(4)}
          data-testid="cat-wizard-step3-next"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
        >
          Next →
        </button>
      </div>

      {confirmDeleteAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="income-delete-confirm-modal">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-light text-slate-100 mt-0 mb-2">Delete this category?</h3>
            <p className="text-slate-300 text-sm mb-5">This can't be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { deleteAccount(confirmDeleteAccount.id); setConfirmDeleteId(null); }}
                data-testid="income-delete-confirm"
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <PlaceholderAddAccountModal
        open={addOpen}
        type="income"
        onClose={() => setAddOpen(false)}
        onSave={() => setAddOpen(false)}
      />
    </div>
  );
}
