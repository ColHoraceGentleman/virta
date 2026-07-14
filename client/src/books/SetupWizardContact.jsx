// Virta Books — Setup Wizard Step 3 (Contact / address).
//
// Per SETUP_AND_CATEGORIES.md §6 Step 3 + TASK-b2b-1-steps-3-5.md §1.
// Fields:
//   - Street address (text)
//   - Street address 2 (text, optional)
//   - City (text)
//   - State (dropdown, 50 US states + DC — see us-states.js)
//   - ZIP (text, 5-digit or 5+4 format, soft-validated)
//
// All fields are optional. The whole step is skippable per the spec.
// Skip behavior: when dirty, "Revert to Defaults" clears all 5 fields.
// Save & continue: persists to localStorage (handled by the parent's
// debounced effect) and advances to step 4.
//
// Reverting this step should only touch the 5 contact fields. Earlier
// steps' fields (proprietor_name, business_name, etc.) and later
// steps' fields (accounting_method, fiscal_year_start_month, etc.) are
// preserved untouched — the parent wizard owns the preserve/restore
// logic via revertSetupToDefaults.
import React, { useState } from 'react';
import US_STATES from './us-states.js';

// Step 3 fields cleared by "Revert to Defaults". Mirrors the
// B2a-wizard-B field set in DEFAULT_STATE.setup.
const STEP3_FIELDS = [
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal',
];

function isStep3Dirty(setup) {
  return STEP3_FIELDS.some((f) => setup[f] && String(setup[f]).length > 0);
}

// ZIP soft-format check. 5 digits (12345) or 5+4 (12345-6789). Per
// the spec, this is a *warning* only, never a block — keeps the
// "schedule C" mental model where typos are caught gently.
function validatePostalFormat(postal) {
  if (!postal) return { valid: true, value: '' };
  const trimmed = String(postal).trim();
  if (/^\d{5}$/.test(trimmed)) return { valid: true, value: trimmed };
  if (/^\d{5}-\d{4}$/.test(trimmed)) return { valid: true, value: trimmed };
  return { valid: false, value: trimmed };
}

export default function SetupWizardContact({ setup, updateSetup, setStep }) {
  const [showSaveError, setShowSaveError] = useState(false);

  const dirty = isStep3Dirty(setup);
  const skipLabel = dirty ? 'Revert to Defaults' : 'Skip';

  const postalCheck = validatePostalFormat(setup.postal);
  const showPostalWarning = setup.postal && !postalCheck.valid;

  const handleSave = () => {
    setShowSaveError(false);
    setStep(4);
  };

  const handleSkipOrRevert = () => {
    if (dirty) {
      // Clear only the Step 3 fields. Earlier steps (1-2) and later steps
      // (4-5) are left untouched. We do this via updateSetup rather than
      // the parent's revertSetupToDefaults (which is Step-2-specific).
      updateSetup({
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        postal: '',
      });
    }
    // Whether dirty or not, Skip advances to step 4.
    setStep(4);
  };

  return (
    <div>
      <h2 className="text-xl font-light text-slate-100 mt-0 mb-1">
        Where are you based?
      </h2>
      <p className="text-slate-300 text-sm mb-5">
        Your business address. We&apos;ll use this on invoices and tax forms.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Street address (line 1) */}
        <div className="md:col-span-2">
          <label htmlFor="wiz-addr1" className="block text-xs text-slate-300 mb-1">
            Street address
          </label>
          <input
            id="wiz-addr1"
            type="text"
            value={setup.address_line1 || ''}
            onChange={(e) => updateSetup({ address_line1: e.target.value })}
            placeholder="123 Main St"
            data-testid="wizard-step3-address-line1"
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Street address 2 */}
        <div className="md:col-span-2">
          <label htmlFor="wiz-addr2" className="block text-xs text-slate-300 mb-1">
            Street address 2 <span className="text-slate-500">(optional)</span>
          </label>
          <input
            id="wiz-addr2"
            type="text"
            value={setup.address_line2 || ''}
            onChange={(e) => updateSetup({ address_line2: e.target.value })}
            placeholder="Suite 100"
            data-testid="wizard-step3-address-line2"
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* City */}
        <div>
          <label htmlFor="wiz-city" className="block text-xs text-slate-300 mb-1">
            City
          </label>
          <input
            id="wiz-city"
            type="text"
            value={setup.city || ''}
            onChange={(e) => updateSetup({ city: e.target.value })}
            placeholder="Anytown"
            data-testid="wizard-step3-city"
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* State */}
        <div>
          <label htmlFor="wiz-state" className="block text-xs text-slate-300 mb-1">
            State
          </label>
          <select
            id="wiz-state"
            value={setup.state || ''}
            onChange={(e) => updateSetup({ state: e.target.value })}
            data-testid="wizard-step3-state"
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">— Select state —</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* ZIP */}
        <div className="md:col-span-1">
          <label htmlFor="wiz-zip" className="block text-xs text-slate-300 mb-1">
            ZIP
          </label>
          <input
            id="wiz-zip"
            type="text"
            inputMode="numeric"
            value={setup.postal || ''}
            onChange={(e) => updateSetup({ postal: e.target.value })}
            placeholder="12345 or 12345-6789"
            data-testid="wizard-step3-postal"
            className={`w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border ${
              showPostalWarning
                ? 'border-amber-500/70 focus:border-amber-400'
                : 'border-slate-700 focus:border-indigo-500'
            } focus:outline-none`}
          />
          {showPostalWarning ? (
            <div className="text-xs text-amber-400 mt-1" data-testid="wizard-step3-postal-warning">
              Expected format: 12345 or 12345-6789.
            </div>
          ) : (
            <div className="text-xs text-slate-500 mt-1">
              5 digits, or ZIP+4 with a hyphen.
            </div>
          )}
        </div>
      </div>

      {/* CTAs — Back / Skip-or-Revert / Save & continue. */}
      <div className="mt-6 pt-4 border-t border-slate-700 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep(2)}
          data-testid="wizard-step3-back"
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSkipOrRevert}
            data-testid="wizard-step3-skip"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm"
          >
            {skipLabel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            data-testid="wizard-step3-save"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          >
            Save &amp; continue →
          </button>
        </div>
      </div>
    </div>
  );
}
