# TASK — B3a: Categories Wizard — Welcome + Steps 2-3 (Expenses + Income)

**Status:** READY — spawn immediately after Cinder's B2b-2 build lands (no Wren/Echo/demo gate pause for Patrick between them; per Patrick's "queue B3 next" call 2026-07-14 13:58 MDT)
**Phase:** v2 Categories Wizard — first half (B3a = Welcome + Step 2 Expenses + Step 3 Income; B3b = Step 4 Asset/Liab/Equity + Step 5 Review Later + Step 6 Final review + Add Account modal)
**Author:** Rusty (per Patrick's "build everything in the wireframes" call 2026-07-13 10:39 MDT; queued-n-next per 2026-07-14 13:58 MDT)
**Date:** 2026-07-14 14:05 MDT (updated; original 2026-07-13 13:30 MDT)
**Branch:** `main`

---

## Why this is a separate build from B3b

B3a + B3b combined = 6 wizard steps + Add Account modal + edit-on-review pattern + final POST. Splitting at the Expense/Income vs Asset/Liab/Equity seam per §5.11. B3a is the "easy" half (uniform table layout, no subheaders). B3b is the harder half (subheaders, system account, final review).

---

## Pipeline context (as of 2026-07-14 14:05 MDT)

Wren B2b-1 review is in flight (`wren_b2b1_review` task). The chain is:
1. Wren → B2b-1 review (in flight)
2. Cinder → B2b-2 (Step 6 + edit-on-review + final POST + chaining)
3. **Cinder → B3a (this brief) — spawns immediately after B2b-2 commits, no pause.**
4. Wren → B3a review
5. Echo → B3a matrix
6. Cinder → B3b
7. … Wren → B3b review, Echo → B3b matrix, demo to Patrick → play-and-decide gate.

Patrick is reviewing only **after the full B2a→B3b chain lands**, per "I want to get through B2b before I review" (2026-07-14 13:58 MDT). Don't pause the chain to surface B2b or B3a demos to Patrick — keep momentum until B3b ships. Demo at end of B3b is the first surface in front of Patrick.

---

### 3. Step 2: Expense categories

Per §7 Step 2.

- Top button: "+ Add expense category" (single button, not "Add custom expense category"). Click → opens the generic Add Account modal pre-set to Type = Expense.
  - **The Add Account modal is B3b scope.** For B3a, when user clicks "+ Add expense category", open a placeholder modal that says "Add Account modal — coming in B3b." Don't build the modal itself.
- Table with columns: Name, Code, Tax line, Descriptor, (right-side actions: Hide, Delete).
- All pre-seeded expenses are included by default.
- Each column header clickable to sort. Default sort: Name, ascending.
- Active column shows ↑ or ↓; inactive columns show ↕ on hover.
- Header row sticky during vertical scroll.
- "Show account numbers" toggle (set in Step 1) cascades here — show Code column when on.
- Row-level Name editable inline by clicking.
- Row-level Tax line: badge-style display, click to open a popover with the IRS descriptor + ability to change. **Implement this popover inline in B3a.** The popover shows the current IRS line descriptor and a small picker to change it (call PATCH /accounts/:id with the new `irs_line` on save). Don't defer to B3b — it's part of the wizard step UX.
- Hide button: toggles `is_hidden` via PATCH. **Hide ≠ Delete** per Patrick's 2026-07-13 13:54 MDT call. Hide just removes the account from the active list (like archiving). Hidden accounts CAN still have transactions referencing them, and any report covering the period when those transactions were posted will still show the account + transactions even when hidden.
- Delete button: **only shown if `transactions_count === 0`** (no transactions reference this account). Per Patrick's call 2026-07-13 13:46 MDT:
  - In the wizard, every account is brand-new with no transactions yet (the wizard runs before any data is imported). Therefore the Delete button is always available during the wizard.
  - The "Merge and Delete" reassignment flow belongs to the **post-wizard** Categories Management screen (B4) — the wizard doesn't need it because no transactions exist yet.
  - If, hypothetically, an account somehow has transactions during the wizard (e.g., user imported a CSV before running the wizard — unlikely but possible), Delete should be disabled with a tooltip explaining "This account has transactions. Manage it from Categories after setup." This is a defensive edge case; don't build the reassignment UI here.
- Delete button: opens a small confirmation modal ("Delete this category? This can't be undone."). On confirm: calls DELETE endpoint. After successful delete, the wizard state is re-rendered to remove the row.
- Skip behavior: skip = all defaults included.
- **Empty state:** if somehow no expense accounts exist (the user deleted every default), show a "No expense categories. Click +Add to create your first." empty state with the +Add button. Per Patrick's call 2026-07-13 13:54 MDT, this is an edge case — even if the user deletes all defaults, account `9999 Review Later` is technically an Expense and cannot be deleted (system account), so the table will always have at least one row.

---

## Scope of THIS build (B3a)

### 1. New surface: Categories Wizard

- New route: `/books/categories/wizard` (or `/books/wizard/categories` — pick whichever matches the existing v2 sidebar/Dashboard conventions).
- New component: `client/src/books/CategoriesWizard.jsx`. Don't conflate with the post-wizard `Categories.jsx` CRUD surface.
- Wizard state in localStorage under `virta_books:wizard:categories:state`.
- Wire into BooksShell.jsx as a child route (the wizard is a flow, not a tab).

### 2. Step 1: Welcome explainer

Per `SETUP_AND_CATEGORIES.md` §7 Step 1.

- Headline: "Set up your categories."
- Body: "Categories are the buckets your money gets sorted into. We've pre-seeded them based on Schedule C — the tax form sole proprietors file. You can rename, remove, or add any of them."
- **Display preference** (lives on this screen, cascades through steps 2-4):
  ```
  Show 4-digit account numbers   ◯ on/off      (default: OFF)
  ```
  Helper: "Some accountants and business owners like to track their accounts with account numbers. We'll show codes like 6000 Advertising next to each category when this is on. You can change this anytime in Settings → Categories."
- Toggling this writes to `settings.show_account_numbers` immediately via `PUT /settings/show_account_numbers`.
- CTA: "Next →" → advances to Step 2.

### 3. Step 2: Expense categories

Per §7 Step 2.

- Top button: "+ Add expense category" (single button, not "Add custom expense category"). Click → opens the generic Add Account modal pre-set to Type = Expense.
  - **The Add Account modal is B3b scope.** For B3a, when user clicks "+ Add expense category", open a placeholder modal that says "Add Account modal — coming in B3b." Don't build the modal itself.
- Table with columns: Name, Code, Tax line, Descriptor, (right-side actions: Hide, Delete).
- All pre-seeded expenses are included by default.
- Each column header clickable to sort. Default sort: Name, ascending.
- Active column shows ↑ or ↓; inactive columns show ↕ on hover.
- Header row sticky during vertical scroll.
- "Show account numbers" toggle (set in Step 1) cascades here — show Code column when on.
- Row-level Name editable inline by clicking.
- Row-level Tax line: badge-style display, click to open a popover with IRS descriptor + ability to change (use existing stub for now; full popover is small, implement inline).
- Hide button: toggles `is_hidden` via PATCH.
- Delete button: **only shown if `transactions_count === 0`** (no transactions reference this account). Per Patrick's call 2026-07-13 13:46 MDT:
  - In the wizard, every account is brand-new with no transactions yet (the wizard runs before any data is imported). Therefore the Delete button is always available during the wizard.
  - The "Merge and Delete" reassignment flow belongs to the **post-wizard** Categories Management screen (B4) — the wizard doesn't need it because no transactions exist yet.
  - If, hypothetically, an account somehow has transactions during the wizard (e.g., user imported a CSV before running the wizard — unlikely but possible), Delete should be disabled with a tooltip explaining "This account has transactions. Manage it from Categories after setup." This is a defensive edge case; don't build the reassignment UI here.
- Delete button: opens a small confirmation modal ("Delete this category? This can't be undone."). On confirm: calls DELETE endpoint. After successful delete, the wizard state is re-rendered to remove the row.
- Skip behavior: skip = all defaults included.

### 4. Step 3: Income categories

Per §7 Step 3.

- Same layout as Step 2 (Hide/Delete on the right, sticky header, sortable columns). Account-numbers toggle from Step 1 cascades.
- Single "+ Add income category" button at top (same placeholder-modal pattern as Step 2).
- **Default ordering:** match the wireframe exactly. Per Patrick's call 2026-07-13 13:54 MDT — don't reinvent the ordering, just match what the wireframe shows. The brief's earlier "intentional non-alphabetical" guidance was based on the spec; confirm the wireframe itself uses Sales → Refunds → Other Income and follow that. (If the wireframe differs, the wireframe wins.)
- Skip behavior: same as Step 2.

### 5. Add-via-picker pattern (cross-cutting, applies to all 3 wizards)

Per Patrick's call 2026-07-13 13:54 MDT: in any dropdown that picks a category — even a non-expense-category dropdown — there must be an "+ Add new" option at the bottom. Clicking it opens the generic Add Account modal pre-set to the relevant type. On Save, the modal closes and the new account is auto-selected in the dropdown the user was working in.

This is the **same flow** for:
- Adding a new vendor (Phase 5 — B9)
- Adding a new customer (Phase 3 — B8)
- Adding a new category from anywhere

For B3a, this pattern needs to be in place wherever a category picker exists in the Categories Wizard. In B3a specifically: the Steps 2/3 +Add buttons are the entry points (not pickers per se, but they trigger the same modal). When B3b lands the Add Account modal, the modal's `onSave` should accept a callback that lets the caller pre-select the new account in their picker state. For B3a, build the modal placeholder with the right `onSave` signature even though the body is stubbed.

This pattern is a **carry-forward design contract** — when B8 (Customers) and B9 (Vendors) land, they reuse the same modal + onSave callback pattern.

### 5. Resume from mid-wizard cancel

Per Patrick's call 2026-07-13 13:54 MDT: **users must be able to resume the wizard if it's canceled midstream.** Per §5.3, wizard state lives in localStorage for 30 days.

- On mount of CategoriesWizard, check localStorage for `virta_books:wizard:categories:state`.
- If state exists AND `completedAt === null`, render a **"Resume setup" prompt** at the top of Step 1 (not blocking — user can ignore it and start over):
  - Headline: "You started categories setup on [date]. Pick up where you left off?"
  - Two buttons: "Resume →" (jumps to last `currentStep`) and "Start over" (clears localStorage, full reset).
- This is the same pattern the Setup Wizard ships in B2a-wizard-B (Resume / Start over prompt already implemented in `SetupWizard.jsx:188-205` per Wren B2a-wizard-B review). Mirror that prompt 1:1 in CategoriesWizard. **Read SetupWizard.jsx first** to mirror the implementation exactly — same storage key pattern but with `wizard:categories` namespace.

- **B2b-2 (Setup Wizard final POST) is the trigger to confirm that prompt design** — once Patrick plays with the Setup Wizard's actual resume flow, we may refine the Categories Wizard prompt. Keep B3a's implementation a 1:1 mirror of B2b-2's pattern.

### 6. Files to touch / create

- `client/src/books/CategoriesWizard.jsx` (new) — full Categories Wizard component.
- `client/src/books/CategoriesWizardStep1.jsx` (new) — Welcome explainer.
- `client/src/books/CategoriesWizardExpensesStep.jsx` (new) — Step 2.
- `client/src/books/CategoriesWizardIncomeStep.jsx` (new) — Step 3.
- `client/src/books/CategoriesWizardProgress.jsx` (new) — progress dots shared across all 6 steps.
- `client/src/books/BooksShell.jsx` — add the wizard route.
- `client/src/books/api.js` — add `updateSetting`, `patchAccount`, `deleteAccount` (already exist server-side; confirm client methods).

### 6. Don't break

- B2a/B2b Setup Wizard must keep working.
- B1a Transactions polish must keep working.
- B1a Categories.jsx CRUD (which is the POST-WIZARD surface) must keep working — different component, different route.
- Wireframe smoke (255/255).
- Existing REST endpoints.

---

## Build behaviors (Test coverage)

| Behavior ID | Name | Verifies |
|---|---|---|
| VB-CATWIZ-ROUTE-01 | `/books/categories/wizard` route renders CategoriesWizard | ✓ |
| VB-CATWIZ-PERSIST-01 | Wizard state persists to localStorage on every change | ✓ |
| VB-CATWIZ-PERSIST-02 | Wizard state hydrates from localStorage on mount | ✓ |
| VB-CATWIZ-STEP1-01 | Step 1 renders Welcome explainer + Show account numbers toggle | ✓ |
| VB-CATWIZ-STEP1-02 | Toggle writes to settings.show_account_numbers via PUT | ✓ |
| VB-CATWIZ-STEP1-03 | Toggle default = OFF (per Patrick's 2026-07-08 10:45 MDT feedback) | ✓ |
| VB-CATWIZ-STEP2-01 | Step 2 renders expense table with sticky header | ✓ |
| VB-CATWIZ-STEP2-02 | Step 2 default sort = Name ascending | ✓ |
| VB-CATWIZ-STEP2-03 | Step 2 each column header clickable to sort | ✓ |
| VB-CATWIZ-STEP2-04 | Step 2 Code column shows/hides based on Step 1 toggle | ✓ |
| VB-CATWIZ-STEP2-05 | Step 2 Hide button toggles is_hidden via PATCH | ✓ |
| VB-CATWIZ-STEP2-06 | Step 2 Delete button opens confirmation modal | ✓ |
| VB-CATWIZ-STEP2-07 | Step 2 confirmed delete calls DELETE endpoint | ✓ |
| VB-CATWIZ-STEP2-10 | Step 2 Delete button disabled with tooltip if account has transactions (defensive edge case) | ✓ |
| VB-CATWIZ-STEP2-08 | Step 2 Skip = all defaults included | ✓ |
| VB-CATWIZ-STEP2-09 | Step 2 +Add button opens placeholder modal (B3b will replace) | ✓ |
| VB-CATWIZ-STEP3-01 | Step 3 renders income table with sticky header | ✓ |
| VB-CATWIZ-STEP3-02 | Step 3 default order = Sales, Refunds, Other Income (NOT alphabetical) | ✓ |
| VB-CATWIZ-STEP3-03 | Step 3 has same Hide/Delete/sortable columns as Step 2 | ✓ |
| VB-CATWIZ-STEP3-04 | Step 3 +Add button opens placeholder modal | ✓ |
| VB-CATWIZ-SHELL-01 | BooksShell routes /books/categories/wizard correctly | ✓ |

Add these IDs to **Test coverage** in `CINDER_REPORT_b3a.md`.

---

## Definition of done

- [ ] Read B2a + B2b reports first — pay attention to the per-step `isDirty()` + `revertSetupToDefaults()` + `validateEinFormat`-style helpers exported from `SetupWizard.jsx`. B3a's analogous helpers (per-row `isDirty`, debounced localStorage hydration) should mirror B2b's pattern, not invent new ones.
- [ ] CategoriesWizard.jsx renders all 3 steps (Welcome + Expenses + Income).
- [ ] Toggle on Step 1 writes to settings and cascades to Steps 2 + 3.
- [ ] Step 2 + 3 tables work: sortable, hide/delete, sticky header.
- [ ] Default order for income list correct.
- [ ] All 20 behavior IDs in Test coverage.
- [ ] Wireframe smoke still **255/255** (per `node docs/books/setup-wizard/tests/wf-smoke.mjs`).
- [ ] **No demo video for B3a** — per B2b-1 precedent (deferred demos during this push), capture screen captures only: `demos/2026.07.14-b3a-categories-wizard/*.png` covering Welcome, Step 2 (empty + filled + sorted), Step 3 (empty + filled + sorted).
- [ ] Committed in logical chunks.
- [ ] Wren can review; Echo can run matrix.

## When done

Push a completion event with:
- 2-3 line summary
- Commit hash(es)
- Demo path
- Anything to flag for Wren
- Any judgement calls
- Any out-of-scope findings

## Hard rules

- `trash` > `rm`.
- No edits to Setup Wizard, Transactions, or post-wizard Categories.jsx.
- No edits to wireframe HTML, spec, smoke test.
- No pushing to origin.
- No sub-agent spawns.
- Visual check in dark mode.

## Why this is a focused build

~400 lines of new code: one new component family + 3 step components + progress dots + BooksShell route edit. The Add Account modal is the big lift and that's B3b.

---

## Note for B4 (post-wizard Categories Management)

Per Patrick's call 2026-07-13 13:46 MDT, the full Delete-with-reassignment flow ("Merge and Delete") belongs in **B4** (Categories Management post-wizard CRUD), not in the wizard. When B4 lands:

- Delete button on an account with transactions: opens a modal with two options — "Move all transactions to another account" OR "Merge with another existing account" (which combines balances + reassigns).
- Delete button on an account with no transactions: simple confirmation modal, calls DELETE.
- This is the spec §8.3 / §8.4 flow. The B3a wizard is intentionally simple because at wizard time, no transactions exist.

If you finish well under 2 min, **stop and report done**. Don't start B3b scope.
