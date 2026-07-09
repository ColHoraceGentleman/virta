// Virta Books — v2 Categories (stub).
//
// Wireframe source of truth: WIREFRAMES.html renderMgmt() (line 881) — a
// single-page Categories Management with a search bar, 4 filter chips (Show
// All / Expenses / Income / Assets/Liabilities/Equity), Show hidden toggle,
// helper copy, and a scrollable table of rows. Design is locked through
// rounds 1-14; the build is part of Phase 1 once Patrick pulls the trigger.
//
// This stub shows the wireframe's full chrome (search row + chips + Show
// hidden + empty-state table) so the page isn't a blank screen. The table
// body is an empty-state row with the same copy the wireframe shows.
// Per TASK-v2-shell-rebuild.md it adds a "Coming in Phase 1" pill — the
// only deviation from the wireframe — so it's clearly a placeholder.
import { useState } from 'react';

const CHIPS = [
  { key: 'all',       label: 'Show All' },
  { key: 'expenses',  label: 'Expenses' },
  { key: 'revenue',   label: 'Income' },
  { key: 'ale',       label: 'Assets/Liabilities/Equity' },
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

  const showHiddenChecked = false;
  const hiddenCount = 0;

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
            disabled
            placeholder="🔍 Search categories by name, code, or line…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-sm text-slate-300 flex-1 min-w-[240px] max-w-[520px] focus:outline-none focus:border-indigo-500 disabled:opacity-60"
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

        {/* Helper copy — matches the wireframe's "N of M categories" line shape,
            using placeholder counts. */}
        <p className="text-xs text-slate-400 mb-3">
          0 of 0 categories. Default sort: alphabetical by name (change in <button type="button" onClick={() => navigate('/books/settings/categories')} className="text-indigo-300 hover:text-indigo-200 underline">Settings → Categories</button>).
        </p>

        {/* Table — empty state. Real build fills the body with mgmtUnifiedRow rows. */}
        <div className="max-h-[520px] overflow-auto border border-slate-700 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-slate-400 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2" style={{ width: 220 }}>Name</th>
                <th className="px-3 py-2" style={{ width: 110 }}>Type</th>
                <th className="px-3 py-2">Tax Line Item</th>
                <th className="px-3 py-2 text-right" style={{ width: 110 }}>Balance</th>
                <th className="px-3 py-2" style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400 text-sm">
                  No categories match the current filters.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
