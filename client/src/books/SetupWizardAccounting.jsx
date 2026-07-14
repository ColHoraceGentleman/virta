// Virta Books — Setup Wizard Step 4 (Accounting method).
//
// Per SETUP_AND_CATEGORIES.md §6 Step 4 + TASK-b2b-1-steps-3-5.md §2.
// v1 is cash-only per D1. Accrual is shown in the UI for transparency
// (so the user sees it's an option) but is greyed out with a tooltip
// reading "Available in a future version". Default = Cash.
//
// Helper text below the radios explains the choice in plain English
// (most sole proprietors use cash) and notes that the user can change
// it later in Settings.
//
// Skip behavior: when dirty (i.e. the user explicitly selected Accrual
// — which is impossible in v1 because the radio is disabled, but the
// helper still defines the isDirty check for future-proofing), the
// label flips to "Revert to Defaults" and the click sets it back to
// 'cash'. In v1, the dirty path is dead because the only selectable
// radio is 'cash', which equals the default. The check is kept so
// the B2b-2 / future code doesn't have to be re-thought.
import React from 'react';

// Step 4 dirty check: any non-default value.
// v1 only ever selects 'cash' (Accrual is disabled), so this returns
// false in practice. The check stays in place so when Accrual is
// eventually enabled, no logic change is required.
const STEP4_DEFAULT = 'cash';
function isStep4Dirty(setup) {
  const m = setup.accounting_method;
  return m && m !== STEP4_DEFAULT;
}

export default function SetupWizardAccounting({ setup, updateSetup, setStep }) {
  const dirty = isStep4Dirty(setup);
  const skipLabel = dirty ? 'Revert to Defaults' : 'Skip';
  const current = setup.accounting_method || STEP4_DEFAULT;

  const handleSave = () => {
    setStep(5);
  };

  const handleSkipOrRevert = () => {
    if (dirty) {
      // Clear only the Step 4 field back to 'cash'. We do this via
      // updateSetup rather than the parent's revertSetupToDefaults
      // (which is Step-2-specific and would clear Step 2's fields too).
      updateSetup({ accounting_method: STEP4_DEFAULT });
    }
    setStep(5);
  };

  return (
    <div>
      <h2 className="text-xl font-light text-slate-100 mt-0 mb-1">
        How do you record money?
      </h2>
      <p className="text-slate-300 text-sm mb-5">
        Pick the method that matches how you track your business.
      </p>

      <div className="space-y-3" data-testid="wizard-step4-radios">
        {/* Cash — selected by default, always selectable. */}
        <label
          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            current === 'cash'
              ? 'bg-slate-900/60 border-indigo-500/60'
              : 'bg-slate-900/40 border-slate-700 hover:border-slate-600'
          }`}
          data-testid="wizard-step4-radio-cash"
        >
          <input
            type="radio"
            name="wizard-accounting-method"
            value="cash"
            checked={current === 'cash'}
            onChange={() => updateSetup({ accounting_method: 'cash' })}
            className="mt-0.5 accent-indigo-500"
            data-testid="wizard-step4-input-cash"
          />
          <div>
            <div className="text-slate-100 text-sm font-medium">Cash</div>
            <div className="text-slate-400 text-xs mt-0.5">
              Record money when it actually moves.
            </div>
          </div>
        </label>

        {/* Accrual — visible but disabled with a tooltip. */}
        <label
          className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/20 opacity-60 cursor-not-allowed"
          data-testid="wizard-step4-radio-accrual-wrapper"
          title="Available in a future version"
        >
          <input
            type="radio"
            name="wizard-accounting-method"
            value="accrual"
            checked={current === 'accrual'}
            disabled
            onChange={() => { /* disabled — no-op */ }}
            className="mt-0.5 accent-indigo-500 cursor-not-allowed"
            data-testid="wizard-step4-input-accrual"
            aria-describedby="wizard-step4-accrual-tooltip"
          />
          <div>
            <div className="text-slate-300 text-sm font-medium flex items-center gap-2">
              Accrual
              <span
                id="wizard-step4-accrual-tooltip"
                className="inline-block px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[10px] uppercase tracking-wider"
                title="Available in a future version"
                data-testid="wizard-step4-accrual-tooltip"
              >
                Coming later
              </span>
            </div>
            <div className="text-slate-500 text-xs mt-0.5">
              Record money when it&apos;s earned or billed, not when it&apos;s received.
            </div>
          </div>
        </label>
      </div>

      <div className="mt-4 px-4 py-3 bg-slate-900/60 border border-slate-700 rounded text-slate-300 text-sm">
        Most sole proprietorships use cash accounting — recording money when
        it actually moves. You can change this later in{' '}
        <span className="text-slate-200">Settings → Other</span>, but it
        affects how every transaction is recorded.
      </div>

      {/* CTAs — Back / Skip-or-Revert / Save & continue. */}
      <div className="mt-6 pt-4 border-t border-slate-700 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep(3)}
          data-testid="wizard-step4-back"
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSkipOrRevert}
            data-testid="wizard-step4-skip"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm"
          >
            {skipLabel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            data-testid="wizard-step4-save"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          >
            Save &amp; continue →
          </button>
        </div>
      </div>
    </div>
  );
}
