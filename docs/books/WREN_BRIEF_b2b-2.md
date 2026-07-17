# Wren Review Brief — B2b-2 (Setup Wizard Step 6 + final POST + chaining + NIT captures)

**Reviewer:** Wren
**Build under review:** B2b-2 — Setup Wizard Step 6 (Review & create) + edit-on-review + final POST + chaining + NIT captures (F4 NAICS Clear, F5 schemaVersion, F7 useSetupGate re-fetch, N2 Step 4 helper text)
**Builder:** Cinder (in flight, sonnet-5)
**Date:** 2026-07-14 14:18 MDT
**Commit:** _set by Cinder after the build lands_
**Spec source of truth:** `queued/TASK-b2b-setup-wizard-completion.md` (re-scoped to B2b-2 2026-07-14 14:14 MDT)
**Report to read:** `CINDER_REPORT_b2b-2.md` (workspace root)
**Wireframe source:** `docs/books/setup-wizard/WIREFRAMES.html` `renderSetup()` Step 6

---

## What was built (per the brief)

B2b-2 is the final piece of the Setup Wizard. 5 files touched + 2 new components per the brief:

- `client/src/books/SetupWizard.jsx` — extend dispatcher with Step 6, schemaVersion=2 + hydrate migration prompt, useSetupGate re-fetch trigger on success
- `client/src/books/SetupWizardReview.jsx` (new) — Step 6 component, two-column layout
- `client/src/books/SetupWizardReviewRow.jsx` (new) — edit-on-review row with pencil + collapsed/expanded states (Save + Cancel)
- `client/src/books/api.js` — add `createBusiness`, `updateBusiness` methods
- `client/src/books/BooksShell.jsx` — `useSetupGate` re-fetch on wizard completion + `/books/categories/wizard` route handler (will route to CategoriesWizard once B3a lands; for now, fall back to `/books/categories` or `/books` Dashboard)
- `client/src/books/SetupWizardNaicsModal.jsx` — NIT F4 fix (Clear button keeps modal open so user can re-pick)
- `client/src/books/SetupWizardAccounting.jsx` — NIT N2 fix (helper text references a v2-real tab, not "Settings → Other")
- `server/scripts/qa-b2b-2.mjs` (new) — QA harness for the 18 behavior IDs

---

## What to verify (focused)

### A. Edit-on-review pattern (the densest UX in the wizard)

Per the brief, Step 6 has two columns of rows. Every row has a pencil; clicking expands inline with editors + Save/Cancel.

- Pencil click toggles row expanded state WITHOUT navigating away from Step 6.
- Expanded state renders the actual step's editor (Step 2 inline editor for proprietor_name; NAICS modal opened in-place for naics_code; Step 3 inline editor for address fields; Step 4 radio for accounting_method; Step 5 month + date pickers for FY + business start date).
- **Save** in an expanded row → `updateSetup({...})` patches the field, re-renders the row as collapsed with the new value.
- **Cancel** → row collapses back without writing.
- Only ONE row can be expanded at a time (clicking a different row's pencil expands the new one and collapses the previous).
- Esc key collapses any expanded row (no side effects).
- "—" (italic, muted) renders for skipped fields; clicking pencil still expands them.

Verify these by reading `SetupWizardReviewRow.jsx` and `SetupWizardReview.jsx`. The QA harness (`server/scripts/qa-b2b-2.mjs`) should prove each.

### B. Final POST

- "Save & continue to Categories →" button on Step 6 calls `createBusiness` if no row exists, otherwise `updateBusiness`.
- Body shape: `setup` object (state) flattened into the businesses columns. **Critical**: verify the columns match `businesses` schema (id, proprietor_name, business_name, trade_name, business_description, naics_code, naics_title, ein, address_line1, address_line2, city, state, postal, country, accounting_method, fiscal_year_start_month, business_started_on, business_type, currency).
- **On success:**
  - localStorage `virta_books:wizard:setup:state` is cleared (or has `setupCompletedAt` set + cleared post-navigation).
  - `useSetupGate` re-fetches — verify by clicking around BooksShell after the wizard completes.
  - Navigate to `/books/categories/wizard` (B3a target). **Fallback chain:** if 404, `/books/categories` (B1a CRUD surface). **Verify the fallback chain is wired.** Read `BooksShell.jsx` for the route handler.
- **On error:** inline error appears under the CTA, button re-enables for retry. State preserved.

### C. schemaVersion=2 (NIT F5)

- `DEFAULT_STATE.setup.schemaVersion === 2`
- `hydrateWizardState()` reads the persisted schemaVersion; on mismatch:
  - If persisted is missing (old pre-B2b-2): treat as v1; prompt user (Continue from here / Start over).
  - If persisted is a future version (impossible in this build but defensive): discard.
  - If matches: hydrate silently.
- Prompt is rendered at the top of Step 1 if a stored state with a different schemaVersion exists. Two buttons: "Continue from here" (keeps state but bumps stored version to 2) and "Start over" (clears localStorage, full reset).

### D. useSetupGate re-fetch (NIT F7)

- After wizard final POST success, `BooksShell.jsx`'s gate hook re-fetches `getCurrentBusiness`. Verify by reading the hook + the success callback path.
- The sidebar should appear (replace the first-run welcome card) immediately after.
- Confirm: `BooksShell.jsx:262-275` was the first-run welcome card route; that should now unmount on gate transition.

### E. NIT F4 fix (NAICS modal Clear)

- `SetupWizardNaicsModal.jsx`: change the "Clear" button so it calls `onSelect('', '')` (to clear the field) but does NOT close the modal.
- Verify by reading the modal's `onSelect` callback. The selected display should clear; the modal should stay open so the user can pick a different code or close via Cancel/backdrop.
- The Step 2 field's separate ✕ clear button should also stay as-is (clears AND closes).

### F. NIT N2 fix (Step 4 helper text)

- `SetupWizardAccounting.jsx`: helper text under the radios should not reference "Settings → Other" (which doesn't exist in v2). Should reference a real v2 tab (e.g. "Settings → General" or just "Settings").
- Verify by reading the component.

### G. Step 6 layout — two-column review

Per spec §6 Step 6 (file `SETUP_AND_CATEGORIES.md`):

- Left column: proprietor_name, business_name, trade_name (if set), naics_code (if set), ein (if set).
- Right column: address_line1, address_line2, city, state, postal, accounting_method, fiscal_year_start_month, business_started_on.
- Section headers above each column: "About you" / "About your business" (left) and "Where are you located" / "How you account" / "Timeline" (right). Or whichever grouping matches the wireframe — **read `WIREFRAMES.html` `renderSetup()` Step 6 to confirm section grouping**.

### H. Cross-cutting

- Wireframe smoke still 255/255 (run `node docs/books/setup-wizard/tests/wf-smoke.mjs`).
- NAICS modal still works (B2a-wizard-B didn't regress).
- Steps 3-5 from B2b-1 still work (Wren verified per-step revert last round; verify once more).
- B2b-1's dark-mode visual: Step 6 should match.
- Resume / Start over prompt still works.

---

## Behavior verification table (18 IDs from the brief)

| Behavior ID | Verifies | Check |
|---|---|---|
| **VB-WIZ-STEP6-01** | Step 6 renders two-column review of all entered data | ✓ |
| **VB-WIZ-STEP6-02** | Every row has a pencil icon | ✓ |
| **VB-WIZ-STEP6-03** | Clicking pencil expands inline with Save + Cancel | ✓ |
| **VB-WIZ-STEP6-04** | Skipped items render as "—" (italic, muted) and editable | ✓ |
| **VB-WIZ-STEP6-05** | "Save & continue to Categories →" POSTs the business row | ✓ |
| **VB-WIZ-STEP6-06** | Successful POST clears wizard state + sets setupCompletedAt | ✓ |
| **VB-WIZ-STEP6-07** | POST error stays on Step 6 with inline error | ✓ |
| **VB-WIZ-STEP6-08** | Inline-edit Save re-renders row with new value | ✓ |
| **VB-WIZ-STEP6-09** | Inline-edit Cancel reverts row to pre-edit value | ✓ |
| **VB-WIZ-PERSIST-03** | Wizard state clears from localStorage on success | ✓ |
| **VB-WIZ-CHAIN-01** | After success, navigates to /books/categories/wizard (or fallback) | ✓ |
| **VB-WIZ-CHAIN-02** | Falls back to /books/categories or /books on 404 | ✓ |
| **VB-WIZ-SCHEMA-01** | schemaVersion=2 in DEFAULT_STATE | ✓ |
| **VB-WIZ-SCHEMA-02** | hydrateWizardState prompts on schema mismatch | ✓ |
| **VB-WIZ-GATE-01** | useSetupGate re-fetches after wizard completion | ✓ |
| **VB-NAICS-CLEAR-01** | NAICS modal "Clear" keeps modal open (F4 fix) | ✓ |
| **VB-WIZ-STEP4-HELPER-01** | Step 4 helper text references a tab that exists in v2 (N2 fix) | ✓ |
| **VB-WIZ-RESUME-04** | Resume/Start over prompt still works post-B2b-2 | ✓ |

Verify each. The QA harness should cover A, B, E, G (DOM/state verifications). Code reading covers C, D, F, H.

---

## Out-of-scope findings from prior reviews (DO NOT fix in this build)

- F1 / F3 (setupDirty semantics) — defer to B3+
- F2 (subheader column placement) — defer
- F6 (`&apos;` instead of real apostrophes) — defer (cosmetic)
- N1 (Step 6 placeholder "B2b" wording) — evaporates automatically since B2b-2 replaces the placeholder

---

## Report format

Write `WREN_REPORT_b2b-2.md` at workspace root. Mirror `WREN_REPORT_b2b-1.md`:

- **VERDICT:** SHIP / NEEDS-FIX (BLOCKER count) / NEEDS-FIX (SIGNIFICANT count) / NEEDS-FIX (NIT count only)
- **What I verified** — concise list with evidence (file:line, harness output, smoke result)
- **Findings** — each with severity, file:line, fix proposal
- **Recommended next step**

---

## Hard rules

- READ-ONLY on `client/src/`, `server/`, schema, migrations, wireframe HTML, smoke test. Exception: write `WREN_REPORT_b2b-2.md` at workspace root.
- No pushing to origin.
- No sub-agent spawns.
- Re-run wireframe smoke before declaring SHIP.
- Demo is post-hoc per B2a Protocol — don't ask Cinder to record demo if it didn't.

## When done

End your session. Completion event routes here.