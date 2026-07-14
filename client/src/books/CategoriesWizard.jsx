// Virta Books — v2 Categories Wizard (B3a: Welcome + Steps 2-3).
//
// Wireframe source of truth: WIREFRAMES.html + SETUP_AND_CATEGORIES.md §7,
// §10. The full wizard is 6 steps (Welcome, Expenses, Income, Asset/Liab/
// Equity, Review Later, Final review). B3a ships Steps 1-3; B3b ships
// Steps 4-6 + the real Add Account modal (PlaceholderAddAccountModal is a
// stub here, per TASK-b3a-categories-wizard-first-half.md §3).
//
// State machine — mirrors SetupWizard.jsx's pattern 1:1 (storage key,
// debounced (250ms) localStorage persistence, hydrate-on-mount, resume /
// start-over banner for mid-wizard cancellation). Storage key is
// namespaced `wizard:categories` per the brief.
//
// Default accounts — DEFAULT_EXPENSES (23: 22 alphabetical + the system
// "Review Later" bucket) and DEFAULT_INCOME (3, intentionally NOT
// alphabetical — Sales / Refunds & Returns / Other Income, per
// VB-CATWIZ-STEP3-02 / CW-007) are hardcoded below per SETUP_AND_CATEGORIES
// §10. B3a only renders expenses + income; B3b renders asset/liability/
// equity.
import { useCallback, useEffect, useRef, useState } from 'react';
import CategoriesWizardStep1 from './CategoriesWizardStep1.jsx';
import CategoriesWizardExpensesStep from './CategoriesWizardExpensesStep.jsx';
import CategoriesWizardIncomeStep from './CategoriesWizardIncomeStep.jsx';
import CategoriesWizardProgress from './CategoriesWizardProgress.jsx';
import { booksApi } from './api.js';

export const CATEGORIES_WIZARD_STORAGE_KEY = 'virta_books:wizard:categories:state';

// CATEGORIES_STEPS — the full 6-step flow's labels, for the progress dots.
// Steps 4-6 render a "Coming in B3b" placeholder if ever reached (they
// shouldn't be, since Step 3's Next → is the last wired CTA in B3a).
export const CATEGORIES_STEPS = [
  { n: 1, name: 'Welcome',                       skippable: false },
  { n: 2, name: 'Expense categories',            skippable: true  },
  { n: 3, name: 'Income categories',             skippable: true  },
  { n: 4, name: 'Assets / Liabilities / Equity', skippable: true  },
  { n: 5, name: 'Review Later',                  skippable: true  },
  { n: 6, name: 'Final review',                  skippable: false },
];

// DEFAULT_EXPENSES — 23 total: 22 alphabetical Schedule C expense
// categories (§10 canonical table, transcribed verbatim) + the system
// "Review Later" bucket (code 6999, the catch-all at the end of the 6xxx
// range, per §10's sort-order note). `system: true` accounts can't be
// deleted, hidden, or renamed (SIGNIFICANT-1 fix — guarded both in the UI
// and defensively in CategoriesWizard.jsx's hideAccount/deleteAccount).
//
// NOTE (SIGNIFICANT-2 fix): this table previously used a "modern SaaS
// bookkeeping" invented scheme (different names, added/missing rows, and
// wrong Schedule C line numbers on 21 of 23 rows). It has been replaced
// with the exact §10 table — names, codes, and Schedule C lines verbatim.
// No inference. See CINDER_REPORT_b3a-fixes.md for the row-by-row proof.
export const DEFAULT_EXPENSES = [
  { code: '6000', name: 'Accounting',              irs_line: 'Line 16b',  descriptor: 'Bookkeeper, accountant fees' },
  { code: '6010', name: 'Advertising',              irs_line: 'Line 8',    descriptor: 'Ads, marketing, promotions' },
  { code: '6020', name: 'Car & Truck',              irs_line: 'Line 9',    descriptor: 'Car and truck expenses for business' },
  { code: '6030', name: 'Commissions',              irs_line: 'Line 10',   descriptor: 'Commissions paid to non-employees' },
  { code: '6040', name: 'Contract Labor',           irs_line: 'Line 11',   descriptor: 'Payments to independent contractors' },
  { code: '6050', name: 'Depletion',                irs_line: 'Line 12',   descriptor: 'Depletion of natural resources (rare)' },
  { code: '6060', name: 'Depreciation',             irs_line: 'Line 13',   descriptor: 'Depreciation of business assets' },
  { code: '6070', name: 'Insurance',                irs_line: 'Line 14',   descriptor: 'Business liability, vehicle, etc.' },
  { code: '6080', name: 'Interest',                 irs_line: 'Line 15b',  descriptor: 'Other business interest' },
  { code: '6090', name: 'Legal & Professional',     irs_line: 'Line 16a',  descriptor: 'Lawyer, consultant fees' },
  { code: '6100', name: 'Meals',                    irs_line: 'Line 24b',  descriptor: 'Business meals (50% deductible)' },
  { code: '6110', name: 'Mortgage Interest',        irs_line: 'Line 15a',  descriptor: 'Mortgage on business property' },
  { code: '6120', name: 'Office Expense',           irs_line: 'Line 17',   descriptor: 'Office supplies, small equipment' },
  { code: '6130', name: 'Phone',                    irs_line: 'Line 25b',  descriptor: 'Business phone / mobile' },
  { code: '6140', name: 'Rent',                     irs_line: 'Line 19',   descriptor: 'Rent or lease on business property' },
  { code: '6150', name: 'Repairs & Maintenance',    irs_line: 'Line 20a',  descriptor: 'Repairs to business property/equipment' },
  { code: '6160', name: 'Retirement',               irs_line: 'Line 18',   descriptor: 'Pension / profit-sharing / SEP-IRA' },
  { code: '6170', name: 'Supplies',                 irs_line: 'Line 20b',  descriptor: 'Materials and supplies' },
  { code: '6180', name: 'Taxes & Licenses',         irs_line: 'Line 21',   descriptor: 'Business taxes, licenses, permits' },
  { code: '6190', name: 'Travel',                   irs_line: 'Line 24a',  descriptor: 'Business travel away from home' },
  { code: '6200', name: 'Utilities',                irs_line: 'Line 25a',  descriptor: 'Electric, water, gas for business' },
  { code: '6210', name: 'Wages',                    irs_line: 'Line 26',   descriptor: 'Wages to employees' },
  { code: '6999', name: 'Review Later',             irs_line: null,        descriptor: 'System bucket for low-confidence categorization', system: true },
];

// DEFAULT_INCOME — intentionally NOT alphabetical. Sales / Refunds &
// Returns / Other Income, per VB-CATWIZ-STEP3-02 (CW-007 exception).
// Names/codes/lines verbatim from §10's Income table (verified against
// spec — no divergence found for income; only DEFAULT_EXPENSES needed
// the SIGNIFICANT-2 fix).
export const DEFAULT_INCOME = [
  { code: '4000', name: 'Sales',              irs_line: 'Part I line 1', descriptor: 'Gross receipts or sales' },
  { code: '4010', name: 'Refunds & Returns',  irs_line: 'Part I line 7', descriptor: 'Refunds and returns' },
  { code: '4020', name: 'Other Income',       irs_line: 'Part I line 1', descriptor: 'Other income' },
];

function seedAccounts(defaults, type) {
  return defaults.map((d, idx) => ({
    id: `${type}-${d.code}`,
    seq: idx,
    type,
    code: d.code,
    name: d.name,
    irs_line: d.irs_line,
    descriptor: d.descriptor,
    system: !!d.system,
    is_hidden: false,
    transactions_count: 0,
  }));
}

function freshDefaultState() {
  return {
    schemaVersion: 1,
    currentStep: 1,
    showAccountNumbers: false,
    expenses: seedAccounts(DEFAULT_EXPENSES, 'expense'),
    income: seedAccounts(DEFAULT_INCOME, 'income'),
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

// hydrateCategoriesWizardState — reads from localStorage, validating the
// shape. Falls back to a fresh default state on any parse error or
// unrecognized shape, mirroring SetupWizard.jsx's hydrateWizardState.
export function hydrateCategoriesWizardState() {
  if (typeof window === 'undefined') return freshDefaultState();
  try {
    const raw = window.localStorage.getItem(CATEGORIES_WIZARD_STORAGE_KEY);
    if (!raw) return freshDefaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return freshDefaultState();
    const fresh = freshDefaultState();
    return {
      ...fresh,
      ...parsed,
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : fresh.expenses,
      income: Array.isArray(parsed.income) ? parsed.income : fresh.income,
    };
  } catch {
    return freshDefaultState();
  }
}

export default function CategoriesWizard({ navigate }) {
  const [state, setState] = useState(() => hydrateCategoriesWizardState());

  // resumeAvailable — VB-CATWIZ-RESUME: on mount, if a persisted state
  // exists with completedAt === null, offer a non-blocking "Resume /
  // Start over" prompt. We detect this once at mount by checking whether
  // raw localStorage exists at all (separately from `state`, which is
  // already hydrated) so refreshing after dismissing doesn't re-show it.
  const [resumePrompt, setResumePrompt] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(CATEGORIES_WIZARD_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.completedAt == null && parsed.currentStep) {
        return { startedAt: parsed.startedAt || null, resumeStep: parsed.currentStep };
      }
      return null;
    } catch {
      return null;
    }
  });

  // Debounced persistence (250ms), same pattern as SetupWizard.jsx.
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(CATEGORIES_WIZARD_STORAGE_KEY, JSON.stringify(state));
      } catch {
        // localStorage quota errors shouldn't take down the wizard.
      }
    }, 250);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  const setStep = useCallback((next) => {
    setState((s) => {
      const clamped = Math.max(1, Math.min(CATEGORIES_STEPS.length, next));
      if (clamped === s.currentStep) return s;
      return { ...s, currentStep: clamped };
    });
  }, []);

  // setShowAccountNumbers — plumbed down to Step 1's toggle. Step 1 owns
  // the PUT /settings/show_account_numbers call itself (and rolls back
  // this value on failure); this setter just cascades the flag to Steps
  // 2 + 3's Code column visibility.
  const setShowAccountNumbers = useCallback((val) => {
    setState((s) => ({ ...s, showAccountNumbers: val }));
  }, []);

  // updateAccount — patches a single account by id (works across both
  // expenses and income arrays) both locally and via PATCH /accounts/:id.
  // In B3a the accounts are wizard-local (not yet POSTed to the server),
  // so the PATCH is best-effort — if it 404s (no such account server-side
  // yet), we still keep the local edit so the wizard UX isn't blocked on
  // a server round-trip that doesn't apply until Step 6's final POST
  // (B3b scope) creates the real rows.
  const updateAccount = useCallback((id, patch) => {
    setState((s) => {
      const patchList = (list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a));
      return { ...s, expenses: patchList(s.expenses), income: patchList(s.income) };
    });
    if (typeof id === 'string' && id.startsWith('server-')) {
      const realId = id.replace('server-', '');
      booksApi.updateAccount(realId, patch).catch(() => { /* best-effort during wizard */ });
    }
  }, []);

  // hideAccount / deleteAccount — defensive system-guard (SIGNIFICANT-1 fix):
  // these are the actual state mutators, so they refuse to operate on
  // `acc.system === true` rows (Review Later) even if some future UI path
  // forgets to gate its own button. The UI-level guard in
  // CategoriesWizardExpensesStep.jsx / IncomeStep.jsx is the primary
  // defense; this is belt-and-suspenders.
  const hideAccount = useCallback((id) => {
    setState((s) => {
      const target = [...s.expenses, ...s.income].find((a) => a.id === id);
      if (target && target.system) return s;
      const toggle = (list) => list.map((a) => (a.id === id ? { ...a, is_hidden: !a.is_hidden } : a));
      return { ...s, expenses: toggle(s.expenses), income: toggle(s.income) };
    });
    if (typeof id === 'string' && id.startsWith('server-')) {
      const realId = id.replace('server-', '');
      const acc = [...state.expenses, ...state.income].find((a) => a.id === id);
      if (acc && acc.system) return;
      booksApi.updateAccount(realId, { is_hidden: !(acc && acc.is_hidden) }).catch(() => {});
    }
  }, [state.expenses, state.income]);

  const deleteAccount = useCallback((id) => {
    setState((s) => {
      const target = [...s.expenses, ...s.income].find((a) => a.id === id);
      if (target && target.system) return s;
      return {
        ...s,
        expenses: s.expenses.filter((a) => a.id !== id),
        income: s.income.filter((a) => a.id !== id),
      };
    });
    if (typeof id === 'string' && id.startsWith('server-')) {
      const realId = id.replace('server-', '');
      const acc = [...state.expenses, ...state.income].find((a) => a.id === id);
      if (acc && acc.system) return;
      booksApi.deleteAccount(realId).catch(() => {});
    }
  }, [state.expenses, state.income]);

  const startOver = useCallback(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(CATEGORIES_WIZARD_STORAGE_KEY); } catch { /* ignore */ }
    }
    setState(freshDefaultState());
    setResumePrompt(null);
  }, []);

  const resumeWizard = useCallback(() => {
    setResumePrompt(null);
    if (resumePrompt && resumePrompt.resumeStep) {
      setStep(resumePrompt.resumeStep);
    }
  }, [resumePrompt, setStep]);

  const currentStep = CATEGORIES_STEPS[state.currentStep - 1];
  const stepNumber = state.currentStep;

  return (
    <div>
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow" data-testid="categories-wizard">
        <div className="px-6 pt-5 pb-3 border-b border-slate-700">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">
            Categories Wizard
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-slate-200 text-sm">
              Step {stepNumber} of {CATEGORIES_STEPS.length} — <span className="text-slate-100">{currentStep.name}</span>
              {currentStep.skippable && (
                <span className="ml-2 inline-block px-2 py-0.5 rounded bg-slate-700 border border-slate-600 text-slate-300 text-[10px] uppercase tracking-wider">
                  Skippable
                </span>
              )}
            </div>
          </div>
          <div className="mt-3">
            <CategoriesWizardProgress steps={CATEGORIES_STEPS} current={stepNumber} onDotClick={setStep} />
          </div>
        </div>

        <div className="px-6 py-5">
          {/* Resume / Start over banner — per the brief's §5 (mirrors
              SetupWizard.jsx's resume pattern), only rendered on Step 1
              when a persisted wizard-in-progress was detected on mount. */}
          {stepNumber === 1 && resumePrompt && (
            <div
              className="mb-4 px-4 py-3 bg-indigo-950/40 border border-indigo-900 rounded-lg"
              data-testid="cat-wizard-resume-banner"
            >
              <div className="text-sm text-indigo-200 mb-2">
                You started categories setup{resumePrompt.startedAt ? ` on ${new Date(resumePrompt.startedAt).toLocaleDateString()}` : ''}. Pick up where you left off?
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resumeWizard}
                  data-testid="cat-wizard-resume-btn"
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium"
                >
                  Resume →
                </button>
                <button
                  type="button"
                  onClick={startOver}
                  data-testid="cat-wizard-start-over-btn"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  Start over
                </button>
              </div>
            </div>
          )}

          {stepNumber === 1 && (
            <CategoriesWizardStep1
              showAccountNumbers={state.showAccountNumbers}
              setShowAccountNumbers={setShowAccountNumbers}
              setStep={setStep}
            />
          )}
          {stepNumber === 2 && (
            <CategoriesWizardExpensesStep
              accounts={state.expenses}
              showAccountNumbers={state.showAccountNumbers}
              updateAccount={updateAccount}
              hideAccount={hideAccount}
              deleteAccount={deleteAccount}
              setStep={setStep}
            />
          )}
          {stepNumber === 3 && (
            <CategoriesWizardIncomeStep
              accounts={state.income}
              showAccountNumbers={state.showAccountNumbers}
              updateAccount={updateAccount}
              hideAccount={hideAccount}
              deleteAccount={deleteAccount}
              setStep={setStep}
            />
          )}
          {stepNumber >= 4 && (
            <div className="text-center py-10" data-testid="cat-wizard-b3b-placeholder">
              <p className="text-slate-300 text-sm mb-4">
                {currentStep.name} — coming in B3b.
              </p>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
              >
                ← Back to Income categories
              </button>
            </div>
          )}
        </div>
      </div>

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
