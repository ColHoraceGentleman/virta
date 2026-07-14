// Virta Books — Setup Wizard Step 2 (Basic business info).
//
// Per SETUP_AND_CATEGORIES.md §6 Step 2 (D15 merged) + TASK-b2a-wizard-b.md §3.
// Two subheaders: "About you" / "About your business". Step 1-of-1 for the
// proprietor identity in B2a-wizard-B; Steps 3-5 (Address / Accounting /
// Timeline) land in B2b.
//
// Fields:
//   About you:
//     - Your name (text, required to advance)
//     - What does your business do? (textarea, max 280 chars, counter when > 200)
//   About your business:
//     - Business name (text, optional)
//     - Trade name (text, optional, helper text)
//     - Industry code (NAICS) — picker. Clicking opens SetupWizardNaicsModal.
//     - EIN (text, optional, soft format validation)
//
// CTAs (per spec):
//   - "Back" → step 1
//   - "Skip" / "Revert to Defaults" → clears step 2 fields → step 3
//   - "Save & continue →" → validates name (required), persists, advances to step 3
//
// "Revert to Defaults" label behavior:
//   - The label starts as "Skip".
//   - As soon as any step-2 field is touched (dirty), it flips to "Revert to Defaults".
//   - Clicking reverts step 2 fields to defaults, sets dirty back to false,
//     and the label reverts to "Skip" on the next render.
import React, { useState } from 'react';
import SetupWizardNaicsModal from './SetupWizardNaicsModal.jsx';
import { validateEinFormat } from './SetupWizard.jsx';

const MAX_DESCRIPTION = 280;
const COUNTER_THRESHOLD = 200;

// Step 2 fields that get cleared by "Revert to Defaults". Mirrors the
// B2a-wizard-B field set in DEFAULT_STATE.setup. B2b fields (address_*
// / accounting_method / fiscal_year_start_month / business_started_on)
// are preserved untouched by the revert.
const STEP2_FIELDS = [
  'proprietor_name',
  'business_name',
  'trade_name',
  'business_description',
  'naics_code',
  'naics_title',
  'ein',
];

function isStep2Dirty(setup) {
  return STEP2_FIELDS.some((f) => setup[f] && String(setup[f]).length > 0);
}

export default function SetupWizardBusinessInfo({
  setup,
  updateSetup,
  setStep,
  revertSetupToDefaults,
}) {
  // Inline validation surface. We don't surface errors until the user
  // attempts Save; once we do, we keep them visible until the next save
  // attempt (so a user fixing the name sees the error clear on next save).
  const [nameError, setNameError] = useState('');
  const [showNaicsModal, setShowNaicsModal] = useState(false);
  const [showSaveError, setShowSaveError] = useState(false);

  const dirty = isStep2Dirty(setup);
  const skipLabel = dirty ? 'Revert to Defaults' : 'Skip';

  // EIN format hint — soft warning only, never a block.
  const einCheck = validateEinFormat(setup.ein);
  const showEinWarning = setup.ein && !einCheck.valid;

  const descriptionLen = (setup.business_description || '').length;
  const showDescriptionCounter = descriptionLen > COUNTER_THRESHOLD;

  const handleSave = () => {
    if (!setup.proprietor_name || !setup.proprietor_name.trim()) {
      setNameError('Your name is required.');
      setShowSaveError(true);
      return;
    }
    setNameError('');
    setShowSaveError(false);
    setStep(3);
  };

  const handleSkipOrRevert = () => {
    if (dirty) {
      // Revert: clear step 2 fields, set dirty back to false.
      revertSetupToDefaults();
    }
    // Whether dirty or not, Skip advances to step 3.
    setStep(3);
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* About you */}
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">
            About you
          </div>

          <div className="mb-4">
            <label htmlFor="wiz-prop-name" className="block text-xs text-slate-300 mb-1">
              Your name <span className="text-rose-400">*</span>
            </label>
            <input
              id="wiz-prop-name"
              type="text"
              value={setup.proprietor_name || ''}
              onChange={(e) => {
                updateSetup({ proprietor_name: e.target.value });
                if (showSaveError) setNameError('');
              }}
              placeholder="Your name"
              data-testid="wizard-step2-name"
              className={`w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border ${
                nameError
                  ? 'border-rose-500 focus:border-rose-400'
                  : 'border-slate-700 focus:border-indigo-500'
              } focus:outline-none`}
            />
            {nameError && (
              <div className="text-xs text-rose-400 mt-1" data-testid="wizard-step2-name-error">
                {nameError}
              </div>
            )}
            <div className="text-xs text-slate-500 mt-1">
              The legal name on your tax return. Used in the invoice header.
            </div>
          </div>

          <div className="mb-2">
            <label htmlFor="wiz-desc" className="block text-xs text-slate-300 mb-1">
              What does your business do?
            </label>
            <textarea
              id="wiz-desc"
              rows={4}
              maxLength={MAX_DESCRIPTION}
              value={setup.business_description || ''}
              onChange={(e) => updateSetup({ business_description: e.target.value })}
              placeholder="One or two sentences about what you sell or do."
              data-testid="wizard-step2-description"
              className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none resize-y"
            />
            <div className="flex justify-between items-center text-xs text-slate-500 mt-1">
              <span>Helps at tax time. Optional.</span>
              {showDescriptionCounter && (
                <span
                  data-testid="wizard-step2-description-counter"
                  className={descriptionLen >= MAX_DESCRIPTION - 10 ? 'text-amber-400' : 'text-slate-400'}
                >
                  {descriptionLen}/{MAX_DESCRIPTION}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* About your business */}
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">
            About your business
          </div>

          <div className="mb-4">
            <label htmlFor="wiz-biz-name" className="block text-xs text-slate-300 mb-1">
              Business name
            </label>
            <input
              id="wiz-biz-name"
              type="text"
              value={setup.business_name || ''}
              onChange={(e) => updateSetup({ business_name: e.target.value })}
              placeholder="My Business Name"
              data-testid="wizard-step2-business-name"
              className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
            />
            <div className="text-xs text-slate-500 mt-1">
              The name on your Schedule C.
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="wiz-trade" className="block text-xs text-slate-300 mb-1">
              Trade name <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="wiz-trade"
              type="text"
              value={setup.trade_name || ''}
              onChange={(e) => updateSetup({ trade_name: e.target.value })}
              placeholder="Distinct from your business name, if you use one."
              data-testid="wizard-step2-trade-name"
              className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
            />
            <div className="text-xs text-slate-500 mt-1">
              Distinct from your business name, if you use one.
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="wiz-naics" className="block text-xs text-slate-300 mb-1">
              Industry code (NAICS) <span className="text-slate-500">(optional)</span>
            </label>
            <div className="flex gap-2 items-stretch">
              <input
                id="wiz-naics"
                type="text"
                value={
                  setup.naics_code
                    ? setup.naics_title
                      ? `${setup.naics_code} — ${setup.naics_title}`
                      : setup.naics_code
                    : ''
                }
                placeholder="Click ‘Look up’ to search by keyword"
                readOnly
                data-testid="wizard-step2-naics"
                className="flex-1 bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:outline-none cursor-pointer hover:border-slate-600"
                onClick={() => setShowNaicsModal(true)}
              />
              <button
                type="button"
                onClick={() => setShowNaicsModal(true)}
                data-testid="wizard-step2-naics-open"
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium whitespace-nowrap"
              >
                Look up NAICS →
              </button>
              {setup.naics_code && (
                <button
                  type="button"
                  onClick={() => updateSetup({ naics_code: '', naics_title: '' })}
                  data-testid="wizard-step2-naics-clear"
                  className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 rounded-lg text-sm"
                  title="Clear NAICS code"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Optional — don&apos;t know it? Skip and add later.
            </div>
          </div>

          <div className="mb-2">
            <label htmlFor="wiz-ein" className="block text-xs text-slate-300 mb-1">
              EIN <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="wiz-ein"
              type="text"
              value={setup.ein || ''}
              onChange={(e) => updateSetup({ ein: e.target.value })}
              placeholder="00-0000000"
              data-testid="wizard-step2-ein"
              className={`w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border ${
                showEinWarning
                  ? 'border-amber-500/70 focus:border-amber-400'
                  : 'border-slate-700 focus:border-indigo-500'
              } focus:outline-none`}
            />
            {showEinWarning ? (
              <div className="text-xs text-amber-400 mt-1" data-testid="wizard-step2-ein-warning">
                Expected format: 00-0000000 (9 digits, optional hyphen).
              </div>
            ) : (
              <div className="text-xs text-slate-500 mt-1">
                Many sole proprietors don&apos;t have one. Skipping leaves it blank.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CTAs — Back / Skip-or-Revert / Save & continue. */}
      <div className="mt-6 pt-4 border-t border-slate-700 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep(1)}
          data-testid="wizard-step2-back"
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSkipOrRevert}
            data-testid="wizard-step2-skip"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm"
          >
            {skipLabel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            data-testid="wizard-step2-save"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          >
            Save &amp; continue →
          </button>
        </div>
      </div>

      {/* NAICS modal — only mounted when open. */}
      {showNaicsModal && (
        <SetupWizardNaicsModal
          currentCode={setup.naics_code}
          onSelect={(code, title) => {
            updateSetup({ naics_code: code, naics_title: title });
            setShowNaicsModal(false);
          }}
          onClear={() => {
            // Wren B2a-wizard-B NIT F4 (landed B2b-2): Clear only clears the
            // field — the modal stays open so the user can re-pick a code
            // without an extra click to reopen it.
            updateSetup({ naics_code: '', naics_title: '' });
          }}
          onClose={() => setShowNaicsModal(false)}
        />
      )}
    </div>
  );
}
