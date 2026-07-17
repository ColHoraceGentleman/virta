# Wren Review Brief — B3b (Categories Wizard Steps 4-6 + Add Account Modal + final bulk POST)

**Reviewer:** Wren
**Build under review:** B3b — Categories Wizard second half (Step 4 Asset/Liab/Equity with subheaders + Step 5 Review Later system account + Step 6 Final review + Add Account modal + final bulk POST + useSetupGate re-fetch on completion)
**Builder:** Cinder (sonnet-5)
**Date:** 2026-07-14 14:35 MDT (queued; spawns AFTER B3a lands)
**Commit:** _set by Cinder_
**Spec source of truth:** `queued/TASK-b3b-categories-wizard-second-half.md`
**Wireframe source:** `docs/books/setup-wizard/WIREFRAMES.html` `renderCategories()` Steps 4-6
**Report to read:** `CINDER_REPORT_b3b.md` (workspace root)

---

## What was built (expected shape per the brief)

~600-700 lines. 5 new components + 1 modified + 1 backend endpoint (new or extended):

- `client/src/books/CategoriesWizard.jsx` — extend dispatcher with Steps 4-6 + add real Add Account modal
- `client/src/books/CategoriesWizardOtherAccountsStep.jsx` (new) — Step 4 with subheaders
- `client/src/books/CategoriesWizardReviewLaterStep.jsx` (new) — Step 5 (system account)
- `client/src/books/CategoriesWizardFinalReviewStep.jsx` (new) — Step 6 collapsed sections
- `client/src/books/AddAccountModal.jsx` (new) — REAL generic modal (replaces B3a's placeholder)
- `client/src/books/api.js` — add `createAccountsBulk`, `createAccount`
- `client/src/books/BooksShell.jsx` — `useSetupGate` re-fetch on Categories Wizard completion
- `server/api/v1/books/accounts/bulk.post.js` (or extension of existing) — bulk POST endpoint

22 behavior IDs from the brief are the spec.

---

## What to verify (focused)

### A. Step 4 — Asset / Liability / Equity (with subheaders) — the unique piece

Per `SETUP_AND_CATEGORIES.md` §7 Step 4 + §10 (defaults):
- **Single "Add account" button** at the top of the whole step (NOT per subheader).
- 3 subheaders, each with its own table:
  - **Cash & bank accounts** (3 defaults): Business Checking (1010), Business Savings (1020), Cash on Hand (1100). All Asset.
  - **Credit & loans** (2 defaults): Business Credit Card (2000), Loans Payable (2100). All Liability.
  - **Equity** (3 defaults): Owner Contributions (3000), Owner Draws (3010), Owner's Equity (3020).
- Same row affordances as Steps 2/3: Hide, Delete, sortable columns, sticky header, Code cascades from Step 1's toggle.
- Skip = all defaults included.

### B. Step 5 — Review Later system account

- Renders explainer: "Anything the auto-categorizer isn't sure about goes here. You can move items to the right category any time."
- Auto-creates a single expense account with:
  - Number: 6999
  - Name: "Review Later" (system; user cannot rename/delete/merge)
  - Type: Expense
  - Schedule C line: none
- **NO Skip button** (system account mandatory). Only "Next →" CTA.
- Verify the schema accommodates this — the existing `accounts` CHECK constraint `irs_line IS NOT NULL OR name = 'Review Later'` (from B2a-prime) should pass without changes. Confirm Cinder didn't add new DB constraints.

### C. Step 6 — Final review

- Three collapsible sections:
  - **Income** (Sales, Refunds & Returns, Other Income)
  - **Expenses** (23 defaults; alphabetical with Review Later pinned)
  - **Other** (Cash & bank / Credit & loans / Equity, grouped)
- Each section shows count + names.
- Each row has a "← Edit this category" link that navigates back to the relevant Step (2, 3, or 4). NOT inline edit (deferred to B4 Categories Management per the brief).
- Two CTAs: "Back" (→ Step 5) + "Finish setup →" (fires final POST).

### D. Final POST: `POST /api/v1/books/accounts/bulk`

- Body: every row that wasn't Hidden or Deleted across Steps 2-5, plus `setting = { show_account_numbers: <bool> }` if changed in Step 1.
- Behavior:
  - Creates all `accounts` rows in one transaction.
  - Sets a wizard-completion marker (analog to `setupCompletedAt` for Setup Wizard — likely `categoriesCompletedAt` OR a unified `onboardingCompletedAt` field; check `businesses` schema for what's there).
- On success:
  - localStorage cleared.
  - `useSetupGate` re-fetches (the BooksShell fix).
  - Navigate to `/books` Dashboard.

### E. Add Account modal (the big new piece)

Per spec §8.2 + CW-016/017:

Fields: Type (dropdown), Name (required), Code (4-digit), Tax Line Item (Schedule C picker), Note (optional).

- Type picker changes which Schedule C lines show:
  - Expense → Part II lines
  - Income → Part I lines
  - Asset/Liability/Equity → none/hidden
- Modal footer: Cancel + Save.
- **Save** POSTs the new account + `onSave(account)` callback to let the parent wizard pick it up into its state without an extra round-trip.
- Replace B3a's placeholder modal body.

### F. Cross-cutting

- Wireframe smoke 255/255.
- Setup Wizard (Steps 1-6 + edit-on-review) still works.
- B1a Categories.jsx (post-wizard CRUD) still works — different route, unchanged.
- B3a wizard Steps 1-3 work.
- BooksShell re-fetch fires after Categories Wizard completion (parallels B2b-2's useSetupGate fix).
- Resume / Start over prompt still works on the Categories Wizard.

---

## Behavior verification table (22 IDs from the brief)

| Behavior ID | Verifies | Check |
|---|---|---|
| **VB-CATWIZ-STEP4-01** | Step 4 renders 3 subheaders | ✓ |
| **VB-CATWIZ-STEP4-02** | Each subheader has its own table | ✓ |
| **VB-CATWIZ-STEP4-03** | Single "+ Add account" button at top, opens modal with Type picker | ✓ |
| **VB-CATWIZ-STEP4-04** | Step 4 default accounts (3 + 2 + 3 = 8) pre-included | ✓ |
| **VB-CATWIZ-STEP4-05** | Same Hide/Delete/sticky/sortable as Steps 2/3 | ✓ |
| **VB-CATWIZ-STEP4-06** | Step 4 Skip = all defaults | ✓ |
| **VB-CATWIZ-STEP5-01** | Step 5 renders Review Later explainer + Next CTA | ✓ |
| **VB-CATWIZ-STEP5-02** | Step 5 has NO Skip button | ✓ |
| **VB-CATWIZ-STEP6-01** | Step 6 renders 3 collapsible sections | ✓ |
| **VB-CATWIZ-STEP6-02** | Each section shows count + names | ✓ |
| **VB-CATWIZ-STEP6-03** | "Edit" link per row navigates back to relevant Step | ✓ |
| **VB-CATWIZ-STEP6-04** | "Back" returns to Step 5 | ✓ |
| **VB-CATWIZ-STEP6-05** | "Finish setup →" POSTs all accounts | ✓ |
| **VB-CATWIZ-STEP6-06** | Successful POST clears wizard state + sets completedAt | ✓ |
| **VB-CATWIZ-STEP6-07** | POST error stays on Step 6 with inline error | ✓ |
| **VB-CATWIZ-MODAL-01** | Modal renders Type + Name + Code + Tax Line Item + Note | ✓ |
| **VB-CATWIZ-MODAL-02** | Type picker changes Schedule C lines shown | ✓ |
| **VB-CATWIZ-MODAL-03** | Tax Line Item hidden for Asset/Liability/Equity | ✓ |
| **VB-CATWIZ-MODAL-04** | Save creates the account (POST) | ✓ |
| **VB-CATWIZ-MODAL-05** | Cancel closes without saving | ✓ |
| **VB-CATWIZ-MODAL-06** | Modal Save callback inserts new row into the relevant wizard table | ✓ |
| **VB-CATWIZ-SHELL-02** | useSetupGate re-fetches on Categories Wizard completion | ✓ |

---

## Things to look hard at

1. **Edit-link vs edit-in-place on Step 6.** Per the brief, edit-in-place is deferred to B4; B3b ships edit-links. If Cinder over-built (added inline edit), that's not a regression but worth noting — and ask if it's intentional.
2. **Bulk endpoint actually exists.** Don't trust the brief; verify by hitting `POST /api/v1/books/accounts/bulk` in Playwright. If it 404s, this is a BLOCKER.
3. **Step 6 → Dashboard navigation.** Verify the post-success navigation goes to `/books` (Dashboard) when the Categories Wizard was launched from the post-Setup-Wizard success path. The success flow should NOT try to navigate to `/books/categories/wizard` recursively.
4. **Add Account modal `onSave` signature.** B3a's stub laid the contract; verify AddAccountModal.jsx honors it.

---

## Out-of-scope findings from prior reviews

- All B2b-2 NITs (F4, F5, F7, N2) — landed in B2b-2.
- All B3a findings — landed in B3a.
- Edit-in-place for Categories Wizard Step 6 — explicitly deferred to B4 (post-wizard Categories Management CRUD with merge-and-delete flow).
- Multi-entity / accrual / inventory/COGS — out of v2 scope per spec §14.

---

## Report format

Write `WREN_REPORT_b3b.md` at workspace root. Mirror `WREN_REPORT_b2b-1.md`:

- **VERDICT:** SHIP / NEEDS-FIX
- **What I verified**
- **Findings**
- **Recommended next step**

---

## Hard rules

- READ-ONLY on `client/src/`, `server/`. Exception: write `WREN_REPORT_b3b.md` at workspace root.
- No pushing to origin.
- No sub-agent spawns.
- Re-run wireframe smoke before declaring SHIP.

## When done

End your session. Completion event routes here.