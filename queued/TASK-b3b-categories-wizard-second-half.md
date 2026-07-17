# TASK — B3b: Categories Wizard — Steps 4-6 + Add Account Modal + Final POST

**Status:** READY — spawn immediately after Cinder's B3a build lands (per Patrick's "queue B3 next" call 2026-07-14 13:58 MDT)
**Phase:** v2 Categories Wizard — second half (B3a = Welcome + Steps 2-3; B3b = this)
**Author:** Rusty (per Patrick's "build everything in the wireframes" call 2026-07-13 10:39 MDT; queued-n-next per 2026-07-14 13:58 MDT)
**Date:** 2026-07-14 14:10 MDT
**Branch:** `main`

---

## Why B3b is a separate build

B3b has three distinct pieces that each merit careful work:

1. **Step 4 (Asset / Liability / Equity)** — the only step with **subheaders** (3 in-categories tables). Pattern diverges from Steps 2/3 (B3a).
2. **Step 5 (Review Later)** — single system account auto-creation (number 6999, name "Review Later", user can't rename/delete/merge per spec §7 Step 5 + §10A.5).
3. **Step 6 (Final review)** — three collapsible sections (Income / Expenses / Other) + **final POST** that bulk-writes `accounts` rows. Plus the **Add Account modal** (the placeholder from B3a becomes real here).

Per §5.11 cadence rule — short cycles prevent drift. B3b is ~500 lines of new code.

---

## Pipeline context (2026-07-14 14:10 MDT)

After B3a lands:
1. Wren → B3a review
2. Echo → B3a matrix
3. **Cinder → B3b (this brief) — spawns after Echo's matrix returns.**
4. Wren → B3b review
5. Echo → B3b matrix
6. **Demo to Patrick → play-and-decide gate.** This is the first time Patrick sees the wizard work since B1 round 1.

Don't pause to surface B3a demos — keep chain moving.

---

## Scope of THIS build (B3b)

### 1. Step 4 — Asset / Liability / Equity (with subheaders)

Per `SETUP_AND_CATEGORIES.md` §7 Step 4 + spec §10 (default seeded categories).

- Single "Add account" button at the top of the whole step (not per subheader). Click → generic Add Account modal (§8.2) with **Type picker pre-focused**.
- Three subheaders, each with its own table:
  - **Cash & bank accounts** (3 defaults): Business Checking (1010), Business Savings (1020), Cash on Hand (1100). All Asset.
  - **Credit & loans** (2 defaults): Business Credit Card (2000), Loans Payable (2100). All Liability.
  - **Equity** (3 defaults): Owner Contributions (3000), Owner Draws (3010), Owner's Equity (3020).
- Same row affordances as Steps 2/3: Hide, Delete, sortable columns, sticky header, Code column cascades from Step 1's toggle.
- Skip behavior: skip = all defaults included.

### 2. Step 5 — Review Later

Per `SETUP_AND_CATEGORIES.md` §7 Step 5.

- Auto-creates a single expense account (NOT user-actionable except to read):
  - Number: **6999**
  - Name: **"Review Later"** (system category; user cannot rename/delete/merge)
  - Type: **Expense**
  - Schedule C line: **none** (the only account with no `irs_line` mapping)
  - Sidebar badge will show pending count once transactions exist
- Render a brief explainer panel: "Anything the auto-categorizer isn't sure about goes here. You can move items to the right category any time."
- CTA: "Next →" → advances to Step 6.
- **Implementation note:** the spec §10A.6 type immutability rule is enforced at the DB level via CHECK constraints. The wizard doesn't need to do extra work — when Step 5's POST writes the row, the existing schema rules handle it. The `accounts` CHECK on `irs_line IS NOT NULL OR name = 'Review Later'` already accommodates this (per CINDER_REPORT_b2a-prime-fixups.md from B2a-prime).
- **Skip button:** Step 5 is NOT skippable per spec §5.2 table — the system account always exists. Only "Next →" is shown (no Skip).

### 3. Step 6 — Final review + final POST

Per `SETUP_AND_CATEGORIES.md` §7 Step 6.

- Three collapsible sections, default-expanded:
  - **Income** (Sales, Refunds & Returns, Other Income) — show count + names.
  - **Expenses** (23 defaults — alphabetical, with Review Later pinned at top, BUT in the final review display, Review Later is shown in its own section per spec).
  - **Other** (Cash & bank / Credit & loans / Equity, grouped).
- Each row has a **pencil icon** for edit (clicks expand the row inline; field editors render in place with Save + Cancel — same pattern as the Setup Wizard Step 6 from B2b-2). **Wait** — Step 6 in this wizard does not call itself "Edit" per the spec; the spec just says "summary counts and names." Treat inline editing of name/tax-line as out of scope here per the spec, but show **"← Edit this category" link per row** that navigates back to the relevant Step (2, 3, or 4). Don't build edit-in-place for Categories Wizard — defer to B4 (post-wizard Categories Management CRUD).
- **Two CTAs at bottom:**
  - "Back" → returns to Step 5
  - "Finish setup →" → fires the final POST

### 4. Final POST: `POST /api/v1/books/accounts/bulk`

- Body: full `accounts` payload from wizard state — every row that wasn't Hidden or Deleted across Steps 2-5. Plus `setting = { show_account_numbers: <bool> }` if changed in Step 1.
- Behavior:
  - Creates all `accounts` rows in a single transaction.
  - Sets a wizard-completed marker on the user/business (analog to `setupCompletedAt` for Setup Wizard — call it `categoriesCompletedAt` or use a single `onboardingCompletedAt` field; check `businesses` schema).
- On success:
  - Clear `virta_books:wizard:categories:state` from localStorage.
  - Mark wizard complete in store.
  - `useSetupGate` in `BooksShell.jsx` needs to re-fetch the gate state so the sidebar Categories link becomes active. (Same TODO as the Setup Wizard's `useSetupGate` re-fetch from Wren B2a-wizard-B NIT F7 — that fix lands in B2b-2. **B3b MUST include the equivalent re-fetch for the Categories Wizard completion.**)
  - Navigate to `/books` Dashboard (show "Setup + Categories complete" celebratory card? Or just the regular Dashboard. Spec doesn't say; default to regular Dashboard.)
- On error: show inline error, stay on Step 6. Don't clear state.

### 5. Add Account modal (the BIG piece of B3b)

Per spec §8.2 — used by Categories Management (B4) and any other place that adds a category. **B3a ships a placeholder; B3b replaces it with the real modal.**

Fields (per spec §8.2 + CW-016/CW-017):

| Field | Type | Notes |
|---|---|---|
| **Type** | dropdown | Options: Expense, Income, Asset, Liability, Equity. Changes which Schedule C lines show. |
| **Name** | text | Required. |
| **Code** | number | 4-digit (or system-assigned if blank — auto-increment next available for the type). |
| **Tax Line Item** (Schedule C of IRS Form 1040) | picker | Required for Expense/Income; hidden for Asset/Liability/Equity per CW-017. |
| **Note** | text | Optional, free-form per CW-018. |

- Modal footer: "Cancel" + "Save".
- **Save** behavior:
  - POSTs the new account via the existing `createAccount` endpoint (or, if simpler for B3b's bulk write, accepts an `onSave(account)` callback so the parent wizard can pick up the new row into its state without an extra server round-trip).
  - **B3a wiring:** the "+ Add expense category" / "+ Add income category" buttons in Steps 2/3 are placeholder-modal now. In B3b, replace the placeholder with the real modal. The wizard's existing `onSave` callback contract (B3a ships a stub with the right signature) just needs the real backend call.

### 6. Files to touch / create

- `client/src/books/CategoriesWizard.jsx` — extend with Steps 4-6 + add real Add Account modal. (Currently ~Step 1-3 dispatcher from B3a.)
- `client/src/books/CategoriesWizardOtherAccountsStep.jsx` (new) — Step 4 with subheaders.
- `client/src/books/CategoriesWizardReviewLaterStep.jsx` (new) — Step 5.
- `client/src/books/CategoriesWizardFinalReviewStep.jsx` (new) — Step 6 with collapsed sections.
- `client/src/books/AddAccountModal.jsx` (new) — the real generic modal (replaces B3a's placeholder).
- `client/src/books/api.js` — add `createAccountsBulk`, `createAccount`, confirm `updateSetting`, `patchAccount`, `deleteAccount` exist.
- `client/src/books/BooksShell.jsx` — wire `useSetupGate` re-fetch on Categories Wizard completion (parallel to Setup Wizard's B2b-2 fix).
- `server/api/v1/books/accounts/bulk.post.js` (or whatever the accounts router is named) — bulk POST endpoint. **Pre-check the accounts router for an existing bulk endpoint** before creating one. Some backward-compat endpoint may exist from B1a Categories CRUD.
- `client/src/books/SetupWizard.jsx` and components — DO NOT TOUCH.

### 7. Don't break

- B2a + B2b Setup Wizard must keep working.
- B1a Categories CRUD (`Categories.jsx`, post-wizard surface) must keep working — different component, different route.
- B3a wizard Steps 1-3 (this brief builds on top, doesn't replace).
- Wireframe smoke (255/255).
- Existing REST endpoints (especially the bulk endpoint — prefer add new than break existing).

### 8. Resume-from-mid-wizard pattern

Already implemented in B3a at Step 1. B3b doesn't need to add anything — the Resume/Start over prompt handles jumping back to whatever step the user was on (Step 4 / 5 / 6 included).

---

## Build behaviors (Test coverage)

| Behavior ID | Name | Verifies |
|---|---|---|
| VB-CATWIZ-STEP4-01 | Step 4 renders 3 subheaders: Cash & bank / Credit & loans / Equity | ✓ |
| VB-CATWIZ-STEP4-02 | Each subheader has its own table | ✓ |
| VB-CATWIZ-STEP4-03 | Single "+ Add account" button at top, opens modal with Type picker pre-focused | ✓ |
| VB-CATWIZ-STEP4-04 | Step 4 default accounts pre-included (3 + 2 + 3 = 8) | ✓ |
| VB-CATWIZ-STEP4-05 | Same Hide/Delete + sticky header + sortable columns as Steps 2/3 | ✓ |
| VB-CATWIZ-STEP4-06 | Step 4 Skip = all defaults included | ✓ |
| VB-CATWIZ-STEP5-01 | Step 5 renders Review Later explainer + Next CTA | ✓ |
| VB-CATWIZ-STEP5-02 | Step 5 has NO Skip button (system account mandatory) | ✓ |
| VB-CATWIZ-STEP6-01 | Step 6 renders 3 collapsible sections: Income / Expenses / Other | ✓ |
| VB-CATWIZ-STEP6-02 | Each section shows count + names | ✓ |
| VB-CATWIZ-STEP6-03 | "Edit" link per row navigates back to the relevant Step | ✓ |
| VB-CATWIZ-STEP6-04 | "Back" returns to Step 5 | ✓ |
| VB-CATWIZ-STEP6-05 | "Finish setup →" POSTs all accounts | ✓ |
| VB-CATWIZ-STEP6-06 | Successful POST clears wizard state + sets completedAt | ✓ |
| VB-CATWIZ-STEP6-07 | POST error stays on Step 6 with inline error | ✓ |
| VB-CATWIZ-MODAL-01 | Add Account modal renders Type + Name + Code + Tax Line Item + Note | ✓ |
| VB-CATWIZ-MODAL-02 | Type picker changes which Schedule C lines show | ✓ |
| VB-CATWIZ-MODAL-03 | Tax Line Item is hidden for Asset/Liability/Equity | ✓ |
| VB-CATWIZ-MODAL-04 | Save creates the account (POST) | ✓ |
| VB-CATWIZ-MODAL-05 | Cancel closes without saving | ✓ |
| VB-CATWIZ-MODAL-06 | Modal Save callback inserts new row into the relevant wizard table | ✓ |
| VB-CATWIZ-SHELL-02 | useSetupGate re-fetches on Categories Wizard completion (parallels B2b-2) | ✓ |

Add to **Test coverage** in `CINDER_REPORT_b3b.md`.

---

## Definition of done

- [ ] Read B3a report first.
- [ ] Step 4 renders 3 subheaders with separate tables.
- [ ] Step 5 renders Review Later explainer (no Skip).
- [ ] Step 6 renders 3 collapsible sections with counts + per-row Edit links.
- [ ] Add Account modal is real (replaces B3a placeholder).
- [ ] Final POST bulk-writes all accounts.
- [ ] useSetupGate re-fetches on completion.
- [ ] All 22 behavior IDs verified.
- [ ] Wireframe smoke still **255/255**.
- [ ] Demo recorded (this IS the surface Patrick sees first — silent 8-12 min walkthrough: full wizard setup + categories flow).
- [ ] Committed in logical chunks.
- [ ] Wren can review; Echo can run matrix.
- [ ] Light + dark mode visual check.

## When done

This is the first surface Patrick sees since B1. Make it good:
- 2-3 line summary
- Commit hash(es)
- Demo path
- Anything to flag for Wren
- Any judgement calls
- Any out-of-scope findings (e.g., the Step 6 "edit-in-place" vs "edit-link" decision — confirm I went with edit-link per the spec)

## Hard rules

- `trash` > `rm`.
- No edits to Setup Wizard (B2a/B2b).
- No edits to B1a Transactions or B1a post-wizard Categories CRUD.
- No edits to wireframe HTML, spec, smoke test.
- No pushing to origin.
- No sub-agent spawns.
- Visual check in dark mode before declaring done.

---

## Why this is a focused build

~500-700 lines: 3 new step components + 1 real modal (replacing a stub) + 1 new wizard step + a backend bulk endpoint (or extension of existing). The Add Account modal is ~200 lines alone (Type picker cascading, Schedule C line picker reuse, validation, error states). The bulk POST endpoint + success path is another ~100 lines including the BooksShell re-fetch.
