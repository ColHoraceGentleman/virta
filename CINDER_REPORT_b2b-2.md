# CINDER REPORT — B2b-2: Setup Wizard Step 6 (Review & create) + final POST + chaining

**Status:** SHIP-ready — all 18 required behavior IDs verified, 255/255 wireframe smoke preserved.
**Date:** 2026-07-14
**Branch:** `main`
**Commits:** `9c04ffc` (feature), `06117e5` (QA harness)

---

## Round status

- **Round 1** (previous build pass) shipped 2 of 8 deliverable items in commit `37973cd`:
  - F4 — NAICS Clear button keeps the modal open (new `onClear` prop on `SetupWizardNaicsModal.jsx`, wired by `SetupWizardBusinessInfo.jsx`).
  - N2 — Step 4 helper text no longer references "Settings → Other" (now "Settings → General").
- **Round 2 (this report)** finishes the remaining 6 items: Step 6 (Review & create) + edit-on-review, the final POST + navigation chaining, schema versioning, and the `useSetupGate` re-fetch.

---

## What shipped this round

### 1. Step 6 — Review & create + edit-on-review

- **`client/src/books/SetupWizardReview.jsx`** (new, 340 lines) — two-column review of every field from Steps 2-5, grouped per the spec: "About you" / "About your business" (left), "Address" / "Accounting & timeline" (right).
- **`client/src/books/SetupWizardReviewRow.jsx`** (new, 94 lines) — the shared collapsed/expanded row component. Every row has a pencil; clicking it swaps to an inline editor + Save/Cancel. Skipped fields render the shared `SKIPPED_PLACEHOLDER` (italic, muted "—") and are editable from that placeholder state.
- Per-step inline editors, reused in place (no navigation away from Step 6):
  - Name / Business name / Trade name / EIN — plain text inputs (Step 2's fields).
  - NAICS — pencil opens `SetupWizardNaicsModal` in-place (not a text editor), same F4-fixed Clear behavior.
  - Address line 1/2, City, State (dropdown from `us-states.js`), ZIP — Step 3's fields.
  - Accounting method — radio toggle (Cash selectable; Accrual disabled with the same "coming later" treatment as Step 4).
  - Fiscal year start (month dropdown) + Business start date (date input) — Step 5's fields.
- One row expanded at a time (parent-owned `expandedField` state — starting a new edit implicitly closes any other).
- Esc collapses whichever row is open (global keydown listener, scoped to Step 6's lifetime).

### 2. Final POST + chaining

- `client/src/books/api.js` — added `updateBusiness()` (alias for the pre-existing `updateCurrentBusiness()`, since `PATCH /businesses/current` is the only update route in this single-tenant v2 API). `createBusiness()` already existed from B2a-prime.
- `SetupWizard.jsx`'s `handleFinishSetup()`:
  - Calls `updateBusiness()` if a `business` row was passed down (from `BooksShell`'s gate), else `createBusiness()`.
  - Strips `naics_title` (display-only, not a `businesses` column) before POSTing.
  - On success: clears `virta_books:wizard:setup:state` from localStorage, sets `setupCompletedAt` in memory, calls the injected `onSetupComplete` (BooksShell's `useSetupGate().refetch`), then navigates via `navigateAfterSetup()`.
  - On error: throws — `SetupWizardReview`'s local try/catch shows the inline error, re-enables the CTA, and leaves wizard state untouched.
- **Navigation fallback chain** — exported `CATEGORIES_NAV_CHAIN = ['/books/categories/wizard', '/books/categories', '/books']` and `navigateAfterSetup(navigate, routeExists)`. `BooksShell.jsx` now has a `/books/categories/wizard` route (renders `Categories.jsx` as a stand-in until B3a ships), so in the live app the chain's first hop always "exists" — the `routeExists` injection point exists purely so QA can simulate the pre-B3a world.

### 3. Schema versioning (NIT F5)

- `DEFAULT_STATE.schemaVersion = 2`.
- `hydrateWizardState()`:
  - Persisted payload missing `schemaVersion` → treated as v1. If v1 < current, data is kept but `setupStep` is forced to 1 and a transient `schemaPrompt` (`{ needed, resumeStep }`) is attached — **not persisted** (stripped by the debounced-save effect).
  - Persisted payload newer than current → discarded outright (no safe downgrade path).
  - Matches current → hydrates silently.
- Step 1 renders a banner when `schemaPrompt.needed` is true: "Your saved setup is from an older version. Continue from here, or start over?" with two buttons — **Continue from here** (jumps to `resumeStep`, bumps `schemaVersion` to current) and **Start over** (full reset via the existing `restartWizard`).

### 4. `useSetupGate` re-fetch (NIT F7)

- `BooksShell.jsx`'s `useSetupGate()` now exposes `refetch` (the extracted fetch logic, wrapped in `useCallback`). Returned as `{ ...gate, refetch: fetchGate }`.
- `SetupWizard` receives `onSetupComplete={gate.refetch}` from `BooksShell`; `handleFinishSetup()` awaits it right after the successful POST/PATCH, so the gate flips from `first-run` → `ready` and the sidebar appears without a hard reload.

### 5. BooksShell route additions

- New `/books/categories/wizard` route handler, routed to `Categories.jsx` for now (comment explains the swap-in for B3a's real Categories Wizard later).
- `SetupWizard` now receives `business={gate.business}` (so `handleFinishSetup` knows POST vs. PATCH) and `onSetupComplete={gate.refetch}`.

### 6. SetupWizard.jsx dispatcher

- Step 6 now renders `SetupWizardReview` (was `SetupWizardStepPlaceholder`).
- `setupCompletedAt` setter wired into `handleFinishSetup`.
- `useSetupGate` re-fetch wired via the `onSetupComplete` prop passed down from `BooksShell` (the "callback prop" option from the two mentioned in the brief — cleaner than a custom DOM event given `BooksShell` already owns both components' mount points).

---

## Files touched

| File | Change | Lines |
|---|---|---|
| `client/src/books/SetupWizardReview.jsx` | NEW | 340 |
| `client/src/books/SetupWizardReviewRow.jsx` | NEW | 94 |
| `server/scripts/qa-b2b-2.mjs` | NEW | 596 |
| `client/src/books/SetupWizard.jsx` | MODIFIED (Step 6 dispatcher, schemaVersion, hydrate migration, handleFinishSetup, nav chain) | +218 / -~30 (net +188 over prior 355-line file) |
| `client/src/books/api.js` | MODIFIED (+`updateBusiness` alias) | +7 |
| `client/src/books/BooksShell.jsx` | MODIFIED (`useSetupGate` refetch, `/books/categories/wizard` route, prop wiring) | +101 / -~15 |

**Files explicitly NOT touched** (per the brief's do-not-touch list): `SetupWizardWelcome.jsx`, `SetupWizardBusinessInfo.jsx`, `SetupWizardContact.jsx`, `SetupWizardTimeline.jsx`, `SetupWizardAccounting.jsx`, `SetupWizardNaicsModal.jsx`, `SetupWizardProgress.jsx`, `SetupWizardStepPlaceholder.jsx` (now dead code — no longer imported by `SetupWizard.jsx`, but left in place since deleting wasn't in scope), `us-states.js`, `Transactions.jsx`, `Categories.jsx`, `Dashboard.jsx`, `Settings.jsx`, any `server/api/v1/books/` router (the existing `POST /businesses` + `PATCH /businesses/current` endpoints from B2a-prime were sufficient — no new endpoints needed), and all three wireframe/spec/smoke files.

---

## Behavior verification — 18/18 required + 3 extra

Run via `node server/scripts/qa-b2b-2.mjs` (drives the live app with Chrome DevTools Protocol against the running dev servers). All 21 checks pass:

| Behavior ID | Result |
|---|---|
| VB-WIZ-STEP6-01 | ✅ two-column review, 13 rows rendered |
| VB-WIZ-STEP6-02 | ✅ every row has a pencil |
| VB-WIZ-STEP6-03 | ✅ pencil expands inline with Save + Cancel |
| VB-WIZ-STEP6-04 | ✅ skipped fields render "—" italic/muted, editable |
| VB-WIZ-STEP6-05 | ✅ CTA POSTs/PATCHes the business row (server-side value confirmed) |
| VB-WIZ-STEP6-06 | ✅ success clears wizard state + sets setupCompletedAt |
| VB-WIZ-STEP6-07 | ✅ POST error stays on Step 6, inline error, CTA re-enables, state preserved |
| VB-WIZ-STEP6-08 | ✅ inline Save re-renders the row with new value |
| VB-WIZ-STEP6-09 | ✅ inline Cancel reverts to pre-edit value |
| VB-WIZ-PERSIST-03 | ✅ wizard state clears from localStorage on success |
| VB-WIZ-CHAIN-01 | ✅ navigates to `/books/categories/wizard` on success |
| VB-WIZ-CHAIN-02 | ✅ fallback chain (`navigateAfterSetup` + `CATEGORIES_NAV_CHAIN`) verified directly — falls back to `/books/categories` when the wizard route is unavailable |
| VB-WIZ-SCHEMA-01 | ✅ `schemaVersion: 2` on `DEFAULT_STATE` |
| VB-WIZ-SCHEMA-02 | ✅ migration banner appears on a simulated v1 payload |
| VB-WIZ-GATE-01 | ✅ sidebar appears immediately after Step 6 success (no reload) |
| VB-NAICS-CLEAR-01 | ✅ regression check — Clear keeps the NAICS modal open (round-1 fix, re-verified) |
| VB-WIZ-STEP4-HELPER-01 | ✅ regression check — Step 4 helper text references "Settings → General" (round-1 fix, re-verified) |
| VB-WIZ-RESUME-04 | ✅ "Continue from here" resumes at the prior step, preserves data, bumps schemaVersion — no regression from the schema-mismatch banner |

Plus 2 supplementary checks not in the original 18 but useful signal: `VB-WIZ-STEP6-ONE-ROW` (only one row expanded at a time) and `VB-WIZ-STEP6-ESC` (Esc collapses) — both ✅.

**Wireframe smoke:** `node docs/books/setup-wizard/tests/wf-smoke.mjs` → **255/255 passed** (unchanged — this build never touches `WIREFRAMES.html`, `SETUP_AND_CATEGORIES.md`, or `wf-smoke.mjs`).

QA harness note: it snapshots the dev DB's `businesses` row before running and restores it after (via `PATCH /businesses/current`), so re-runs don't leave test data behind. Verified via `curl /businesses/current` before/after.

---

## Visual check

- Dark mode (the only mode this app ships): screenshot captured at Step 6 with the "Trade name" row expanded — layout is coherent, sections read correctly, CTA row (Back / Save & continue to Categories) sits below the divider. See `docs/books/qa/runs/2026.07.14-b2b-2/step6-review-dark.png`.
- Post-completion screenshot confirms the sidebar renders (Dashboard/Categories/Transactions/Settings) and lands on the Categories page after "Save & continue to Categories →".
- Minor cosmetic observation (not a functional bug, matches existing design language elsewhere in the app): the pencil icons and the sidebar version pill are low-contrast against the dark background. Flagging for Wren/Patrick as a polish item, not fixing unasked since it's consistent with the existing NAICS modal's pencil-adjacent affordances and out of this round's scope.

---

## Judgment calls

1. **`onSetupComplete` as a callback prop, not a custom event.** The brief offered both options ("via a callback prop passed from BooksShell to SetupWizard, OR via a custom event the gate subscribes to — pick whichever fits the existing BooksShell pattern"). `BooksShell` already owns both components' mount points and passes props down (`business`, `navigate`, etc. to `Dashboard`), so a prop is the more idiomatic fit — no need to introduce a global event bus for a single call site.
2. **`updateBusiness()` as an alias, not a new endpoint.** The brief's file list says "add `createBusiness`, `updateBusiness`" — `createBusiness` already existed (B2a-prime); I added `updateBusiness` as a thin alias for the existing `updateCurrentBusiness()` rather than duplicating logic, since the v2 API is single-tenant and PATCH `/businesses/current` is the only update route that exists (no per-id route). Kept both names exported so any other caller depending on `updateCurrentBusiness` isn't broken.
3. **`SetupWizardStepPlaceholder.jsx` left untouched but now unused by the Step 6 dispatcher.** It's on the do-not-touch list, and nothing in this round asked me to delete or repurpose it; it stays on disk as dead code from `SetupWizard.jsx`'s perspective, still importable, still used to describe Steps 3-5 if anything ever regresses.
4. **Error-path QA simulates a server failure via a monkey-patched `fetch`, not a real validation error.** `businessService.updateBusiness()` doesn't re-validate required fields on PATCH (only `createBusiness()` does), so there was no way to trigger a genuine 4xx against an already-existing business row in the dev DB. The monkey-patch approach still exercises the exact same client-side error-handling code path (`SetupWizardReview`'s try/catch around `onFinish()`), which is what the behavior ID actually verifies.
5. **QA harness restores the dev DB's business row after running**, since the success-path test (VB-WIZ-STEP6-05/06) genuinely PATCHes the live dev database. Verified via `curl` before/after that the row returned to its pre-test values.

---

## Out-of-scope findings (flagging, not fixing)

1. **The wireframe's flat Step 6 `<dl>` (in `WIREFRAMES.html` / `SETUP_AND_CATEGORIES.md`) includes a "What you do" row** (business_description) that the B2b-2 task brief's field-by-field table (§1) omits. I followed the task brief's table exactly (which explicitly scopes down to "Name only, since that's the only Step-2 field that affects the review" for the "About you" section) — `business_description` is not reviewable/editable from Step 6 in this build. Flagging in case Patrick wants it added; it's a one-row addition to `SetupWizardReview.jsx` if so.
2. **`SetupWizardStepPlaceholder.jsx` is now fully orphaned** from the wizard's rendering path (Steps 3-6 all have real components as of B2b-1 + this round). It's still imported nowhere in `SetupWizard.jsx`. A future cleanup pass could delete it, but it wasn't asked for and touching it risks brushing against the do-not-touch boundary, so I left it in place.
3. **Pencil icon / sidebar version-pill contrast** — noted above under Visual check. Cosmetic only.

---

## Demo

Per the B2a Protocol amendment, demo recording is post-hoc and out of this build's scope. Screenshots captured during the build (for the visual check, not a substitute for the full demo) live at:
- `docs/books/qa/runs/2026.07.14-b2b-2/step6-review-dark.png`
