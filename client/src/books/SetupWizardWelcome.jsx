// Virta Books — Setup Wizard Step 1 (Welcome).
//
// Per SETUP_AND_CATEGORIES.md §6 Step 1 + TASK-b2a-wizard-b.md §2:
//   - Headline: "Let's set up your books."
//   - Sub-headline: Schedule C explainer in a tinted infobox.
//   - Reassurance line: "Most people finish in under 5 minutes..."
//   - Single CTA: "Get started →" → setStep(2).
//   - No preview bullets, no "Up next" hint. Keep the screen focused.
import React from 'react';

export default function SetupWizardWelcome({ setStep }) {
  return (
    <div>
      <h2 className="text-2xl font-light text-slate-100 mt-0 mb-4">
        Let&apos;s set up your books.
      </h2>
      <div className="px-4 py-3 bg-slate-900/60 border border-slate-700 rounded text-slate-300 text-sm mb-4">
        We&apos;ll ask for the same basic info that&apos;s on the Schedule C of
        your IRS Form 1040 — the tax form sole proprietors file. This makes
        year-end tax filing much easier.
      </div>
      <p className="text-slate-300 text-sm mb-6">
        Most people finish in under 5 minutes. You can change anything later.
      </p>
      <button
        type="button"
        onClick={() => setStep(2)}
        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
        data-testid="wizard-step1-cta"
      >
        Get started →
      </button>
    </div>
  );
}
