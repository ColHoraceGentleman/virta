// Virta Books — Setup Wizard Step 5 (Timeline).
//
// Per SETUP_AND_CATEGORIES.md §6 Step 5 + TASK-b2b-1-steps-3-5.md §3.
// Two fields:
//   - Fiscal year starts (dropdown, 1-12, default 1 = January)
//   - When did your business start? (date input, optional)
//
// Helper text under the FY dropdown explains the calendar-year default
// and notes that the user can change it if they track finances on a
// different cycle (e.g. July 1 for some nonprofits).
//
// Skip behavior: when dirty (FY changed from January OR a business
// start date entered), the label flips to "Revert to Defaults" and
// the click resets both fields. Save & continue advances to Step 6
// (the Review step — still a placeholder in B2b-1, real one in B2b-2).
import React from 'react';

const MONTHS = [
  { value: 1,  name: 'January'   },
  { value: 2,  name: 'February'  },
  { value: 3,  name: 'March'     },
  { value: 4,  name: 'April'     },
  { value: 5,  name: 'May'       },
  { value: 6,  name: 'June'      },
  { value: 7,  name: 'July'      },
  { value: 8,  name: 'August'    },
  { value: 9,  name: 'September' },
  { value: 10, name: 'October'   },
  { value: 11, name: 'November'  },
  { value: 12, name: 'December'  },
];

const STEP5_FY_DEFAULT = 1; // January

// Step 5 dirty check: any deviation from the calendar-year default.
//   - fiscal_year_start_month differs from 1
//   - business_started_on is non-empty
function isStep5Dirty(setup) {
  const fy = Number(setup.fiscal_year_start_month);
  if (fy && fy !== STEP5_FY_DEFAULT) return true;
  if (setup.business_started_on && String(setup.business_started_on).length > 0) return true;
  return false;
}

export default function SetupWizardTimeline({ setup, updateSetup, setStep }) {
  const dirty = isStep5Dirty(setup);
  const skipLabel = dirty ? 'Revert to Defaults' : 'Skip';
  const fyValue = Number(setup.fiscal_year_start_month) || STEP5_FY_DEFAULT;

  const handleSave = () => {
    setStep(6);
  };

  const handleSkipOrRevert = () => {
    if (dirty) {
      // Clear only the Step 5 fields. We do this via updateSetup
      // rather than the parent's revertSetupToDefaults (which is
      // Step-2-specific and would clear Step 2's fields too).
      updateSetup({
        fiscal_year_start_month: STEP5_FY_DEFAULT,
        business_started_on: '',
      });
    }
    setStep(6);
  };

  return (
    <div>
      <h2 className="text-xl font-light text-slate-100 mt-0 mb-1">
        When does your fiscal year start?
      </h2>
      <p className="text-slate-300 text-sm mb-5">
        A few date-related details so reports line up with your books.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fiscal year start month */}
        <div>
          <label htmlFor="wiz-fy" className="block text-xs text-slate-300 mb-1">
            Fiscal year starts
          </label>
          <select
            id="wiz-fy"
            value={fyValue}
            onChange={(e) => updateSetup({ fiscal_year_start_month: Number(e.target.value) })}
            data-testid="wizard-step5-fy-month"
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.name}
              </option>
            ))}
          </select>
          <div className="text-xs text-slate-500 mt-1">
            Most small businesses use the calendar year (Jan 1 – Dec 31).
            If you track your finances on a different cycle, change it here.
          </div>
        </div>

        {/* Business start date */}
        <div>
          <label htmlFor="wiz-started" className="block text-xs text-slate-300 mb-1">
            When did your business start? <span className="text-slate-500">(optional)</span>
          </label>
          <input
            id="wiz-started"
            type="date"
            value={setup.business_started_on || ''}
            onChange={(e) => updateSetup({ business_started_on: e.target.value })}
            data-testid="wizard-step5-business-started"
            className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
          />
          <div className="text-xs text-slate-500 mt-1">
            Schedule C field J. Leave blank if you haven&apos;t started yet.
          </div>
        </div>
      </div>

      {/* CTAs — Back / Skip-or-Revert / Save & continue. */}
      <div className="mt-6 pt-4 border-t border-slate-700 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep(4)}
          data-testid="wizard-step5-back"
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSkipOrRevert}
            data-testid="wizard-step5-skip"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm"
          >
            {skipLabel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            data-testid="wizard-step5-save"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          >
            Save &amp; continue →
          </button>
        </div>
      </div>
    </div>
  );
}
