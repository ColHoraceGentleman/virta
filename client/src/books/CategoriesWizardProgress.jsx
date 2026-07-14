// Virta Books — Categories Wizard progress indicator.
//
// Mirrors SetupWizardProgress.jsx 1:1 — a row of dots, one per step,
// connected by a thin bar. Completed steps (n < current) are filled; the
// current step (n === current) is highlighted; future steps are dim.
import React from 'react';

export default function CategoriesWizardProgress({ steps, current, onDotClick }) {
  return (
    <div className="flex items-center gap-1.5" data-testid="cat-wizard-progress">
      {steps.map((s, idx) => {
        const status = s.n < current ? 'done' : s.n === current ? 'current' : 'todo';
        const dotCls =
          status === 'done'
            ? 'bg-indigo-500 border-indigo-400'
            : status === 'current'
              ? 'bg-indigo-600 border-indigo-400 ring-2 ring-indigo-400/30'
              : 'bg-slate-700 border-slate-600';
        return (
          <React.Fragment key={s.n}>
            <button
              type="button"
              onClick={() => onDotClick && onDotClick(s.n)}
              title={`Step ${s.n}: ${s.name}`}
              data-testid={`cat-wizard-dot-${s.n}`}
              data-step-status={status}
              className={`w-3 h-3 rounded-full border transition-colors ${dotCls} ${
                onDotClick ? 'cursor-pointer hover:scale-110' : 'cursor-default'
              }`}
              aria-label={`Step ${s.n}: ${s.name}`}
            />
            {idx < steps.length - 1 && (
              <span
                className={`h-px flex-1 ${s.n < current ? 'bg-indigo-500/60' : 'bg-slate-700'}`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
