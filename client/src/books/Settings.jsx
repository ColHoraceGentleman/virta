// Virta Books — v2 Settings (stub).
//
// Wireframe source of truth: WIREFRAMES.html renderSettings() (line 1422) —
// a 3-tab page (General / Categories / Other). Round 5 of the wireframe
// rounds locked the tab structure; each tab's body still needs a build
// pass when Patrick pulls the trigger, so this renders the full chrome
// (header + tabs + tab body) with a "Coming in Phase 1" placeholder inside
// each tab body.
//
// Per TASK-v2-shell-rebuild.md, the only deviation from the wireframe is
// the "Coming in Phase 1" pill at the top of the page — every tab body is
// itself a placeholder explaining what's coming. No real form fields here
// (those live in the wireframe's tabs; we don't copy them in because they'd
// be inactive and confusing — better to say "this tab is coming" outright).
import { useEffect, useMemo } from 'react';

// Tab keys: wireframe uses 'general' | 'categories' | 'other'.
// Each tab key maps to a URL slug — /books/settings, /books/settings/categories,
// /books/settings/other — so the active tab is shareable.
const TABS = [
  { key: 'general',    label: 'General',     slug: 'general'    },
  { key: 'categories', label: 'Categories',  slug: 'categories' },
  { key: 'other',      label: 'Other',       slug: 'other'      },
];

// Per-tab placeholder copy. Each explains what's coming without copying the
// wireframe's inactive form fields verbatim.
const TAB_BLURBS = {
  general: {
    title: 'General',
    blurb:
      'Your name, business identity, NAICS code, EIN, address, accounting method, fiscal year, and currency. These flow into the rest of the app — invoices, tax filings, reports. Currently sourced from the manual Setup Wizard.',
    fields: [
      'Proprietor + business name (used on invoices, year-end exports)',
      'NAICS code (looked up by keyword)',
      'EIN + business address',
      'Accounting method (Cash default; Accrual coming in a future version)',
      'Fiscal year start month + business start date',
      'Currency (USD default; CAD / EUR / GBP / AUD / MXN also supported)',
    ],
  },
  categories: {
    title: 'Categories',
    blurb:
      'How the Categories Management page behaves on first open. Both options below are currently wired (alphabetical by name is the default) — these settings are just their own home so you don\'t have to scroll to find them.',
    fields: [
      'Default sort (alphabetical by name / numerical by code)',
      'Show 4-digit account numbers next to each category (turn off if your accountant prefers names only)',
      'Review Later badge in sidebar (turn off once auto-categorization is fully tuned)',
    ],
  },
  other: {
    title: 'Other',
    blurb:
      'Read-mostly accounting metadata plus a back door into the Setup Wizard. Real values (accounting method, fiscal year, business type) are populated by the wizard today; this tab is their settings home once the Settings page is fully built.',
    fields: [
      'Accounting method (currently Cash — Accrual coming in a future version)',
      'Fiscal year start (currently January)',
      'Business type (currently Sole proprietor)',
      'Run setup wizard again (jump back to step 1 with current values intact)',
    ],
  },
};

export default function Settings({ navigate, path }) {
  // Pick the tab from the path. /books/settings → general (default).
  // /books/settings/categories → categories. /books/settings/other → other.
  const activeTab = useMemo(() => {
    if (!path) return 'general';
    const m = path.match(/^\/books\/settings\/(general|categories|other)\/?$/);
    return m ? m[1] : 'general';
  }, [path]);

  // Normalize /books/settings (no slash, no slug) → /books/settings/general so
  // the URL stays shareable and the back button does the expected thing.
  useEffect(() => {
    if (path === '/books/settings' || path === '/books/settings/') {
      navigate('/books/settings/general');
    }
  }, [path, navigate]);

  const tab = TAB_BLURBS[activeTab] || TAB_BLURBS.general;

  return (
    <div>
      {/* Phase pill — the only deviation from the wireframe, per spec. */}
      <div className="mb-4">
        <span className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-xs">
          Coming in Phase 1
        </span>
      </div>

      <h1 className="text-2xl font-light tracking-wide text-slate-100 mb-4">Settings</h1>

      {/* Tab bar — wireframe-accurate segmented control. Active tab gets
          indigo background, inactive tabs match the dark chrome. */}
      <div className="flex gap-1 border-b border-slate-700 mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => navigate(`/books/settings/${t.slug}`)}
            className={`px-4 py-2 text-sm rounded-t transition-colors ${
              activeTab === t.key
                ? 'bg-slate-800 border border-slate-700 border-b-slate-800 text-slate-100'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab body — placeholder for the real Settings tab content. */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow">
        <h3 className="text-lg font-medium text-slate-100 mt-0 mb-3">{tab.title}</h3>
        <p className="text-sm text-slate-300 mb-4">{tab.blurb}</p>
        <div className="px-3 py-3 bg-slate-900/60 border border-slate-700 rounded mb-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            This tab will include
          </div>
          <ul className="text-sm text-slate-300 space-y-1.5 list-disc list-inside">
            {tab.fields.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
