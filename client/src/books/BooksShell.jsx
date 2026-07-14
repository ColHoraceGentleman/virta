// Virta Books — v2 Shell (B2a-wizard-A: sidebar 4-link + first-run gate).
//
// 4 surfaces (Setup Wizard removed from sidebar — it's a once-and-done flow,
// reached via the first-run CTA and Dashboard "Continue setup" CTA):
//   📊 Dashboard      → /books                  (default landing — 3-state content)
//   🗂️  Categories    → /books/categories       (built in B1)
//   📒 Transactions   → /books/transactions     (built in B1, polished in B1a)
//   ⚙️  Settings      → /books/settings         (3-tab submenu: General / Categories / Other)
//
// The Setup Wizard route /books/setup still exists (SetupWizard.jsx stub) and
// is reachable from Dashboard's first-run / continue-setup CTAs. It is NOT in
// the sidebar because per Patrick's 2026-07-13 14:01 MDT call, the wizard is
// a once-and-done flow — once you've finished, you don't need a sidebar
// shortcut to it. (Long-term: a Settings → "Restart wizard" affordance lands
// in B5; once the full Books surface is built it goes away entirely.)
//
// First-run gate (B2a-wizard-A, re-fetch wired B2b-2):
//   BooksShell fetches GET /api/v1/books/businesses/current on mount and
//   decides whether to render the sidebar:
//     - State A (404 / no business row) → hide sidebar; full-page welcome.
//     - State C (200 with business data) → show sidebar; Dashboard renders
//       Welcome back content.
//   State B (setup in progress, business exists with setupCompletedAt === null)
//   is described in the spec but cannot be detected here — setupCompletedAt
//   lives in wizard-local localStorage, not on the businesses row, so
//   "business exists" continues to map to State C.
//   B2b-2 (Wren B2a-wizard-B NIT F7): useSetupGate now exposes `refetch`,
//   passed into SetupWizard as `onSetupComplete`. When the wizard's Step 6
//   final POST succeeds, it calls this so the gate flips from first-run to
//   ready immediately — the sidebar appears without a hard reload.
//
// /books/categories/wizard (B2b-2): routes to Categories.jsx as a stand-in
// until B3a's real Categories Wizard ships. This is the first hop in the
// Setup Wizard's post-completion navigation fallback chain (see
// SetupWizard.jsx's CATEGORIES_NAV_CHAIN).
//
// Settings submenu: only rendered on /books/settings* routes. Three tabs:
// General / Categories / Other.
import { useState, useEffect, useCallback } from 'react';
import Dashboard from './Dashboard.jsx';
import SetupWizard from './SetupWizard.jsx';
import Categories from './Categories.jsx';
import Transactions from './Transactions.jsx';
import Settings from './Settings.jsx';
import { booksApi } from './api.js';

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

// v2 left rail — 4 surfaces (Setup Wizard removed in B2a-wizard-A).
// Vertical list matches the wireframe's sidebar (WIREFRAMES.html).
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
        {link('/books/categories',   'Categories',    '🗂️')}
        {link('/books/transactions', 'Transactions',  '📒')}
        {link('/books/settings',     'Settings',      '⚙️')}
      </div>
      {/* Version pill — same placement as v1, content updated for the rebuild. */}
      <div className="mt-6 px-2 text-[11px] text-slate-500">
        <span className="opacity-80">v2 shell · 4 surfaces</span>
      </div>
    </nav>
  );
}

// Settings submenu — only rendered on /books/settings* routes. The wireframe
// lumps General / Categories / Other together; we render them as in-page
// sub-tabs inside Settings.jsx, but this submenu surfaces them as quick
// buttons up top so they're discoverable.
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

// B2a-wizard-A: determine which top-level state we're in based on
// GET /businesses/current.
//
//   'loading'        → still fetching; BooksShell shows a minimal loading state.
//   'first-run'      → 404 OR data: null. Sidebar hidden; full-page welcome card.
//   'ready'          → 200 with business data. Sidebar visible; Dashboard is State C.
//   'error'          → fetch failed. Treat as first-run with a small notice.
//
// Why 'error' → 'first-run': if we can't reach the server, the user clearly
// hasn't gotten far enough for a Dashboard to make sense. Defaulting to the
// welcome card is the most conservative (and least broken-looking) fallback.
//
// B2b-2 (Wren B2a-wizard-B NIT F7): exposes a `refetch` function alongside
// the gate state. SetupWizard.jsx's Step 6 final-POST success handler
// calls this (via the `onSetupComplete` prop BooksShell passes down) so
// the first-run → ready transition fires immediately — without it, the
// sidebar wouldn't appear until the next full page load.
function useSetupGate() {
  const [gate, setGate] = useState({ status: 'loading', business: null, error: null });

  const fetchGate = useCallback(async () => {
    try {
      const data = await booksApi.getCurrentBusiness();
      // booksApi.getCurrentBusiness returns the unwrapped `data` field
      // (the business row) on 200, and throws on 404/5xx. So if we got
      // here with truthy data → State C; the booksApi wrapper would have
      // thrown on 404. If a future API change returns 200 with data: null,
      // we treat that as first-run per the B2a-wizard-A brief.
      if (!data) {
        setGate({ status: 'first-run', business: null, error: null });
      } else {
        setGate({ status: 'ready', business: data, error: null });
      }
    } catch (err) {
      // 404 → first-run; anything else → error (which also renders first-run
      // with a "couldn't reach server" notice).
      const isNotFound = err && (err.code === 'NOT_FOUND' || err.status === 404);
      if (isNotFound) {
        setGate({ status: 'first-run', business: null, error: null });
      } else {
        setGate({ status: 'error', business: null, error: err && err.message || 'Unknown error' });
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Guard against setting state after unmount — fetchGate itself has no
      // cancellation awareness, so we just skip the setGate calls it made
      // if we've already unmounted. In practice this only matters for the
      // very first mount race; refetch() calls after mount don't need it.
      if (cancelled) return;
      await fetchGate();
    })();
    return () => { cancelled = true; };
  }, [fetchGate]);

  return { ...gate, refetch: fetchGate };
}

// Mounted at /books/* — picks the right page based on path.
export default function BooksShell() {
  const [path, navigate] = usePath();
  const gate = useSetupGate();

  // Settings page surfaces the submenu. We treat ANY /books/settings* as a
  // settings page so external links like /books/settings/accounts redirect
  // here and land on General rather than 404'ing.
  const isSettingsPage = path === '/books/settings'
    || path === '/books/settings/'
    || path.startsWith('/books/settings/');

  // First-run gate: while we're fetching, render a minimal loading state
  // so the screen isn't blank for a frame.
  if (gate.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <span className="text-sm text-slate-400">Loading…</span>
      </div>
    );
  }

  const isFirstRun = gate.status === 'first-run' || gate.status === 'error';

  let page;
  if (path === '/books' || path === '/books/' || path === '/books/dashboard') {
    // /books (default) and /books/dashboard both → Dashboard. Dashboard
    // itself branches on `isFirstRun` and renders the State A welcome card
    // (full-page, no sidebar chrome) or State C "Welcome back" content.
    page = (
      <Dashboard
        navigate={navigate}
        isFirstRun={isFirstRun}
        business={gate.business}
        gateError={gate.error}
      />
    );
  } else if (path === '/books/setup' || path === '/books/setup/') {
    page = (
      <SetupWizard
        navigate={navigate}
        business={gate.business}
        onSetupComplete={gate.refetch}
      />
    );
  } else if (path === '/books/categories/wizard' || path === '/books/categories/wizard/') {
    // B2b-2: the Categories Wizard (B3a) hasn't landed yet. Per the task
    // brief's navigation fallback chain, route this path to Categories.jsx
    // (the already-shipped B1a CRUD screen) as a stand-in so the Setup
    // Wizard's "Save & continue to Categories →" CTA always lands
    // somewhere real instead of hitting the generic "Coming soon" stub.
    // Once B3a ships, replace this branch's component with the real
    // Categories Wizard — the route itself doesn't need to change.
    page = <Categories navigate={navigate} />;
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
          The v2 shell surfaces four surfaces from the wireframes (Dashboard,
          Categories, Transactions, Settings). Anything else is either
          archived v1 work or a future-phase build.
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

  // First-run / error: render the page full-width with NO sidebar. The page
  // (Dashboard) renders the centered welcome card on its own — no extra
  // chrome needed. Other paths in the first-run state (e.g. user typed
  // /books/transactions directly) still need to render that page, but with
  // a small banner pointing back to setup. We handle that below.
  if (isFirstRun) {
    // For /books/setup we let the user through without the gate — they may
    // be following the "Set up your books →" CTA from the welcome card.
    // Same for the setup route on error: showing the setup page is better
    // than showing only the welcome card with no escape hatch.
    const isSetupRoute = path === '/books/setup' || path === '/books/setup/';
    if (isSetupRoute) {
      return (
        <div className="min-h-screen flex bg-slate-900 text-slate-100">
          <main className="flex-1 p-6 max-w-6xl">
            {page}
          </main>
        </div>
      );
    }
    // For the /books dashboard route, Dashboard handles the full-page
    // welcome layout on its own (no sidebar).
    const isDashboardRoute = path === '/books' || path === '/books/' || path === '/books/dashboard';
    if (isDashboardRoute) {
      return (
        <div className="min-h-screen flex bg-slate-900 text-slate-100">
          <main className="flex-1">
            {page}
          </main>
        </div>
      );
    }
    // For any other route during first-run, render the page in a sidebarless
    // shell with a small banner pointing back to setup.
    return (
      <div className="min-h-screen flex bg-slate-900 text-slate-100">
        <main className="flex-1 p-6 max-w-6xl">
          <div className="mb-4 px-4 py-3 bg-indigo-950/50 border border-indigo-900 rounded-lg flex items-center justify-between gap-3">
            <div className="text-sm text-indigo-200">
              <span className="font-medium">Books not set up yet.</span>{' '}
              <span className="text-indigo-300/80">Run the Setup Wizard to start tracking your business.</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/books/setup')}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium whitespace-nowrap"
            >
              Set up your books →
            </button>
          </div>
          {page}
        </main>
      </div>
    );
  }

  // State C (ready): sidebar + submenu as before.
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
