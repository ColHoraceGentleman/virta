// Virta Books — Setup Wizard Steps 3-6 placeholder.
//
// B2a-wizard-B does not implement Steps 3-6 (those land in B2b). The
// placeholder card is enough to make the wizard a 6-step machine today
// (so the progress dots, step counter, and Back/Continue CTAs are all
// demonstrably real), while signaling to the user that more is coming.
//
// Per TASK-b2a-wizard-b.md §1 + §3: "Steps 3-6 are placeholders. Step 3
// says 'Coming in B2b' with a Back button. Steps 4-6 similarly."
import React from 'react';

const STEP_BLURBS = {
  3: 'Street address, city, state, ZIP — your business location.',
  4: 'Pick how you record money: Cash (default) or Accrual (coming later).',
  5: 'Fiscal year start month and the date your business started.',
  6: 'A review of everything you entered, with edit-on-row-click.',
};

export default function SetupWizardStepPlaceholder({ stepNumber, stepName, setStep }) {
  const blurb = STEP_BLURBS[stepNumber] || 'This step is part of the Setup Wizard.';
  return (
    <div>
      <div className="mb-4">
        <span className="inline-block px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400 text-xs">
          Coming in B2b
        </span>
      </div>
      <h2 className="text-xl font-light text-slate-100 mt-0 mb-2">
        {stepName}
      </h2>
      <p className="text-slate-300 text-sm mb-4">{blurb}</p>
      <div className="px-4 py-3 bg-slate-900/60 border border-slate-700 rounded text-slate-400 text-sm mb-6">
        This step lands in <span className="text-slate-200">B2b — Setup Wizard completion</span>.
        For now, the step machine still tracks your progress so you can see
        the 6-step flow end-to-end.
      </div>
      <div className="mt-6 pt-4 border-t border-slate-700 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep(stepNumber - 1)}
          data-testid={`wizard-step${stepNumber}-back`}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          {stepNumber < 6 && (
            <button
              type="button"
              onClick={() => setStep(stepNumber + 1)}
              data-testid={`wizard-step${stepNumber}-continue`}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm"
            >
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={() => setStep(stepNumber + 1)}
            disabled={stepNumber === 6}
            data-testid={`wizard-step${stepNumber}-save`}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {stepNumber === 6 ? 'Finish setup (in B2b)' : 'Save & continue →'}
          </button>
        </div>
      </div>
    </div>
  );
}
