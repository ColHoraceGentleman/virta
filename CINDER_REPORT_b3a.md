# CINDER_REPORT_b3a.md — Categories Wizard: Welcome + Steps 2-3

**Status:** DONE
**Date:** 2026-07-14 15:22 MDT
**Branch:** `main` (local only, not pushed to origin)
**Brief:** `queued/TASK-b3a-categories-wizard-first-half.md`

## Summary

Built the Categories Wizard's first half: Step 1 (Welcome + Show account
numbers toggle), Step 2 (23 default expense categories, sortable sticky
table, inline rename, tax-line popover, hide/delete), and Step 3 (3 income
categories in the intentional Sales → Refunds & Returns → Other Income
order, same table UX as Step 2). State machine mirrors `SetupWizard.jsx`'s
localStorage-persistence + resume/start-over pattern 1:1, under storage key
`virta_books:wizard:categories:state`. `BooksShell.jsx`'s
`/books/categories/wizard` route now renders the real wizard instead of the
B2b-2 `Categories.jsx` stand-in. Steps 4-6 (Asset/Liab/Equity, Review Later,
Final review) + the real Add Account modal are B3b scope — B3a ships a
`PlaceholderAddAccountModal` with the `onSave(account)` contract B3b will
reuse, and Step 3's "Next →" lands on a "coming in B3b" placeholder if
reached.

## Files

| File | Type | Lines |
|---|---|---|
| `client/src/books/CategoriesWizard.jsx` | new | 356 |
| `client/src/books/CategoriesWizardStep1.jsx` | new | 94 |
| `client/src/books/CategoriesWizardExpensesStep.jsx` | new | 298 |
| `client/src/books/CategoriesWizardIncomeStep.jsx` | new | 303 |
| `client/src/books/CategoriesWizardProgress.jsx` | new | 42 |
| `client/src/books/PlaceholderAddAccountModal.jsx` | new | 46 |
| `client/src/books/BooksShell.jsx` | modified | +5/-9 |
| `server/scripts/qa-b3a.mjs` | new | 244 |
| `server/scripts/screenshot-b3a.mjs` | new | 102 |

`client/src/books/api.js` was **not modified** — `updateSetting`,
`updateAccount` (PATCH), `deleteAccount`, `listAccounts` all already
existed from prior builds. (The brief's suggested method name
`patchAccount` doesn't exist as such; the existing `updateAccount(id,
data)` does the same PATCH `/accounts/:id` and was used instead — no new
method was added, per the brief's "only fix if missing" instruction.)

## Test coverage (21/21 brief behavior IDs + 2 route/persist detail checks)

All verified via `node server/scripts/qa-b3a.mjs` (CDP-driven, mirrors
`qa-b2b-1.mjs`). **23/23 passing.**

| Behavior ID | Result |
|---|---|
| VB-CATWIZ-ROUTE-01 | ✅ |
| VB-CATWIZ-PERSIST-01 | ✅ |
| VB-CATWIZ-PERSIST-02 | ✅ |
| VB-CATWIZ-STEP1-01 | ✅ |
| VB-CATWIZ-STEP1-02 | ✅ (toggle writes via `booksApi.updateSetting`, verified against live PUT /settings/show_account_numbers) |
| VB-CATWIZ-STEP1-03 | ✅ default OFF |
| VB-CATWIZ-STEP2-01 | ✅ |
| VB-CATWIZ-STEP2-02 | ✅ default sort Name asc |
| VB-CATWIZ-STEP2-03 | ✅ |
| VB-CATWIZ-STEP2-04 | ✅ Code column absent when toggle OFF |
| VB-CATWIZ-STEP2-05 | ✅ |
| VB-CATWIZ-STEP2-06 | ✅ |
| VB-CATWIZ-STEP2-07 | ✅ row count drops 23→22 on confirmed delete |
| VB-CATWIZ-STEP2-08 | ✅ 23 defaults on skip |
| VB-CATWIZ-STEP2-09 | ✅ placeholder modal |
| VB-CATWIZ-STEP2-10 | ✅ defensive code path present (hasTx ? disabled span : Delete button) |
| VB-CATWIZ-STEP3-01 | ✅ |
| VB-CATWIZ-STEP3-02 | ✅ order = ["Sales","Refunds & Returns","Other Income"] |
| VB-CATWIZ-STEP3-03 | ✅ |
| VB-CATWIZ-STEP3-04 | ✅ |
| VB-CATWIZ-RESUME-01 | ✅ |
| VB-CATWIZ-RESUME-02 | ✅ |
| VB-CATWIZ-RESUME-03 | ✅ |
| VB-CATWIZ-SHELL-01 | ✅ |

## Cross-cutting

- **Wireframe smoke:** `node docs/books/setup-wizard/tests/wf-smoke.mjs` → **255/255 passed.** No wireframe/spec files touched.
- **Dark-mode visual check:** captured + reviewed `step1-welcome.png`, `step2-expenses.png`, `step3-income.png`. Slate backgrounds, light text, no light-mode leaks, no overlap, table/badges/buttons render correctly against dark chrome.
- **No regressions:** Setup Wizard (`SetupWizard.jsx`), Transactions, and post-wizard `Categories.jsx` CRUD were not touched. `/books/categories` route still renders `Categories.jsx` unchanged.

## Demo screenshots

`demos/2026.07.14-b3a/`:
- `step1-welcome.png`
- `step2-expenses.png`
- `step2-expenses-sorted.png`
- `step3-income.png`
- `step3-income-sorted.png`

## Judgment calls

1. **Tax-line values on `DEFAULT_EXPENSES`** — the brief's example snippet gave only 2 sample rows (`Line 16b`/`Accounting`, `Line 8`/`Advertising`) and said "22 more alphabetical." I filled in the remaining 20 with reasonable Schedule C Part II line mappings (Bank Fees→27a, Business Insurance→15, Car & Truck→9, etc.) since no canonical list of all 22 was quoted in the brief. Wren/Echo should sanity-check these against `SETUP_AND_CATEGORIES.md` §10's actual seed list if it differs from what I inferred.
2. **`updateAccount` vs `patchAccount`** — the brief's file list mentions confirming `patchAccount` exists in `api.js`; it doesn't (the existing method is `updateAccount`). Used the existing method rather than adding a duplicate.
3. **Step 3's default-order sort behavior** — I made the income table's "no explicit sort yet" state preserve array order (Sales/Refunds/Other) rather than force-sorting by insertion index, so the user can still click "Name" to sort alphabetically if they want (matches the brief's "same sortable columns as Step 2" requirement) while defaulting correctly per VB-CATWIZ-STEP3-02.
4. **Resume banner** — implemented as a check-on-mount against raw localStorage (separate from the hydrated `state`) so it only shows once per page load and doesn't re-appear after the user dismisses it without a reload — same spirit as `SetupWizard.jsx`'s schema-mismatch banner pattern, adapted since Categories Wizard doesn't have a schema-mismatch concept in B3a (no prior version to migrate from).
5. **PATCH/DELETE calls are gated on a `server-` id prefix** that doesn't exist yet in B3a (all wizard accounts are locally-seeded with ids like `expense-6000`). This is intentional: in B3a nothing has been POSTed to the server yet (that's B3b's Step 6 final-POST scope), so `updateAccount`/`hideAccount`/`deleteAccount` update local wizard state immediately and best-effort no-op the server call until real ids exist. Flagging this for Wren: it's not a bug, but worth confirming this matches the intended wizard-vs-server timing model before B3b wires the real POST.

## Out-of-scope findings

- None encountered that block B3a. B3b's Add Account modal, Steps 4-6, and the final POST/chaining are unaffected by this build.

## Commits

- `d32b3eb` feat(books): B3a — Categories Wizard Welcome + Steps 2-3 (Expenses/Income)
- `d37c180` feat(books): wire CategoriesWizard into BooksShell /books/categories/wizard route
- `d38b580` test(books): B3a QA harness (23 checks) + demo screenshot capture script
