// Virta Books — Setup Wizard Step 6 (Review & create): edit-on-review row.
//
// Per SETUP_AND_CATEGORIES.md §6 Step 6 + TASK-b2b-setup-wizard-completion.md
// (B2b-2 re-scope) §1: "Every row has a pencil icon on the right side.
// Clicking the pencil expands the row inline; the field editors render in
// place, with Save + Cancel buttons. Save persists to wizard state and
// re-renders the row. Skipped items show as '—' (italic, muted) — also
// editable."
//
// This component is intentionally dumb/presentational: it renders the
// collapsed (label + value + pencil) or expanded (label + editor + Save/
// Cancel) states, but all the editing state (which field is expanded, the
// draft value, Save/Cancel behavior) lives in the parent (SetupWizardReview)
// so only one row can be expanded across the whole two-column layout at a
// time (per the brief: "One row expanded at a time").
//
// `displayValue` may be any renderable node. When the underlying setup
// field is empty, callers pass the shared `SKIPPED_PLACEHOLDER` node below
// so every "—" reads identically (italic, muted) across every row.
import React from 'react';

export const SKIPPED_PLACEHOLDER = (
  <span className="italic text-slate-500">—</span>
);

export default function SetupWizardReviewRow({
  fieldKey,
  label,
  displayValue,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  editor,
  saveDisabled,
}) {
  return (
    <div
      className="py-2.5 border-b border-slate-800/70 last:border-b-0"
      data-testid={`wizard-step6-row-${fieldKey}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-400 mb-0.5">{label}</div>
          {!isEditing && (
            <div
              className="text-sm text-slate-100 break-words"
              data-testid={`wizard-step6-row-${fieldKey}-value`}
            >
              {displayValue}
            </div>
          )}
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={onEdit}
            title={`Edit ${label}`}
            aria-label={`Edit ${label}`}
            data-testid={`wizard-step6-row-${fieldKey}-edit`}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 transition-colors"
          >
            ✎
          </button>
        )}
      </div>

      {isEditing && (
        <div className="mt-2 pl-0" data-testid={`wizard-step6-row-${fieldKey}-editor`}>
          {editor}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saveDisabled}
              data-testid={`wizard-step6-row-${fieldKey}-save`}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              data-testid={`wizard-step6-row-${fieldKey}-cancel`}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
