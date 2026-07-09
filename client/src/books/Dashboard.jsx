// Virta Books — v2 Dashboard (stub).
//
// Wireframe source of truth: WIREFRAMES.html renderDashboard() (line 1376).
// This stub mirrors the wireframe layout (welcome + 3 quick links + infobox)
// using the current app's dark chrome. Per TASK-v2-shell-rebuild.md it adds
// an "Available in Phase 11" pill — the only deviation from the wireframe —
// so it's clearly a placeholder until Phase 11 lands.
//
// The wireframe's Dashboard is intentionally minimal: three links into the
// other v2 surfaces (Setup, Categories, Settings) and an infobox explaining
// the Review Later sidebar badge. No KPI tiles, no charts — the wireframe
// reserves that real estate for Phase 11.
export default function Dashboard({ navigate }) {
  return (
    <div>
      {/* Phase pill — the only deviation from the wireframe, per spec. */}
      <div className="mb-4">
        <span className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-xs">
          Available in Phase 11
        </span>
      </div>

      {/* Card matching renderDashboard's topbar+box layout. */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow">
        <h2 className="text-xl font-light text-slate-100 mt-0 mb-3">Welcome to Virta Books</h2>
        <p className="text-slate-300 mb-3">You're set up. Quick links:</p>
        <ul className="text-slate-300 mb-4 space-y-1.5 list-disc list-inside">
          <li>
            <button
              type="button"
              onClick={() => navigate('/books/setup')}
              className="text-indigo-300 hover:text-indigo-200 underline"
            >
              Run setup wizard →
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => navigate('/books/categories')}
              className="text-indigo-300 hover:text-indigo-200 underline"
            >
              Categories — Expenses
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => navigate('/books/settings')}
              className="text-indigo-300 hover:text-indigo-200 underline"
            >
              Settings
            </button>
          </li>
        </ul>
        <div className="px-3 py-2 bg-slate-900/60 border border-slate-700 rounded text-slate-300 text-xs">
          Review Later badge in the sidebar shows outstanding auto-categorization
          items. Move them to the right category from the Categorize UI.
        </div>
      </div>
    </div>
  );
}
