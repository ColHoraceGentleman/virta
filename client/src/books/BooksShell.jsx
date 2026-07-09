// Virta Books — v2 Shell (greenfield, wireframe-only nav).
//
// 5 surfaces, one Settings submenu, no v1 carryover:
//   📊 Dashboard      → /books                  (default landing)
//   🧙 Setup Wizard   → /books/setup            (stub — Phase 1)
//   🗂️  Categories    → /books/categories       (stub — Phase 1)
//   📒 Transactions   → /books/transactions     (built in 2f48417, fixed in 2a97193)
//   ⚙️  Settings      → /books/settings         (stub — Phase 1)
//
// Settings submenu (round 5): General / Categories / Other. The submenu is
// only rendered on /books/settings* routes; everywhere else it's hidden.
//
// Replaced v1's 9-link top nav + 5-link Settings submenu. v1 routes
// (Invoices / Payments / Customers / Import / Categorize / Reconcile /
// Reports + Settings → Accounts / Invoices / Source Mappings / Vendor Rules)
// were archived to client/src/books/_archived/ — they're no longer linked
// from the shell but kept around in case any external smoke/harness still
// imports them.
import { useState, useEffect, useCallback } from 'react';
import Dashboard from './Dashboard.jsx';
import SetupWizard from './SetupWizard.jsx';
import Categories from './Categories.jsx';
import Transactions from './Transactions.jsx';
import Settings from './Settings.jsx';

// Tiny client-side router. Reads window.location.pathname, listens to popstate.
// Pushes new paths via history.pushState. Avoids a hard reload on nav.
// Mirrors the v1 usePath — kept here so the shell's dependency surface
// doesn't grow; App.jsx imports BooksShell only.
function usePath() {
  const [path, setPath] = useState(
    typeof window !== 'undefined' ? window.location.pathname : '/books'
  );
  useEffect(() => {
    function onPop() { setPath(window.location.pathname); }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to);
      setPath(to);
    }
  }, []);
  return [path, navigate];
}

// v2 left rail — 5 surfaces, segmented links. Matches the wireframe's
// vertical-list nav (WIREFRAMES.html sidebar). Left rail instead of the v1
// top tab bar so there's room for the Settings submenu to expand inline on
// the right side of the layout.
function BooksNav({ path, navigate }) {
  const link = (to, label, emoji) => {
    // Active = exact match for /books; startsWith for nested routes.
    const active = to === '/books'
      ? path === '/books' || path === '/books/' || path === ''
      : path === to || path.startsWith(`${to}/`);
    return (
      <button
        type="button"
        onClick={() => navigate(to)}
        className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          active
            ? 'bg-slate-800 text-slate-100 border border-slate-700'
            : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
        }`}
      >
        <span className="text-base w-5 text-center">{emoji}</span>
        <span>{label}</span>
      </button>
    );
  };
  return (
    <nav className="w-56 shrink-0 p-3">
      {/* Brand block — mirrors the v1 brand strip. Kept as text-only so this
          rebuild stays inside the current dark chrome (not Direction B). */}
      <div className="px-2 pb-4 mb-2 border-b border-slate-800">
        <button
          type="button"
          onClick={() => navigate('/books')}
          className="flex items-center gap-1.5 text-slate-100"
          style={{ fontSize: 17, fontWeight: 300, letterSpacing: '0.28em', textTransform: 'uppercase' }}
          title="Virta Books"
        >
          <span style={{ color: '#6366f1', fontWeight: 200, fontSize: 22, lineHeight: 1, marginTop: -2, letterSpacing: 0 }}>~</span>
          <span>VIRTA BOOKS</span>
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {link('/books',              'Dashboard',     '📊')}
        {link('/books/setup',        'Setup Wizard',  '🧙')}
        {link('/books/categories',   'Categories',    '🗂️')}
        {link('/books/transactions', 'Transactions',  '📒')}
        {link('/books/settings',     'Settings',      '⚙️')}
      </div>
      {/* Version pill — same placement as v1, content updated for the rebuild. */}
      <div className="mt-6 px-2 text-[11px] text-slate-500">
        <span className="opacity-80">v2 shell · 5 surfaces</span>
      </div>
    </nav>
  );
}

// Settings submenu — only rendered on /books/settings* routes. The wireframe
// lumps General / Categories / Other together; we render them as in-page
// sub-tabs inside Settings.jsx, but this submenu surfaces them as quick
// buttons up top so they're discoverable. (Patrick's "Settings only has 3
// tabs" call — TASK v1 sub-menu had 5 entries: Accounts / Customers /
// Invoices / Source Mappings / Vendor Rules.)
function SettingsSubmenu({ path, navigate }) {
  const tab = (to, label) => {
    const active = path === to;
    return (
      <button
        type="button"
        onClick={() => navigate(to)}
        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
          active
            ? 'bg-slate-700 text-slate-100 border border-slate-600'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800 border border-transparent'
        }`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="mb-4 px-3 py-2 bg-slate-900/40 rounded-lg border border-slate-800 flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500 px-1 self-center">Settings:</span>
      {tab('/books/settings/general',    'General')}
      {tab('/books/settings/categories', 'Categories')}
      {tab('/books/settings/other',      'Other')}
    </div>
  );
}

// Mounted at /books/* — picks the right page based on path.
export default function BooksShell() {
  const [path, navigate] = usePath();

  // Settings page surfaces the submenu. We treat ANY /books/settings* as a
  // settings page so external links like /books/settings/accounts redirect
  // here and land on General rather than 404'ing.
  const isSettingsPage = path === '/books/settings'
    || path === '/books/settings/'
    || path.startsWith('/books/settings/');

  let page;
  if (path === '/books' || path === '/books/' || path === '/books/dashboard') {
    // /books (default) and /books/dashboard both → Dashboard. The latter is
    // a v1 leftover URL; we honor it so any old bookmarks don't break.
    page = <Dashboard navigate={navigate} />;
  } else if (path === '/books/setup' || path === '/books/setup/') {
    page = <SetupWizard navigate={navigate} />;
  } else if (path === '/books/categories' || path === '/books/categories/') {
    page = <Categories navigate={navigate} />;
  } else if (path === '/books/transactions' || path === '/books/transactions/') {
    page = <Transactions navigate={navigate} />;
  } else if (isSettingsPage) {
    page = <Settings navigate={navigate} path={path} />;
  } else {
    // Unknown /books/* — friendly "Coming soon" stub. Not a 404.
    page = (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-xl">
        <div className="mb-3">
          <span className="inline-block px-2 py-0.5 rounded bg-slate-700 border border-slate-700 text-slate-400 text-xs">
            Coming soon
          </span>
        </div>
        <h2 className="text-xl font-light text-slate-100 mt-0 mb-2">
          That page isn't wired up yet
        </h2>
        <p className="text-slate-300 text-sm mb-1">
          <code className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs">{path}</code> isn't part of the v2 shell yet.
        </p>
        <p className="text-slate-400 text-xs mb-4">
          The v2 shell surfaces five surfaces from the wireframes (Dashboard,
          Setup Wizard, Categories, Transactions, Settings). Anything else is
          either archived v1 work or a future-phase build.
        </p>
        <button
          type="button"
          onClick={() => navigate('/books')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-900 text-slate-100">
      <BooksNav path={path} navigate={navigate} />
      <main className="flex-1 p-6 max-w-6xl">
        {isSettingsPage && <SettingsSubmenu path={path} navigate={navigate} />}
        {page}
      </main>
    </div>
  );
}
