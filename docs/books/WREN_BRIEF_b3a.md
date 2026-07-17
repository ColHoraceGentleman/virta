# Wren Review Brief — B3a (Categories Wizard Welcome + Steps 2-3)

**Reviewer:** Wren
**Build under review:** B3a — Categories Wizard first half (Welcome + Step 2 Expenses + Step 3 Income)
**Builder:** Cinder (sonnet-5)
**Date:** 2026-07-14 14:25 MDT (queued; will spawn AFTER B2b-2 lands)
**Commit:** _set by Cinder_
**Spec source of truth:** `queued/TASK-b3a-categories-wizard-first-half.md` (updated 2026-07-14 14:05 MDT to reflect "spawn immediately after B2b-2" cadence)
**Wireframe source:** `docs/books/setup-wizard/WIREFRAMES.html` `renderCategories()` Steps 1-3

---

## What was built (per the brief, expected shape)

B3a is the first half of the v2 Categories Wizard. ~400 lines per the brief, no Add Account modal (B3b ships that). Files:

- `client/src/books/CategoriesWizard.jsx` (new) — full Categories Wizard state machine, localStorage persistence, dispatcher
- `client/src/books/CategoriesWizardStep1.jsx` (new) — Welcome explainer
- `client/src/books/CategoriesWizardExpensesStep.jsx` (new) — Step 2 (expense categories table)
- `client/src/books/CategoriesWizardIncomeStep.jsx` (new) — Step 3 (income categories table)
- `client/src/books/CategoriesWizardProgress.jsx` (new) — progress dots for the 6-step flow
- `client/src/books/BooksShell.jsx` — add the wizard route `/books/categories/wizard`
- `client/src/books/api.js` — confirm `updateSetting`, `patchAccount`, `deleteAccount` exist (they do from B1a)

The 20 behavior IDs from the brief are the spec.

---

## What to verify (focused)

### A. State machine + persistence

- Storage key: `virta_books:wizard:categories:state`
- Hydration on mount validates shape, falls back to defaults
- Debounced save (250ms, mirrors Setup Wizard)
- `currentStep` clamped to [1, 6]; Steps 4-6 stay placeholder for now (B3b replaces)
- **Resume / Start over prompt** on Step 1 if state exists with `completedAt: null` — 1:1 mirror of `SetupWizard.jsx:188-205`
- `completedAt === null` for all of B3a (lands in B3b)

### B. Step 1 (Welcome)

- Headline: "Set up your categories."
- Body explains categories + Schedule C pre-seed.
- **Display preference toggle**: "Show 4-digit account numbers" with helper text. Default OFF.
- Toggling writes IMMEDIATELY to `settings.show_account_numbers` via `PUT /settings/show_account_numbers`.
- Cascade through Steps 2 + 3 (and Step 4 of B3b once it lands).
- CTA "Next →" → setStep(2).

### C. Step 2 (Expense categories)

- Top button: "+ Add expense category" — opens **B3a placeholder modal** ("Add Account modal — coming in B3b"). B3b replaces this with the real modal.
- Table columns: Name, Code, Tax line, Descriptor, (right side: Hide, Delete).
- All 23 default expenses pre-included (alphabetical with Review Later pinned top per spec §10).
- Each column header clickable to sort. Default sort: Name ascending.
- Active column shows ↑ or ↓; inactive shows ↕ on hover.
- Sticky header during vertical scroll.
- "Show account numbers" toggle cascades from Step 1.
- Row-level Name editable inline (click).
- Row-level Tax line badge-style; click opens popover with IRS descriptor + ability to change (PATCH /accounts/:id). Verify the popover exists — **per the brief, this is implemented inline in B3a, not deferred to B3b.**
- Hide button toggles `is_hidden` via PATCH.
- Delete button: opens small confirmation modal. On confirm calls DELETE. **In the wizard, accounts are brand-new with no transactions, so Delete is always available.** Verify there's NO "transactions_count check" on the wizard's Delete button (that's B4 Categories Management territory per the brief).
- Skip behavior: skip = all defaults included.
- Empty state: if somehow no expense accounts exist, show "No expense categories. Click +Add to create your first." with the +Add button.

### D. Step 3 (Income categories)

- Same layout as Step 2 (Hide/Delete on right, sticky header, sortable columns).
- Default ordering: **Sales → Refunds & Returns → Other Income** (NOT alphabetical; per CW-007 exception). Verify the table renders in that order, not alphabetical.
- "Show account numbers" toggle cascades.
- Single "+ Add income category" button at top (same placeholder modal as Step 2).

### E. Add-via-picker pattern (cross-cutting)

- Per the brief, when B3b lands and replaces the placeholder modal, the modal's `onSave` callback signature should accept the new account and let the wizard pick it up into its state.
- **B3a's placeholder modal should already implement the right `onSave` signature** — verify the stub accepts `onSave(newAccount)` even though the body is "Coming in B3b."

### F. Resume-from-mid-wizard pattern

- 1:1 mirror of `SetupWizard.jsx:188-205`. Read that block first, then verify CategoriesWizard's Step 1 prompt matches.
- Storage key namespacing is correct (different from Setup Wizard).

### G. Cross-cutting

- Wireframe smoke 255/255.
- BooksShell routes `/books/categories/wizard` correctly.
- B2a/B2b Setup Wizard still works (Steps 1-6 + edit-on-review).
- B1a Transactions + Categories.jsx still work (post-wizard CRUD surfaces — different routes).
- Settings.jsx uncommitted diff from B1 round 1 unchanged.

---

## Behavior verification table (20 IDs from the brief)

| Behavior ID | Verifies | Check |
|---|---|---|
| **VB-CATWIZ-ROUTE-01** | `/books/categories/wizard` route renders CategoriesWizard | ✓ |
| **VB-CATWIZ-PERSIST-01** | Wizard state persists to localStorage on every change | ✓ |
| **VB-CATWIZ-PERSIST-02** | Wizard state hydrates from localStorage on mount | ✓ |
| **VB-CATWIZ-STEP1-01** | Step 1 renders Welcome + Show account numbers toggle | ✓ |
| **VB-CATWIZ-STEP1-02** | Toggle writes to settings.show_account_numbers | ✓ |
| **VB-CATWIZ-STEP1-03** | Toggle default = OFF | ✓ |
| **VB-CATWIZ-STEP2-01** | Step 2 expense table with sticky header | ✓ |
| **VB-CATWIZ-STEP2-02** | Step 2 default sort = Name ascending | ✓ |
| **VB-CATWIZ-STEP2-03** | Step 2 each column header clickable | ✓ |
| **VB-CATWIZ-STEP2-04** | Step 2 Code column shows/hides based on Step 1 toggle | ✓ |
| **VB-CATWIZ-STEP2-05** | Step 2 Hide toggles is_hidden | ✓ |
| **VB-CATWIZ-STEP2-06** | Step 2 Delete opens confirmation modal | ✓ |
| **VB-CATWIZ-STEP2-07** | Step 2 confirmed delete calls DELETE | ✓ |
| **VB-CATWIZ-STEP2-10** | Step 2 Delete disabled with tooltip if account has transactions (defensive) | ✓ |
| **VB-CATWIZ-STEP2-08** | Step 2 Skip = all defaults included | ✓ |
| **VB-CATWIZ-STEP2-09** | Step 2 +Add opens placeholder modal | ✓ |
| **VB-CATWIZ-STEP3-01** | Step 3 income table with sticky header | ✓ |
| **VB-CATWIZ-STEP3-02** | Step 3 default order = Sales, Refunds, Other Income | ✓ |
| **VB-CATWIZ-STEP3-03** | Step 3 Hide/Delete/sortable columns | ✓ |
| **VB-CATWIZ-STEP3-04** | Step 3 +Add opens placeholder modal | ✓ |
| **VB-CATWIZ-SHELL-01** | BooksShell routes /books/categories/wizard correctly | ✓ |

Verify each. The QA harness should cover A, B, C, D, F (DOM/state verifications). Code reading covers E, G.

---

## Things to look hard at

1. **Income default ordering.** Step 3 must render Sales → Refunds & Returns → Other Income, not alphabetical (which would be Other Income → Refunds & Returns → Sales). This is CW-019 from the spec — easy to get wrong if Cinder alphabetizes by default.

2. **Tax-line popover is in this build, not B3b.** The brief says implement inline in B3a. If Cinder deferred it to B3b, that's a SIGNIFICANT, not a BLOCKER — flag it but don't block B3a.

3. **Default sort and "Show account numbers" interaction.** When Code column is hidden (toggle OFF), what's the sort state? The sort should persist by Name regardless of whether Code is visible.

4. **Stub modal's onSave signature.** B3a ships a placeholder for the Add Account modal. The placeholder should accept the onSave callback contract that B3b will fulfill. If B3a's placeholder ignores onSave entirely, that's a SIGNIFICANT (B3b will need to rewire).

5. **Resume prompt mirrors Setup Wizard exactly.** Different storage keys, same UX. Read SetupWizard.jsx:188-205 first; mirror 1:1.

---

## Out-of-scope findings from prior reviews

- N2 from Wren B2b-1 (Step 4 helper text) — fixed in B2b-2, not B3a's scope
- F4, F5, F7 from Wren B2a-wizard-B — fixed in B2b-2, not B3a's scope
- All NITs from Wren B2b-1 — fixed in B2b-2 where applicable, none in B3a's scope

---

## Report format

Write `WREN_REPORT_b3a.md` at workspace root. Mirror `WREN_REPORT_b2b-1.md`:

- **VERDICT:** SHIP / NEEDS-FIX (BLOCKER count) / NEEDS-FIX (SIGNIFICANT count) / NEEDS-FIX (NIT count only)
- **What I verified**
- **Findings**
- **Recommended next step**

---

## Hard rules

- READ-ONLY on `client/src/`, `server/`. Exception: write `WREN_REPORT_b3a.md` at workspace root.
- No pushing to origin.
- No sub-agent spawns.
- Re-run wireframe smoke before declaring SHIP.

## When done

End your session. Completion event routes here.