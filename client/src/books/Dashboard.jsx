// Virta Books — v2 Dashboard (B2a-wizard-A: 3-state content).
//
// Wireframe source of truth: WIREFRAMES.html renderDashboard() (line 1376).
// This build replaces the v2-shell stub with the first-run / welcome-back
// content described in the B2a-setup-wizard-foundation task.
//
// Three render states, driven by `isFirstRun` (computed in BooksShell from
// GET /businesses/current):
//
//   State A — first-run (no business row, OR API error):
//     Full-page centered welcome card. NO sidebar chrome (the sidebar is
//     hidden by BooksShell in this state). This is the user's first
//     impression of Virta Books — keep it focused: one headline, one body
//     sentence, one CTA. No status indicators, no quick links.
//
//   State C — welcome back (business row exists):
//     Standard "Welcome back" content with a small status bar. Status bar
//     currently derives from GET /businesses/current only:
//       - Setup: ✓ Done if a business row exists (B2a has no
//         setupCompletedAt column yet — B2b will refine this)
//       - Categories: ⚠ Not started (lights up in B3)
//
//   State B — setup in progress (business exists with
//     setupCompletedAt === null):
//     Reserved for B2b once the setupCompletedAt column ships. In B2a we
//     cannot detect it; "business exists" maps to State C.
//
// Why this lives in Dashboard.jsx (and not BooksShell): the welcome card
// itself is content, not chrome. BooksShell owns the sidebar visibility
// decision; Dashboard owns the card.
export default function Dashboard({ navigate, isFirstRun, business, gateError }) {
  // State A — first-run welcome.
  if (isFirstRun) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-slate-900">
        <div className="w-full max-w-xl">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-10 shadow-xl text-center">
            <h1 className="text-3xl font-light text-slate-100 mb-4 tracking-wide">
              Welcome to Virta Books.
            </h1>
            <p className="text-slate-300 text-base mb-8 leading-relaxed">
              Let&apos;s set up your books so you can start tracking your business.
            </p>
            <button
              type="button"
              onClick={() => navigate('/books/setup')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Set up your books →
            </button>
            {gateError && (
              <p className="mt-6 text-xs text-slate-500">
                Couldn&apos;t reach the server ({gateError}). The setup wizard
                will still work once the server is back.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // State C — welcome back.
  const name = (business && (business.business_name || business.proprietor_name)) || 'there';
  // Setup status: in B2a we treat "business row exists" as a proxy for
  // "setup done". B2b will replace this with the real setupCompletedAt
  // check. We surface it here so the status bar is honest about its source.
  const setupDone = Boolean(business && business.id);

  return (
    <div>
      {/* Phase pill — kept from the stub for continuity; signals that the
          surface below the status bar is still placeholder content. */}
      <div className="mb-4">
        <span className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-xs">
          Available in Phase 11
        </span>
      </div>

      {/* Status bar — derives from /businesses/current only in B2a.
          Categories lights up after B3 lands. */}
      <div className="mb-4 px-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-lg flex items-center gap-2 text-sm">
        <span className="text-slate-400">Setup</span>
        <span className={setupDone ? 'text-emerald-400' : 'text-amber-400'}>
          {setupDone ? '✓ Done' : '⚠ Not started'}
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-400">Categories</span>
        <span className="text-amber-400">⚠ Not started</span>
      </div>

      {/* Welcome-back card. */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow">
        <h2 className="text-xl font-light text-slate-100 mt-0 mb-2">
          Welcome back, {name}.
        </h2>
        <p className="text-slate-300 text-sm mb-5">
          Your books are ready. What&apos;s next?
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/books/categories')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          >
            Go to Categories
          </button>
          <button
            type="button"
            onClick={() => navigate('/books/transactions')}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
          >
            Go to Transactions
          </button>
          <button
            type="button"
            onClick={() => navigate('/books/settings')}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
          >
            Settings
          </button>
        </div>

        <div className="mt-6 px-3 py-2 bg-slate-900/60 border border-slate-700 rounded text-slate-300 text-xs">
          Recent transactions, categories to review, and action-needed lists
          land in Phase 11. Until then, use the quick links above to navigate
          your books.
        </div>
      </div>
    </div>
  );
}
