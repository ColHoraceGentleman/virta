// Virta Books — Placeholder Add Account modal (B3a stub).
//
// The real generic Add Account modal is B3b scope (per
// TASK-b3a-categories-wizard-first-half.md §3/§5). This stub exists so the
// Steps 2/3 "+Add" buttons have somewhere to go, and so its `onSave`
// signature matches what B3b's real modal will use — swapping this
// component out for the real one in B3b should be a one-line change in
// CategoriesWizardExpensesStep.jsx / CategoriesWizardIncomeStep.jsx.
//
// onSave signature (carry-forward design contract, per the brief's
// "Add-via-picker pattern" section): onSave(account) — called with the
// newly created account object so the caller can auto-select it in
// whatever picker/table state triggered the modal. The stub never calls
// onSave itself (there's nothing to save yet), but the prop is wired so
// B8/B9 (Customers/Vendors) and B3b's real modal reuse the same contract.
export default function PlaceholderAddAccountModal({ open, type, onClose, onSave }) {
  if (!open) return null;

  const typeLabel = type === 'expense' ? 'expense' : type === 'income' ? 'income' : 'account';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="placeholder-add-account-modal"
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
        <h3 className="text-lg font-light text-slate-100 mt-0 mb-2">
          Add {typeLabel} category
        </h3>
        <p className="text-slate-300 text-sm mb-5">
          Add Account modal — coming in B3b.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="placeholder-add-account-close"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
