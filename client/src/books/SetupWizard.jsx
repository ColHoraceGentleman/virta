// Virta Books — v2 Setup Wizard (B2a-wizard-B: Steps 1-2 + NAICS modal).
//
// Wireframe source of truth: WIREFRAMES.html renderSetup() (line 313) + §6 of
// docs/books/setup-wizard/SETUP_AND_CATEGORIES.md. The full wizard is 6
// steps. B2a-wizard-B ships a real implementation of Steps 1-2 + the NAICS
// picker modal; Steps 3-6 render a "Coming in B2b" placeholder card so the
// step machine + progress dots are demonstrably real (B2b will replace
// the placeholder with the actual step component).
//
// State machine
// -------------
// Wizard state lives in localStorage under `virta_books:wizard:setup:state`.
// Every change debounce-writes (250ms). On mount of /books/setup we
// hydrate from localStorage. If `setupCompletedAt` is set we render a
// "Welcome back" panel with [Restart] and [Continue to Books] buttons
// instead of the live wizard.
//
// B2b (separate task) will land the final POST to /businesses and set
// setupCompletedAt. Until then `setupCompletedAt` stays null.
//
// Step 1 (Welcome) — SetupWizardWelcome.jsx
// Step 2 (Basic business info) — SetupWizardBusinessInfo.jsx
// Step 3-6 (placeholders) — SetupWizardStepPlaceholder.jsx
// NAICS picker modal — SetupWizardNaicsModal.jsx
// Progress dots — SetupWizardProgress.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SetupWizardWelcome from './SetupWizardWelcome.jsx';
import SetupWizardBusinessInfo from './SetupWizardBusinessInfo.jsx';
import SetupWizardStepPlaceholder from './SetupWizardStepPlaceholder.jsx';
import SetupWizardProgress from './SetupWizardProgress.jsx';

export const WIZARD_STORAGE_KEY = 'virta_books:wizard:setup:state';

// SETUP_STEPS — mirrors WIREFRAMES.html SETUP_STEPS but kept here so the
// React side can render the progress dots + step labels without touching
// the wireframe file. Step 1 = Welcome (no skip), 2 = Basic business info,
// 3-6 = Contact / Accounting method / Timeline / Review. Only Steps 1-2
// are implemented in B2a-wizard-B; Steps 3-6 render a placeholder.
export const SETUP_STEPS = [
  { n: 1, name: 'Welcome',                skippable: false },
  { n: 2, name: 'Basic business info',    skippable: true  },
  { n: 3, name: 'Contact',                skippable: true  },
  { n: 4, name: 'Accounting method',      skippable: true  },
  { n: 5, name: 'Timeline',               skippable: true  },
  { n: 6, name: 'Review & create',        skippable: false },
];

// DEFAULT_STATE — the shape documented in TASK-b2a-wizard-b.md §1.
// Fields covered in B2a-wizard-B (Steps 1-2): proprietor_name, business_name,
// trade_name, business_description, naics_code, naics_title, ein.
// Fields reserved for B2b (Steps 3-5): address_*, accounting_method,
// fiscal_year_start_month, business_started_on.
// naics_title is display-only (not persisted to the businesses row).
// accounting_method defaults to 'cash' per the spec; FY month defaults to 1.
export const DEFAULT_STATE = {
  setupStep: 1,
  setup: {
    proprietor_name: '',
    business_name: '',
    trade_name: '',
    business_description: '',
    naics_code: '',
    naics_title: '',
    ein: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal: '',
    accounting_method: 'cash',
    fiscal_year_start_month: 1,
    business_started_on: '',
  },
  setupDirty: false,
  setupCompletedAt: null,
};

// hydrateWizardState — reads from localStorage, validating the shape. If
// anything looks off (missing keys, wrong types, old shape) we fall back
// to DEFAULT_STATE. Returns a fresh deep-cloned object every time so
// downstream setState calls always mutate their own copy.
export function hydrateWizardState() {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE, setup: { ...DEFAULT_STATE.setup } };
  try {
    const raw = window.localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE, setup: { ...DEFAULT_STATE.setup } };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_STATE, setup: { ...DEFAULT_STATE.setup } };
    }
    // Merge setup fields over defaults so older payloads with missing keys
    // (e.g. before naics_title was added) pick up the new defaults instead
    // of crashing the renderer.
    const merged = {
      ...DEFAULT_STATE,
      ...parsed,
      setup: { ...DEFAULT_STATE.setup, ...(parsed.setup || {}) },
    };
    return merged;
  } catch {
    return { ...DEFAULT_STATE, setup: { ...DEFAULT_STATE.setup } };
  }
}

// EIN soft-format check — used by Step 2 to flag obvious typos. Accepts
// either 9 contiguous digits or 2-7 with a hyphen. Per TASK brief, this
// is a *warning* only, never a block.
export function validateEinFormat(ein) {
  if (!ein) return { valid: true, value: '' }; // empty is fine — EIN is optional
  const trimmed = String(ein).trim();
  if (/^\d{9}$/.test(trimmed)) return { valid: true, value: `${trimmed.slice(0,2)}-${trimmed.slice(2)}` };
  if (/^\d{2}-\d{7}$/.test(trimmed)) return { valid: true, value: trimmed };
  return { valid: false, value: trimmed };
}

export default function SetupWizard({ navigate }) {
  // Hydrate from localStorage on first mount. We intentionally do not
  // re-hydrate on every render — the wizard is the source of truth from
  // mount onward.
  const [state, setState] = useState(() => hydrateWizardState());

  // Debounced persistence (250ms) per the spec. We schedule the write on
  // every state change and clear any pending timer first.
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
      } catch {
        // localStorage quota errors shouldn't take down the wizard.
      }
    }, 250);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  // setStep — bumps setupStep to a target, clamped to [1,6]. Used by
  // every step's "Continue" / "Back" CTA.
  const setStep = useCallback((next) => {
    setState((s) => {
      const clamped = Math.max(1, Math.min(SETUP_STEPS.length, next));
      if (clamped === s.setupStep) return s;
      return { ...s, setupStep: clamped, setupDirty: true };
    });
  }, []);

  // updateSetup — patches fields on the setup sub-object. Used by Step 2's
  // form fields and the NAICS modal's onSelect.
  const updateSetup = useCallback((patch) => {
    setState((s) => ({ ...s, setup: { ...s.setup, ...patch }, setupDirty: true }));
  }, []);

  // revertSetupToDefaults — used by Step 2's "Revert to Defaults" button.
  // Per the spec, "Skip" is the label before any field has been touched;
  // once dirty, the label flips to "Revert to Defaults" and clicking it
  // clears the user input on this step.
  const revertSetupToDefaults = useCallback(() => {
    setState((s) => ({
      ...s,
      setup: {
        ...DEFAULT_STATE.setup,
        // Preserve B2b fields untouched; only the B2a step 2 fields get reverted.
        address_line1: s.setup.address_line1,
        address_line2: s.setup.address_line2,
        city: s.setup.city,
        state: s.setup.state,
        postal: s.setup.postal,
        accounting_method: s.setup.accounting_method,
        fiscal_year_start_month: s.setup.fiscal_year_start_month,
        business_started_on: s.setup.business_started_on,
      },
      setupDirty: false,
    }));
  }, []);

  // restartWizard — clears localStorage + state to DEFAULT_STATE. Used by
  // the "Welcome back" panel's Restart button.
  const restartWizard = useCallback(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(WIZARD_STORAGE_KEY); } catch { /* ignore */ }
    }
    setState({ ...DEFAULT_STATE, setup: { ...DEFAULT_STATE.setup } });
  }, []);

  // "Welcome back" panel — only rendered when setupCompletedAt is set.
  // B2b will set this on the final POST. Until then this branch is
  // unreachable, but the code is here so the B2b landing surfaces
  // gracefully with no extra work.
  if (state.setupCompletedAt) {
    return (
      <div>
        <div className="mb-4">
          <span className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-xs">
            Setup complete
          </span>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow">
          <h2 className="text-xl font-light text-slate-100 mt-0 mb-2">
            Welcome back — your setup is complete.
          </h2>
          <p className="text-slate-300 text-sm mb-5">
            Books are configured. Restart the wizard to reconfigure, or continue to your dashboard.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={restartWizard}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
            >
              Restart
            </button>
            <button
              type="button"
              onClick={() => navigate('/books')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
            >
              Continue to Books →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentStep = SETUP_STEPS[state.setupStep - 1];
  const stepNumber = state.setupStep;

  return (
    <div>
      {/* Wizard header card — title, sub (step name), progress dots.
          Kept compact so the body of the step has room to breathe on a
          single screen. */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow">
        <div className="px-6 pt-5 pb-3 border-b border-slate-700">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">
            Company Setup Wizard
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-slate-200 text-sm">
              Step {stepNumber} of {SETUP_STEPS.length} — <span className="text-slate-100">{currentStep.name}</span>
              {currentStep.skippable && (
                <span className="ml-2 inline-block px-2 py-0.5 rounded bg-slate-700 border border-slate-600 text-slate-300 text-[10px] uppercase tracking-wider">
                  Skippable
                </span>
              )}
            </div>
          </div>
          <div className="mt-3">
            <SetupWizardProgress steps={SETUP_STEPS} current={stepNumber} />
          </div>
        </div>

        {/* Step body — each step is a self-contained component that
            receives { setup, updateSetup, setStep, revertSetupToDefaults }. */}
        <div className="px-6 py-5">
          {stepNumber === 1 && <SetupWizardWelcome setStep={setStep} />}
          {stepNumber === 2 && (
            <SetupWizardBusinessInfo
              setup={state.setup}
              updateSetup={updateSetup}
              setStep={setStep}
              revertSetupToDefaults={revertSetupToDefaults}
            />
          )}
          {(stepNumber === 3 || stepNumber === 4 || stepNumber === 5 || stepNumber === 6) && (
            <SetupWizardStepPlaceholder
              stepNumber={stepNumber}
              stepName={currentStep.name}
              setStep={setStep}
            />
          )}
        </div>
      </div>

      {/* Back to Dashboard — outside the wizard card so it doesn't compete
          with the wizard's own Back/Continue CTAs. */}
      <div className="mt-4 text-right">
        <button
          type="button"
          onClick={() => navigate('/books')}
          className="text-xs text-slate-400 hover:text-slate-100 underline"
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
}
