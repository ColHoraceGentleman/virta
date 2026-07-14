// Virta Books — Categories Wizard Step 1: Welcome explainer.
//
// Per TASK-b3a-categories-wizard-first-half.md §2 / SETUP_AND_CATEGORIES.md
// §7 Step 1. Renders the headline + body copy, the "Show 4-digit account
// numbers" display-preference toggle (default OFF, writes immediately to
// settings.show_account_numbers via PUT), and the Next → CTA.
import { useState } from 'react';
import { booksApi } from './api.js';

export default function CategoriesWizardStep1({ showAccountNumbers, setShowAccountNumbers, setStep }) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // handleToggle — VB-CATWIZ-STEP1-02: writes to settings.show_account_numbers
  // immediately via PUT /settings/show_account_numbers. Optimistically
  // flips local/parent state so Steps 2/3 cascade instantly; rolls back on
  // failure.
  const handleToggle = async () => {
    const next = !showAccountNumbers;
    setShowAccountNumbers(next);
    setSaving(true);
    setSaveError(null);
    try {
      await booksApi.updateSetting('show_account_numbers', next);
    } catch (err) {
      // Roll back on failure — the toggle should never silently drift from
      // the persisted setting.
      setShowAccountNumbers(!next);
      setSaveError('Could not save this preference. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="cat-wizard-step1">
      <h2 className="text-xl font-light text-slate-100 mt-0 mb-3">
        Set up your categories.
      </h2>
      <p className="text-slate-300 text-sm mb-5">
        Categories are the buckets your money gets sorted into. We've
        pre-seeded them based on Schedule C — the tax form sole proprietors
        file. You can rename, remove, or add any of them.
      </p>

      <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 mb-6">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span className="text-sm text-slate-100 font-medium">
            Show 4-digit account numbers
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={showAccountNumbers}
            data-testid="cat-wizard-account-numbers-toggle"
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showAccountNumbers ? 'bg-indigo-600' : 'bg-slate-700'
            } ${saving ? 'opacity-60' : ''}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showAccountNumbers ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
        <p className="text-xs text-slate-400 mt-2">
          Some accountants and business owners like to track their accounts
          with account numbers. We'll show codes like 6000 Advertising next
          to each category when this is on. You can change this anytime in
          Settings → Categories.
        </p>
        {saveError && (
          <p className="text-xs text-red-400 mt-2" data-testid="cat-wizard-account-numbers-error">
            {saveError}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setStep(2)}
          data-testid="cat-wizard-step1-next"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
