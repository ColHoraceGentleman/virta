// Virta Books — v2 Categories (stub).
//
// Wireframe source of truth: WIREFRAMES.html renderMgmt() (line 881) — a
// single-page Categories Management with a search bar, 4 filter chips (Show
// All / Expenses / Income / Assets/Liabilities/Equity), Show hidden toggle,
// helper copy, and a scrollable table of rows. Design is locked through
// rounds 1-14; the build is part of Phase 1 once Patrick pulls the trigger.
//
// This stub shows the wireframe's full chrome (search row + chips + Show
// hidden + populated table) seeded with the same default categories the
// wireframe ships with (Office Supplies, Advertising, Sales, etc.). The
// real Phase 1 build will replace the static seed with `accounts.listAccounts()`
// from the API. Per TASK-v2-shell-rebuild.md it adds a "Coming in Phase 1"
// pill — the only deviation from the wireframe — so it's clearly a placeholder.
import { useState } from 'react';

const CHIPS = [
  { key: 'all',       label: 'Show All' },
  { key: 'expenses',  label: 'Expenses' },
  { key: 'revenue',   label: 'Income' },
  { key: 'ale',       label: 'Assets/Liabilities/Equity' },
];

// Sample categories matching the wireframe's default seed chart
// (WIREFRAMES.html lines 215+, locked through rounds 1-14).
const SAMPLE_CATEGORIES = [
  { code: '4000', name: 'Sales',                      type: 'Income',     tax: 'Part I, Line 1 — Gross receipts or sales',     balance: 1200.00, hidden: false },
  { code: '4020', name: 'Refunds & Returns',          type: 'Income',     tax: 'Part I, Line 2 — Returns and allowances',    balance:    0.00, hidden: false },
  { code: '4030', name: 'Other Income',               type: 'Income',     tax: 'Part I, Line 7 — Other income',                balance:    0.00, hidden: false },
  { code: '6010', name: 'Advertising',                type: 'Expense',    tax: 'Part II, Line 8 — Advertising',                balance:    0.00, hidden: false },
  { code: '6020', name: 'Car & Truck',                type: 'Expense',    tax: 'Part II, Line 9 — Car and truck expenses',    balance:    0.00, hidden: false },
  { code: '6030', name: 'Commissions & Fees',         type: 'Expense',    tax: 'Part II, Line 10 — Commissions and fees',     balance:    0.00, hidden: false },
  { code: '6040', name: 'Contract Labor',             type: 'Expense',    tax: 'Part II, Line 11 — Contract labor',            balance:    0.00, hidden: false },
  { code: '6050', name: 'Depletion',                  type: 'Expense',    tax: 'Part II, Line 12 — Depletion',                 balance:    0.00, hidden: false },
  { code: '6060', name: 'Depreciation',               type: 'Expense',    tax: 'Part II, Line 13 — Depreciation and sec. 179', balance:    0.00, hidden: false },
  { code: '6100', name: 'Insurance',                  type: 'Expense',    tax: 'Part II, Line 15 — Insurance',                 balance:    0.00, hidden: false },
  { code: '6120', name: 'Office Expense',             type: 'Expense',    tax: 'Part II, Line 18 — Office expense',            balance:   86.42, hidden: false },
  { code: '6200', name: 'Software & Subscriptions',   type: 'Expense',    tax: 'Part II, Line 22 — Supplies',                  balance:    0.00, hidden: false },
  { code: '6210', name: 'Travel',                     type: 'Expense',    tax: 'Part II, Line 24a — Travel',                  balance:    0.00, hidden: false },
  { code: '6220', name: 'Meals (50% deductible)',     type: 'Expense',    tax: 'Part II, Line 24b — Deductible meals',         balance:    0.00, hidden: false },
  { code: '1000', name: 'Business Checking',          type: 'Asset',     tax: '',                                              balance: 1136.42, hidden: false },
  { code: '1200', name: 'Accounts Receivable',        type: 'Asset',     tax: '',                                              balance:    0.00, hidden: false },
  { code: '3010', name: "Owner's Equity",             type: 'Equity',    tax: '',                                              balance: -250.00, hidden: false },
  { code: '9999', name: 'Review Later',               type: 'Expense',    tax: '',                                              balance:    0.00, hidden: false, system: true },
];

export default function Categories({ navigate }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Title mirrors the wireframe's "Categories" / "Categories — Expenses" /
  // "Categories — Income" / "Categories — Assets / Liabilities / Equity" pattern.
  const title =
    filter === 'expenses' ? 'Categories — Expenses'
    : filter === 'revenue' ? 'Categories — Income'
    : filter === 'ale' ? 'Categories — Assets / Liabilities / Equity'
    : 'Categories';

  // Filter the sample data by chip and search. Real build calls accounts.listAccounts().
  const matchesChip = (cat) => {
    if (filter === 'all') return true;
    if (filter === 'expenses') return cat.type === 'Expense';
    if (filter === 'revenue') return cat.type === 'Income';
    if (filter === 'ale') return ['Asset', 'Liability', 'Equity'].includes(cat.type);
    return true;
  };
  const matchesSearch = (cat) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return cat.name.toLowerCase().includes(q)
      || cat.code.toLowerCase().includes(q)
      || cat.tax.toLowerCase().includes(q);
  };
  const visible = SAMPLE_CATEGORIES.filter(matchesChip).filter(matchesSearch);

  const showHiddenChecked = false;
  const hiddenCount = SAMPLE_CATEGORIES.filter(c => c.hidden).length;

  const fmtMoney = (n) => {
    const v = Number(n || 0);
    return (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2);
  };

  return (
    <div>
      {/* Phase pill — the only deviation from the wireframe, per spec. */}
      <div className="mb-4">
        <span className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-xs">
          Coming in Phase 1
        </span>
      </div>

      <h1 className="text-2xl font-light tracking-wide text-slate-100 mb-4">{title}</h1>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow">
        {/* Search + chips + Show hidden + Add — wireframe-accurate chrome row. */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <input
            type="text"
            placeholder="🔍 Search categories by name, code, or line…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-sm text-slate-300 flex-1 min-w-[240px] max-w-[520px] focus:outline-none focus:border-indigo-500"
          />
          <div className="flex flex-wrap gap-2">
            {CHIPS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  filter === key
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={showHiddenChecked}
              disabled
              onChange={() => {}}
              className="disabled:opacity-60"
            />
            Show hidden ({hiddenCount})
          </label>
          <div className="flex-1" />
          <button
            type="button"
            disabled
            title="Add category launches with the Categories build"
            className="px-3 py-1.5 bg-slate-700 text-slate-400 rounded text-xs cursor-not-allowed"
          >
            + Add category
          </button>
        </div>

        {/* Helper copy — matches the wireframe's "N of M categories" line shape. */}
        <p className="text-xs text-slate-400 mb-3">
          {visible.length} of {SAMPLE_CATEGORIES.length} categories. Default sort: alphabetical by name (change in <button type="button" onClick={() => navigate('/books/settings/categories')} className="text-indigo-300 hover:text-indigo-200 underline">Settings → Categories</button>).
        </p>

        {/* Table — wireframe-accurate columns: Name / Type / Tax Line Item / Balance / Actions. */}
        <div className="max-h-[520px] overflow-auto border border-slate-700 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-slate-400 text-left text-xs uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-3 py-2" style={{ width: 220 }}>Name</th>
                <th className="px-3 py-2" style={{ width: 80 }}>Code</th>
                <th className="px-3 py-2" style={{ width: 90 }}>Type</th>
                <th className="px-3 py-2">Tax Line Item</th>
                <th className="px-3 py-2 text-right" style={{ width: 110 }}>Balance</th>
                <th className="px-3 py-2" style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400 text-sm">
                    No categories match the current filters.
                  </td>
                </tr>
              ) : (
                visible.map((cat) => (
                  <tr key={cat.code} className={`hover:bg-slate-700/30 ${cat.system ? 'opacity-70' : ''}`}>
                    <td className="px-3 py-2 text-slate-100">
                      {cat.name}
                      {cat.system && <span className="ml-1.5 text-[10px] text-slate-500">(System)</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-300 font-mono text-xs">{cat.code}</td>
                    <td className="px-3 py-2 text-slate-300 text-xs">{cat.type}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{cat.tax || <span className="text-slate-600">—</span>}</td>
                    <td className={`px-3 py-2 text-right font-mono text-xs ${cat.balance < 0 ? 'text-red-400' : cat.balance > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {fmtMoney(cat.balance)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      <button
                        type="button"
                        disabled
                        className="text-indigo-400/50 mr-3 cursor-not-allowed"
                        title="Edit launches with the Categories build"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled
                        className="text-red-400/50 cursor-not-allowed"
                        title="Hide launches with the Categories build"
                      >
                        Hide
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}