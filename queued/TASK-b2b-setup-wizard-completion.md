# TASK — B2b-2: Setup Wizard Step 6 (Review & create + edit-on-review + final POST + chaining)

**Status:** READY — spawn immediately (Cinder, in current push). Wren B2b-1 just SHIPped (`e308c59`).
**Phase:** v2 Setup Wizard — final piece. B2a = Steps 1-2 + schema + NAICS + Dashboard conditional. **B2b-1 = Steps 3-5 (already shipped `bfdd386`, Wren ✅ SHIP). B2b-2 = THIS BRIEF — Step 6 + edit-on-review + final POST + chaining to Categories Wizard.**
**Author:** Rusty (per Patrick's "build everything in the wireframes" call 2026-07-13 10:39 MDT; queued-n-next per Patrick's "get through B2b before I review" call 2026-07-14 13:58 MDT)
**Date:** 2026-07-13 13:28 MDT
**Branch:** `main`

---

## Why this is the final piece

B2a's scope (Steps 1-2 + schema + NAICS modal + Dashboard conditional) shipped. B2b-1 (Steps 3-5: Contact, Accounting, Timeline) shipped `bfdd386`, Wren SHIPped `e308c59` (0 blockers, 0 significants, 2 cosmetic NITs). What's left: Step 6 (Review & create) + edit-on-review pencil pattern + final POST + chaining to Categories Wizard.

This is the **biggest piece of B2b** — Step 6 has the most complex UX (two-column review with inline edit) and the final POST is the actual write that flips the user from "first-run" to "ready" state.

---

## Prerequisites

All on disk and verified:
- `businesses` + `settings` tables exist (B2a-prime)
- `accounts` CHECK constraint in place (`irs_line IS NOT NULL` unless `name = 'Review Later'`)
- Wizard state machine + Steps 1-5 working (B2a-wizard-B + B2b-1)
- NAICS modal working (B2a-wizard-B; F4 NIT deferred to this build — see NIT capture below)
- `GET /businesses/current`, `PATCH /businesses/current`, `GET /settings`, `PUT /settings/:key` endpoints live (B2a-prime)
- Sidebar pill logic working (B2a-wizard-A)
- Dashboard first-run experience working (B2a-wizard-A)
- Dashboard conditional content working (B2a-wizard-A)
- Resume-from-mid-wizard pattern already implemented in `SetupWizard.jsx:188-205` (per Wren B2a-wizard-B review §A) — DO NOT RE-IMPLEMENT, the wizard Step 1 already has the Resume / Start over prompt.

**Read these reports first:**
- `CINDER_REPORT_b2a-prime.md`
- `CINDER_REPORT_b2a-prime-fixups.md`
- `CINDER_REPORT_b2a-wizard-a.md`
- `CINDER_REPORT_b2a-wizard-b.md`
- `CINDER_REPORT_b2b-1.md`
- `WREN_REPORT_b2a-wizard-b.md` (NIT F4 lives here; capture below)
- `WREN_REPORT_b2b-1.md` (NITs from this review; capture below)

---

## Scope of THIS build (B2b-2 only)

### 1. Step 6 — Review & create + edit-on-review

Per `SETUP_AND_CATEGORIES.md` §6 Step 6. **This is the biggest piece of B2b.**

- **Two-column review** of everything entered across Steps 2-5.
- **Every row has a pencil icon** on the right side.
- Clicking the pencil expands the row inline; field editors render in place with **Save** + **Cancel** buttons.
- Save persists to wizard state (`updateSetup`) and re-renders the row.
- Skipped items show as "—" (italic, muted) — also editable.
- **Two CTAs at bottom:**
  - "Back" (returns to Step 5)
  - "Save & continue to Categories →" (writes `businesses` row via POST, launches Categories Wizard)

**Field-by-field review layout:**

| Column | Row | Edit affordance |
|---|---|---|
| Left | Proprietor name | pencil → Step 2 inline editor (Name only, since that's the only Step-2 field that affects the review) |
| Left | Business name | pencil → Step 2 inline editor |
| Left | Trade name (if set) | pencil → Step 2 inline editor |
| Left | NAICS code (if set) | pencil → opens NAICS modal in-place (NOT a Step 2 re-render) |
| Left | EIN (if set) | pencil → Step 2 inline editor |
| Right | Address line 1 | pencil → Step 3 inline editor |
| Right | Address line 2 | pencil → Step 3 inline editor |
| Right | City | pencil → Step 3 inline editor |
| Right | State | pencil → Step 3 inline editor |
| Right | ZIP | pencil → Step 3 inline editor |
| Right | Accounting method | pencil → Step 4 inline editor (radio toggle) |
| Right | Fiscal year start | pencil → Step 5 inline editor |
| Right | Business start date | pencil → Step 5 inline editor |

For NIT F4 (NAICS modal "Clear" button) — see the NIT capture section below. **Decision: this brief says the NAICS modal stays as-is.** Patrick will see this in the final demo. Don't fix F4 in this build unless explicitly told.

### 2. Final POST: `POST /api/v1/books/businesses` (or PATCH if row exists)

- Body: full `setup` object from wizard state.
- Behavior:
  - If no `businesses` row exists, `POST` creates it.
  - If a row exists, `PATCH /businesses/current` updates it.
- On success:
  - Clear `virta_books:wizard:setup:state` from localStorage.
  - Set `setupCompletedAt = <timestamp>` in wizard state (then cleared, but the existence of the localStorage state was what mattered for the resume prompt; once cleared, the prompt won't fire on a subsequent Setup Wizard visit).
  - **Re-fetch `getCurrentBusiness` in `useSetupGate`** (BooksShell.jsx). Per Wren B2a-wizard-B NIT F7, this re-fetch was deferred to B2b because `setupCompletedAt` lands in B2b-2. **NOW IS THE TIME.** Without this re-fetch, the sidebar won't appear after the wizard completes.
  - Navigate to `/books/categories` to launch Categories Wizard.
  - **B3a may not have landed yet** — if `/books/categories` 404s, navigate to `/books` Dashboard which should render a "Categories wizard — coming next" placeholder OR the Categories Wizard if B3a shipped first. Read `BooksShell.jsx` to see the existing route handler for `/books/categories`. The Setup Wizard's `onSaveSuccess` callback in `SetupWizard.jsx` should attempt the navigation in this priority order:
    1. `/books/categories/wizard` (B3a path) — render if B3a shipped
    2. `/books/categories` (post-wizard CRUD, B1a shipped) — render if not
    3. `/books` Dashboard with a "Categories wizard coming next" placeholder
  - **Cleanest implementation:** try `navigate('/books/categories/wizard')`; if BooksShell 404s on it, fall back to `/books/categories`. Verify by reading the existing BooksShell route handler.

- On error: show inline error, stay on Step 6. Don't clear state. The "Save & continue to Categories →" button re-enables so user can retry.

### 3. Schema versioning (NIT F5 from Wren B2a-wizard-B)

Per Wren B2a-wizard-B NIT F5: add a `schemaVersion` integer to the wizard state. Migrate (or discard) on mismatch.

- Add `schemaVersion: 2` to `DEFAULT_STATE` (B2b-1's state is implicitly v1, schemaVersion=1).
- In `hydrateWizardState()`, on mismatch: either migrate (if minor change) or discard (if breaking). For B2b-2, since we're just adding `setupCompletedAt` + `schemaVersion`, use a **discard-with-confirmation** pattern: on mismatch, prompt the user "Your saved setup is from an older version. Continue from here, or start over?" with two buttons.
- Update `hydrateWizardState()` to bump the stored version if the user continues.

### 4. Files to touch / create

- `client/src/books/SetupWizard.jsx` — extend dispatcher with Step 6 + final POST + chaining + setupCompletedAt re-fetch.
- `client/src/books/SetupWizardReview.jsx` (new) — Step 6 component.
- `client/src/books/SetupWizardReviewRow.jsx` (new) — edit-on-review row component (renders one row with pencil + collapsed/expanded states).
- `client/src/books/api.js` — add `createBusiness`, `updateBusiness` methods.
- `client/src/books/BooksShell.jsx` — add `useSetupGate` re-fetch on wizard completion. **Plus**: add the `/books/categories/wizard` route handler (will route to CategoriesWizard once B3a lands; for now, route to a stub or to `Categories.jsx` if not).

### 5. Don't break

- B2a-wizard-B's Steps 1-2 + NAICS modal (DO NOT TOUCH).
- B2b-1's Steps 3-5 (DO NOT TOUCH — Wren verified per-step revert preserves other steps' fields).
- B1a's Transactions polish + Categories CRUD (DO NOT TOUCH).
- B2a-wizard-A's sidebar + Dashboard first-run (DO NOT TOUCH sidebar). You may edit the conditional dashboard content if `setupCompletedAt` flips a celebration state.
- The 7 NITs from Wren B2a-wizard-B. Most defer to future; F4 NAICS Clear is in scope **only if Patrick asks**. F5 schemaVersion is in scope for THIS brief. F7 useSetupGate re-fetch is in scope for THIS brief.
- Wireframe smoke (255/255).
- Existing REST endpoints.

---

## NIT captures from prior Wren reviews

### From Wren B2a-wizard-B (capture so they're not forgotten)

| ID | Severity | Description | Status |
|---|---|---|---|
| F1 | NIT | `setupDirty` flag set on every `setStep` call, name slightly misleading | DEFER to B3+ (not blocking) |
| F2 | NIT | "About your business" subheader ships in right column; left "About you" same style | DEFER (not blocking) |
| F3 | NIT | `setupDirty` semantics across `setStep` calls | DEFER (not blocking) |
| F4 | NIT | NAICS modal "Clear" button clears AND closes — surprising | **LAND NOW**: change so "Clear" in the modal keeps the modal open so user can re-pick a code. (Was originally "in B2b-2's review" per brief — that was a deferral. NOW it's B2b-2's build.) |
| F5 | NIT | No `schemaVersion` on localStorage payload | **LAND NOW** (this brief) |
| F6 | NIT | `&apos;` instead of real apostrophe | DEFER (cleanup, not blocking) |
| F7 | NIT | `useSetupGate` re-fetch on wizard completion | **LAND NOW** (this brief) |

### From Wren B2b-1 (just shipped)

| ID | Severity | Description | Status |
|---|---|---|---|
| N1 | NIT | Step 6 placeholder still says "B2b" instead of "B2b-2" | DEFER (cosmetic, B2b-2 replaces placeholder with real Step 6 so this evaporates) |
| N2 | NIT | Step 4 helper text references a "Settings → Other" tab that isn't scheduled to exist in v2 | **LAND NOW**: change helper text to "You can change this later in Settings → General" or similar — anything that references a tab that will actually exist in v2. |

---

## Build behaviors (Test coverage)

| Behavior ID | Name | Verifies |
|---|---|---|
| VB-WIZ-STEP6-01 | Step 6 renders two-column review of all entered data | ✓ |
| VB-WIZ-STEP6-02 | Every row has a pencil icon | ✓ |
| VB-WIZ-STEP6-03 | Clicking pencil expands the row inline with Save + Cancel | ✓ |
| VB-WIZ-STEP6-04 | Skipped items render as "—" (italic, muted) and are editable | ✓ |
| VB-WIZ-STEP6-05 | "Save & continue to Categories →" POSTs the business row | ✓ |
| VB-WIZ-STEP6-06 | Successful POST clears wizard state + sets setupCompletedAt | ✓ |
| VB-WIZ-STEP6-07 | POST error stays on Step 6 with inline error | ✓ |
| VB-WIZ-STEP6-08 | Inline-edit Save re-renders the row with the new value | ✓ |
| VB-WIZ-STEP6-09 | Inline-edit Cancel reverts the row to the pre-edit value | ✓ |
| VB-WIZ-PERSIST-03 | Wizard state clears from localStorage on successful Step 6 | ✓ |
| VB-WIZ-CHAIN-01 | After Step 6 success, navigates to /books/categories/wizard (or fallback) | ✓ |
| VB-WIZ-CHAIN-02 | If /books/categories/wizard 404s, falls back to /books/categories or /books | ✓ |
| VB-WIZ-SCHEMA-01 | schemaVersion=2 added to DEFAULT_STATE | ✓ |
| VB-WIZ-SCHEMA-02 | hydrateWizardState prompts on schema mismatch | ✓ |
| VB-WIZ-GATE-01 | useSetupGate re-fetches after wizard completion (sidebar appears) | ✓ |
| VB-NAICS-CLEAR-01 | NAICS modal "Clear" button keeps modal open (F4 fix) | ✓ |
| VB-WIZ-STEP4-HELPER-01 | Step 4 helper text references a tab that exists in v2 (N2 fix) | ✓ |
| VB-WIZ-RESUME-04 | Resume / Start over prompt continues to work after B2b-2 lands (no regression) | ✓ |

Add these IDs to **Test coverage** in `CINDER_REPORT_b2b-2.md`.

---

## Definition of done

- [ ] Read B2a + B2b-1 + Wren reports first (especially NIT capture table).
- [ ] Step 6 two-column review with edit-on-row pencil pattern + Save/Cancel per row.
- [ ] Final POST writes the business row + clears wizard state.
- [ ] `useSetupGate` re-fetch wired in BooksShell so sidebar appears after wizard completes.
- [ ] NAICS modal F4 fix (Clear keeps modal open).
- [ ] Step 4 helper text N2 fix (no references to "Settings → Other").
- [ ] `schemaVersion=2` + migration prompt on hydrate mismatch.
- [ ] All 18 behavior IDs verified.
- [ ] Demo recorded: `demos/2026.07.14-b2b-2-step6.mp4` (silent 4-6 min walkthrough: Step 6 review + edit-on-review + final POST + dashboard/sidebar appears). **Per B2a Protocol amendment, demo is post-hoc — capture after build commits, in a separate recording pass. Don't burn build budget on demo.**
- [ ] Committed in logical chunks.
- [ ] Wren can review; Echo can run matrix.
- [ ] Light + dark mode visual check.

## When done

Push a completion event with:
- 2-3 line summary
- Commit hash(es)
- Demo path (will be captured separately by Rusty post-commit)
- Anything to flag for Wren
- Any judgement calls
- Any out-of-scope findings

## Hard rules

- `trash` > `rm`. Backup DB if you touch schema (you shouldn't — B2a-prime did the schema).
- **DO NOT touch B2a-wizard-B code (Steps 1-2 + NAICS modal data path)**, B2b-1 code (Steps 3-5), B1a code, or any wireframe/spec/smoke file.
- **Demo recording is POST-HOC** — per B2a Protocol amendment, decoupled from build. Don't burn runtime on demo capture. Capture after commit, in a separate session.
- No pushing to origin.
- No sub-agent spawns.
- Visual check in dark mode before declaring done.

## Why this is a focused build

~400-500 lines: new Step 6 component (~150 lines), new SetupWizardReviewRow component (~80 lines), SetupWizard.jsx dispatcher + schema version (~50 lines), BooksShell re-fetch + new wizard route (~50 lines), NAICS Clear fix + helper text fix (~30 lines), QA harness (~150 lines).

Smaller than B2a-wizard-B (1,032 lines) but more concentrated — Step 6 is the densest UX in the wizard. Don't try to fit it into a smaller scope; do it cleanly.
