// Virta Books — v2 Setup Wizard (stub).
//
// Wireframe source of truth: WIREFRAMES.html renderSetup() (line 313) — a
// 6-step wizard (Welcome / Basic business info / Address / Accounting
// method / Fiscal year + start date / Review). Design is locked through
// rounds 1-14; the build is part of Phase 1 once Patrick pulls the trigger.
//
// This stub shows the wireframe's step-1 "Get started" intro so the page
// isn't blank. Per TASK-v2-shell-rebuild.md it adds a "Coming in Phase 1"
// pill — the only deviation from the wireframe — so it's clearly a placeholder.
// Step 1 is fully rendered (welcome + infobox + CTA); subsequent steps are
// a typed preview card, not interactive.
export default function SetupWizard({ navigate }) {
  return (
    <div>
      {/* Phase pill — the only deviation from the wireframe, per spec. */}
      <div className="mb-4">
        <span className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-xs">
          Coming in Phase 1
        </span>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow">
        {/* Step 1 — wireframe-accurate. Step list (renderSetup's SETUP_STEPS)
            is a 6-step flow: Welcome, Basic business info, Address, Accounting
            method, Fiscal year + start date, Review. The pill above is the
            only deviation; everything below mirrors the wireframe. */}
        <div className="mb-5">
          <h2 className="text-xl font-light text-slate-100 mt-0 mb-3">
            Let&apos;s set up your books.
          </h2>
          <div className="px-3 py-2 bg-slate-900/60 border border-slate-700 rounded text-slate-300 text-sm mb-3">
            We&apos;ll ask for the same basic info that&apos;s on the Schedule C
            of your IRS Form 1040 — the tax form sole proprietors file. This
            makes year-end tax filing much easier.
          </div>
          <p className="text-slate-300 text-sm mb-4">
            Most people finish in under 5 minutes. You can change anything later.
          </p>
        </div>

        {/* Disabled "Get started" CTA — the build will wire this through to
            step 2. Kept on-screen to match the wireframe's step-1 layout. */}
        <button
          type="button"
          disabled
          title="Full wizard builds in Phase 1"
          className="px-4 py-2 bg-indigo-600/40 text-white/70 rounded-lg text-sm cursor-not-allowed"
        >
          Get started →
        </button>

        {/* Step previews — listing every step the wireframe defines, but with
            placeholder bodies so the user can see the wizard shape without
            each step being a real interactive form. */}
        <div className="mt-6 border-t border-slate-700 pt-4">
          <h3 className="text-sm uppercase tracking-wider text-slate-400 mb-3">
            Wizard steps (preview)
          </h3>
          <ol className="text-sm text-slate-300 space-y-1.5 list-decimal list-inside">
            <li>Welcome — you are here.</li>
            <li>Basic business info — proprietor / business name / NAICS / EIN.</li>
            <li>Address — street / city / state / ZIP.</li>
            <li>Accounting method — Cash (default) / Accrual (coming later).</li>
            <li>Fiscal year + business start date.</li>
            <li>Review &amp; edit each field before finishing.</li>
          </ol>
        </div>
      </div>

      <div className="mt-4 text-right">
        <button
          type="button"
          onClick={() => navigate('/books')}
          className="text-xs text-slate-400 hover:text-slate-100 underline"
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
}
