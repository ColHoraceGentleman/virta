// Virta Books — v2 Setup Wizard (B2a-wizard-B + B2b-1 + B2b-2: all 6 steps).
//
// Wireframe source of truth: WIREFRAMES.html renderSetup() (line 313) + §6 of
// docs/books/setup-wizard/SETUP_AND_CATEGORIES.md. The full wizard is 6
// steps. B2a-wizard-B shipped Steps 1-2 + the NAICS picker modal. B2b-1
// added Steps 3-5 (Contact / Accounting method / Timeline). B2b-2 lands
// Step 6 (Review & create) + edit-on-review + the final POST to
// /businesses + chaining to the Categories Wizard.
//
// State machine
// -------------
// Wizard state lives in localStorage under `virta_books:wizard:setup:state`.
// Every change debounce-writes (250ms). On mount of /books/setup we
// hydrate from localStorage. If `setupCompletedAt` is set we render a
// "Welcome back" panel with [Restart] and [Continue to Books] buttons
// instead of the live wizard.
//
// Schema versioning (B2b-2, Wren B2a-wizard-B NIT F5): DEFAULT_STATE now
// carries `schemaVersion: 2`. hydrateWizardState() compares the persisted
// payload's schemaVersion against the current one:
//   - missing/older  → treat as v1; force the rendered step to 1 and set
//                      a transient `schemaPrompt` so Step 1 can render a
//                      "Continue from here / Start over" banner. The user's
//                      data is NOT discarded — only the active step is
//                      reset until they choose.
//   - newer          → we don't understand this shape; discard entirely
//                      and start fresh.
//   - matches        → hydrate silently, no prompt.
// `schemaPrompt` is transient (not persisted) — the debounced-save effect
// strips it before writing to localStorage.
//
// Step 1 (Welcome) — SetupWizardWelcome.jsx
// Step 2 (Basic business info) — SetupWizardBusinessInfo.jsx
// Step 3 (Contact) — SetupWizardContact.jsx
// Step 4 (Accounting method) — SetupWizardAccounting.jsx
// Step 5 (Timeline) — SetupWizardTimeline.jsx
// Step 6 (Review & create) — SetupWizardReview.jsx
// NAICS picker modal — SetupWizardNaicsModal.jsx
// Progress dots — SetupWizardProgress.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import SetupWizardWelcome from './SetupWizardWelcome.jsx';
import SetupWizardBusinessInfo from './SetupWizardBusinessInfo.jsx';
import SetupWizardContact from './SetupWizardContact.jsx';
import SetupWizardAccounting from './SetupWizardAccounting.jsx';
import SetupWizardTimeline from './SetupWizardTimeline.jsx';
import SetupWizardReview from './SetupWizardReview.jsx';
import SetupWizardProgress from './SetupWizardProgress.jsx';
import { booksApi } from './api.js';

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
  // schemaVersion — bumped from the implicit v1 (B2a-wizard-B/B2b-1) to 2
  // when B2b-2 added setupCompletedAt-driven completion + Step 6. See
  // hydrateWizardState() below for the migration/discard rules.
  schemaVersion: 2,
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
//
// schemaVersion handling (B2b-2, NIT F5): a persisted payload with no
// schemaVersion field is treated as v1. If v1 < current (2), we keep the
// user's data but force the active step to 1 and attach a transient
// `schemaPrompt` (not persisted) so the Step 1 banner can offer
// "Continue from here" (jumps to their old step, bumps schemaVersion) or
// "Start over" (full reset via restartWizard). A payload claiming a
// *newer* schemaVersion than we understand is discarded outright — we
// have no safe way to downgrade an unknown future shape.
function freshDefaultState() {
  return { ...DEFAULT_STATE, setup: { ...DEFAULT_STATE.setup }, schemaPrompt: null };
}

export function hydrateWizardState() {
  if (typeof window === 'undefined') return freshDefaultState();
  try {
    const raw = window.localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return freshDefaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return freshDefaultState();
    }

    const currentVersion = DEFAULT_STATE.schemaVersion;
    const persistedVersion = Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : 1;

    if (persistedVersion > currentVersion) {
      // Newer than we understand — discard entirely rather than guess at a
      // downgrade path.
      return freshDefaultState();
    }

    // Merge setup fields over defaults so older payloads with missing keys
    // (e.g. before naics_title was added) pick up the new defaults instead
    // of crashing the renderer.
    const merged = {
      ...DEFAULT_STATE,
      ...parsed,
      setup: { ...DEFAULT_STATE.setup, ...(parsed.setup || {}) },
      schemaVersion: persistedVersion,
      schemaPrompt: null,
    };

    if (persistedVersion < currentVersion) {
      const resumeStep = Math.max(1, Math.min(SETUP_STEPS.length, Number(merged.setupStep) || 1));
      merged.setupStep = 1;
      merged.schemaPrompt = { needed: true, resumeStep };
    }

    return merged;
  } catch {
    return freshDefaultState();
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

// CATEGORIES_NAV_CHAIN — the Step 6 "Save & continue to Categories" CTA's
// navigation priority order per TASK-b2b-setup-wizard-completion.md §2:
//   1. /books/categories/wizard  (B3a target — the not-yet-built Categories
//      Wizard). B2b-2 wires this route in BooksShell.jsx to render
//      Categories.jsx as a stand-in until B3a ships its real component, so
//      in practice this entry always "exists".
//   2. /books/categories         (B1a's shipped Categories CRUD — the
//      fallback if the wizard route is ever pulled).
//   3. /books                    (Dashboard — last-resort fallback).
// navigateAfterSetup walks this chain and takes the first entry an
// (optional, injectable) `routeExists` check approves. There's no real
// HTTP 404 in this client-side router, so `routeExists` defaults to "yes"
// for every entry — the injection point exists so QA (VB-WIZ-CHAIN-02) can
// simulate the pre-B3a world where /books/categories/wizard isn't wired.
export const CATEGORIES_NAV_CHAIN = ['/books/categories/wizard', '/books/categories', '/books'];

export function navigateAfterSetup(navigate, routeExists) {
  const exists = typeof routeExists === 'function' ? routeExists : () => true;
  for (const route of CATEGORIES_NAV_CHAIN) {
    if (exists(route)) {
      navigate(route);
      return route;
    }
  }
  navigate('/books');
  return '/books';
}

export default function SetupWizard({ navigate, business, onSetupComplete }) {
  // Hydrate from localStorage on first mount. We intentionally do not
  // re-hydrate on every render — the wizard is the source of truth from
  // mount onward.
  const [state, setState] = useState(() => hydrateWizardState());

  // Debounced persistence (250ms) per the spec. We schedule the write on
  // every state change and clear any pending timer first. `schemaPrompt`
  // is transient UI state (the Step 1 migration banner) — it never gets
  // written to localStorage.
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        const { schemaPrompt, ...persistable } = state;
        window.localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(persistable));
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
  // Steps 3-5 each handle their own revert locally via updateSetup so
  // they only clear the fields they own. The parent's
  // revertSetupToDefaults is Step-2-specific.
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
  // the "Welcome back" panel's Restart button, and by the schema-mismatch
  // "Start over" banner.
  const restartWizard = useCallback(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(WIZARD_STORAGE_KEY); } catch { /* ignore */ }
    }
    setState({ ...DEFAULT_STATE, setup: { ...DEFAULT_STATE.setup }, schemaPrompt: null });
  }, []);

  // Schema-mismatch banner actions (B2b-2, NIT F5). "Continue from here"
  // jumps back to the step the user was on before the mismatch was
  // detected and bumps schemaVersion so future hydrates don't re-prompt.
  // "Start over" is a full reset via restartWizard.
  const continueFromSchemaPrompt = useCallback(() => {
    setState((s) => {
      if (!s.schemaPrompt) return s;
      const resumeStep = s.schemaPrompt.resumeStep || 1;
      return {
        ...s,
        schemaVersion: DEFAULT_STATE.schemaVersion,
        setupStep: resumeStep,
        schemaPrompt: null,
      };
    });
  }, []);

  const startOverFromSchemaPrompt = useCallback(() => {
    restartWizard();
  }, [restartWizard]);

  // handleFinishSetup — the Step 6 final POST + chaining (B2b-2 scope).
  // Creates the businesses row (if none exists yet) or updates it (if
  // `business` was passed down from BooksShell's useSetupGate). On
  // success: clears the persisted wizard state, flips setupCompletedAt in
  // memory, triggers the useSetupGate re-fetch (via the onSetupComplete
  // callback BooksShell passes in), then navigates to the Categories
  // Wizard (falling back gracefully — see navigateAfterSetup below).
  // Throws on failure so SetupWizardReview's local try/catch can show the
  // inline error and re-enable its CTA; wizard state is left untouched on
  // error per the spec ("Don't clear state").
  const handleFinishSetup = useCallback(async () => {
    // naics_title is a display-only field (not a businesses column) —
    // strip it before POSTing. Every other `setup` key maps 1:1 onto the
    // businesses schema's updatable columns (server/services/businessService.js
    // BUSINESS_FIELDS); the server ignores anything it doesn't recognize.
    const { naics_title, ...payload } = state.setup;

    if (business) {
      await booksApi.updateBusiness(payload);
    } else {
      await booksApi.createBusiness(payload);
    }

    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(WIZARD_STORAGE_KEY); } catch { /* ignore */ }
    }
    setState((s) => ({ ...s, setupCompletedAt: new Date().toISOString() }));

    if (typeof onSetupComplete === 'function') {
      try { await onSetupComplete(); } catch { /* non-fatal — BooksShell will self-correct on next mount */ }
    }

    navigateAfterSetup(navigate);
  }, [state.setup, business, onSetupComplete, navigate]);

  // "Welcome back" panel — only rendered when setupCompletedAt is set.
  // B2b-2's handleFinishSetup sets this on a successful final POST
  // (before navigating away), so this branch is reachable if the user
  // returns to /books/setup after finishing.
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
          {/* Schema-mismatch banner (B2b-2, NIT F5) — only rendered on
              Step 1, only when hydrateWizardState() detected an
              older-schema payload. Doesn't block the wizard; the user
              picks Continue-from-here or Start-over and the banner goes
              away either way. */}
          {stepNumber === 1 && state.schemaPrompt && state.schemaPrompt.needed && (
            <div
              className="mb-4 px-4 py-3 bg-amber-950/40 border border-amber-900 rounded-lg"
              data-testid="wizard-schema-mismatch-banner"
            >
              <div className="text-sm text-amber-200 mb-2">
                Your saved setup is from an older version. Continue from here, or start over?
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={continueFromSchemaPrompt}
                  data-testid="wizard-schema-mismatch-continue"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium"
                >
                  Continue from here
                </button>
                <button
                  type="button"
                  onClick={startOverFromSchemaPrompt}
                  data-testid="wizard-schema-mismatch-start-over"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  Start over
                </button>
              </div>
            </div>
          )}
          {stepNumber === 1 && <SetupWizardWelcome setStep={setStep} />}
          {stepNumber === 2 && (
            <SetupWizardBusinessInfo
              setup={state.setup}
              updateSetup={updateSetup}
              setStep={setStep}
              revertSetupToDefaults={revertSetupToDefaults}
            />
          )}
          {stepNumber === 3 && (
            <SetupWizardContact
              setup={state.setup}
              updateSetup={updateSetup}
              setStep={setStep}
            />
          )}
          {stepNumber === 4 && (
            <SetupWizardAccounting
              setup={state.setup}
              updateSetup={updateSetup}
              setStep={setStep}
            />
          )}
          {stepNumber === 5 && (
            <SetupWizardTimeline
              setup={state.setup}
              updateSetup={updateSetup}
              setStep={setStep}
            />
          )}
          {stepNumber === 6 && (
            <SetupWizardReview
              setup={state.setup}
              updateSetup={updateSetup}
              onBack={() => setStep(5)}
              onFinish={handleFinishSetup}
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
