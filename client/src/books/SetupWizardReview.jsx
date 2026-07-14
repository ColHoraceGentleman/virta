// Virta Books — Setup Wizard Step 6 (Review & create).
//
// Per SETUP_AND_CATEGORIES.md §6 Step 6 + TASK-b2b-setup-wizard-completion.md
// (re-scoped to B2b-2 2026-07-14) §1-2. Two-column review of everything
// entered across Steps 2-5. Every row has a pencil icon; clicking it
// expands that row inline with Save/Cancel. Only one row is expanded at a
// time; Esc collapses whichever row is open. Skipped fields render as "—"
// (italic, muted) via the shared SKIPPED_PLACEHOLDER and remain editable.
//
// The B2b-2 task brief's field table (not the older flat wireframe <dl>)
// is the field list this build follows: Proprietor name, Business name,
// Trade name, NAICS code, EIN on the left; Address line 1/2, City, State,
// ZIP, Accounting method, Fiscal year start, Business start date on the
// right. Per the brief, "Name only, since that's the only Step-2 field
// that affects the review" — business_description is intentionally NOT
// reviewed here (flagged as an out-of-scope finding in the build report;
// the wireframe's flat <dl> includes a "What you do" row that this
// B2b-2-scoped table omits).
//
// NAICS is the one field whose pencil does NOT expand an inline row editor
// — it opens the existing SetupWizardNaicsModal in place, per the brief
// ("opens the NAICS modal in-place (NOT a Step 2 re-render)").
//
// Final POST + chaining (createBusiness / updateBusiness, clearing wizard
// state, the useSetupGate re-fetch, and the Categories navigation
// fallback) is owned by the parent (SetupWizard.jsx) and exposed to this
// component via the `onFinish` prop — this component only owns the
// Step-6-local UI (submitting/error state for the CTA, the edit-on-review
// rows).
import React, { useCallback, useEffect, useState } from 'react';
import SetupWizardReviewRow, { SKIPPED_PLACEHOLDER } from './SetupWizardReviewRow.jsx';
import SetupWizardNaicsModal from './SetupWizardNaicsModal.jsx';
import US_STATES from './us-states.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function displayOrPlaceholder(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return SKIPPED_PLACEHOLDER;
  }
  return value;
}

// Shared text-input style so every inline editor in Step 6 looks the same
// regardless of which step it "belongs" to.
const INLINE_INPUT_CLASS =
  'w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none';

export default function SetupWizardReview({ setup, updateSetup, onBack, onFinish }) {
  // Which single field row is currently expanded (or null). Draft holds the
  // in-progress edit for that field so Cancel can discard without touching
  // wizard state.
  const [expandedField, setExpandedField] = useState(null);
  const [draft, setDraft] = useState({});
  const [showNaicsModal, setShowNaicsModal] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const startEdit = useCallback((field, initialValue) => {
    setDraft({ [field]: initialValue });
    setExpandedField(field);
  }, []);

  const cancelEdit = useCallback(() => {
    setExpandedField(null);
    setDraft({});
  }, []);

  const saveEdit = useCallback((field) => {
    updateSetup({ [field]: draft[field] });
    setExpandedField(null);
    setDraft({});
  }, [draft, updateSetup]);

  // Esc collapses whichever row is expanded. Doesn't interfere with the
  // NAICS modal, which owns its own Esc-to-close handler.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && expandedField) {
        setExpandedField(null);
        setDraft({});
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedField]);

  const handleFinish = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      await onFinish();
      // On success the parent navigates away; no need to flip submitting
      // back off (component is about to unmount).
    } catch (err) {
      setSubmitError((err && err.message) || 'Something went wrong saving your business. Please try again.');
      setSubmitting(false);
    }
  };

  // ---- Simple text-field row (used by most Left-column + address rows) ----
  function textRow(field, label) {
    return (
      <SetupWizardReviewRow
        key={field}
        fieldKey={field}
        label={label}
        displayValue={displayOrPlaceholder(setup[field])}
        isEditing={expandedField === field}
        onEdit={() => startEdit(field, setup[field] || '')}
        onSave={() => saveEdit(field)}
        onCancel={cancelEdit}
        editor={
          <input
            type="text"
            autoFocus
            value={draft[field] ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
            data-testid={`wizard-step6-row-${field}-input`}
            className={INLINE_INPUT_CLASS}
          />
        }
      />
    );
  }

  return (
    <div>
      <h2 className="text-xl font-light text-slate-100 mt-0 mb-1">
        Review &amp; create
      </h2>
      <p className="text-slate-300 text-sm mb-5">
        Review what you entered. Click the pencil on any row to edit it in
        place. Anything skipped can still be filled in here, or later from
        Settings.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6" data-testid="wizard-step6-review">
        {/* Left column */}
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
            About you
          </div>
          {textRow('proprietor_name', 'Your name')}

          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2 mt-5">
            About your business
          </div>
          {textRow('business_name', 'Business name')}
          {textRow('trade_name', 'Trade name')}

          {/* NAICS — pencil opens the modal in-place, not a text editor. */}
          <SetupWizardReviewRow
            fieldKey="naics_code"
            label="NAICS code"
            displayValue={
              setup.naics_code
                ? `${setup.naics_code}${setup.naics_title ? ` — ${setup.naics_title}` : ''}`
                : SKIPPED_PLACEHOLDER
            }
            isEditing={false}
            onEdit={() => setShowNaicsModal(true)}
            onSave={() => {}}
            onCancel={() => {}}
            editor={null}
          />

          {textRow('ein', 'EIN')}
        </div>

        {/* Right column */}
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
            Address
          </div>
          {textRow('address_line1', 'Address line 1')}
          {textRow('address_line2', 'Address line 2')}
          {textRow('city', 'City')}

          <SetupWizardReviewRow
            fieldKey="state"
            label="State"
            displayValue={displayOrPlaceholder(setup.state)}
            isEditing={expandedField === 'state'}
            onEdit={() => startEdit('state', setup.state || '')}
            onSave={() => saveEdit('state')}
            onCancel={cancelEdit}
            editor={
              <select
                autoFocus
                value={draft.state ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value }))}
                data-testid="wizard-step6-row-state-input"
                className={INLINE_INPUT_CLASS}
              >
                <option value="">— Select state —</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            }
          />

          {textRow('postal', 'ZIP')}

          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2 mt-5">
            Accounting &amp; timeline
          </div>

          <SetupWizardReviewRow
            fieldKey="accounting_method"
            label="Accounting method"
            displayValue={setup.accounting_method === 'accrual' ? 'Accrual' : 'Cash'}
            isEditing={expandedField === 'accounting_method'}
            onEdit={() => startEdit('accounting_method', setup.accounting_method || 'cash')}
            onSave={() => saveEdit('accounting_method')}
            onCancel={cancelEdit}
            editor={
              <div className="space-y-2" data-testid="wizard-step6-row-accounting-method-input">
                <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                  <input
                    type="radio"
                    name="wizard-step6-accounting-method"
                    checked={(draft.accounting_method || 'cash') === 'cash'}
                    onChange={() => setDraft((d) => ({ ...d, accounting_method: 'cash' }))}
                    className="accent-indigo-500"
                  />
                  Cash
                </label>
                <label
                  className="flex items-center gap-2 text-sm text-slate-500 cursor-not-allowed opacity-60"
                  title="Available in a future version"
                >
                  <input type="radio" disabled className="accent-indigo-500" />
                  Accrual <span className="text-[10px] uppercase tracking-wider">(coming later)</span>
                </label>
              </div>
            }
          />

          <SetupWizardReviewRow
            fieldKey="fiscal_year_start_month"
            label="Fiscal year starts"
            displayValue={MONTHS[(Number(setup.fiscal_year_start_month) || 1) - 1]}
            isEditing={expandedField === 'fiscal_year_start_month'}
            onEdit={() => startEdit('fiscal_year_start_month', Number(setup.fiscal_year_start_month) || 1)}
            onSave={() => saveEdit('fiscal_year_start_month')}
            onCancel={cancelEdit}
            editor={
              <select
                autoFocus
                value={draft.fiscal_year_start_month ?? 1}
                onChange={(e) => setDraft((d) => ({ ...d, fiscal_year_start_month: Number(e.target.value) }))}
                data-testid="wizard-step6-row-fiscal_year_start_month-input"
                className={INLINE_INPUT_CLASS}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            }
          />

          <SetupWizardReviewRow
            fieldKey="business_started_on"
            label="Business start date"
            displayValue={displayOrPlaceholder(setup.business_started_on)}
            isEditing={expandedField === 'business_started_on'}
            onEdit={() => startEdit('business_started_on', setup.business_started_on || '')}
            onSave={() => saveEdit('business_started_on')}
            onCancel={cancelEdit}
            editor={
              <input
                type="date"
                autoFocus
                value={draft.business_started_on ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, business_started_on: e.target.value }))}
                data-testid="wizard-step6-row-business_started_on-input"
                className={INLINE_INPUT_CLASS}
              />
            }
          />
        </div>
      </div>

      {/* Final CTAs — Back / Save & continue to Categories. */}
      <div className="mt-6 pt-4 border-t border-slate-700">
        {submitError && (
          <div
            className="mb-3 px-3 py-2 bg-rose-950/40 border border-rose-900 rounded text-rose-300 text-sm"
            data-testid="wizard-step6-error"
          >
            {submitError}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            data-testid="wizard-step6-back"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleFinish}
            disabled={submitting}
            data-testid="wizard-step6-save"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Save & continue to Categories →'}
          </button>
        </div>
      </div>

      {/* NAICS modal — opened in place from the review row's pencil. */}
      {showNaicsModal && (
        <SetupWizardNaicsModal
          currentCode={setup.naics_code}
          onSelect={(code, title) => {
            updateSetup({ naics_code: code, naics_title: title });
            setShowNaicsModal(false);
          }}
          onClear={() => {
            // Same F4 fix as Step 2: Clear only clears the field, modal
            // stays open so the user can re-pick.
            updateSetup({ naics_code: '', naics_title: '' });
          }}
          onClose={() => setShowNaicsModal(false)}
        />
      )}
    </div>
  );
}
