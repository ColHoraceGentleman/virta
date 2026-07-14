# Wren Review — B2b-2 (Setup Wizard Step 6 + final POST + chaining + NIT captures)

**Reviewer:** Wren
**Build under review:** B2b-2 — Step 6 (Review & create) + edit-on-review + final POST + chaining + NIT captures (F4, F5, F7, N2)
**Commits:** `37973cd` (round 1 NITs), `9c04ffc` (round 2 feature), `06117e5` (QA harness)
**Date:** 2026-07-14
**Brief:** `docs/books/WREN_BRIEF_b2b-2.md`
**Spec:** `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md` §6 + `queued/TASK-b2b-setup-wizard-completion.md` (re-scoped brief)

---

## VERDICT: SHIP

0 blockers, 0 significant findings, 1 NIT (cosmetic, already disclosed by Cinder).

---

## What I verified

### A. Edit-on-review pattern
- `SetupWizardReviewRow.jsx` (94 lines): every row rendered via this shared component; pencil button carries `data-testid="wizard-step6-row-${fieldKey}-edit"` (`SetupWizardReviewRow.jsx:61-68`). Collapsed/expanded states are presentational only — parent owns all edit state (component doc comment + `expandedField`/`draft` usage confirms single source of truth in `SetupWizardReview.jsx:59-77`).
- One-row-at-a-time confirmed by reading `SetupWizardReview.jsx` (`expandedField` is a single scalar, not a set) **and** live harness run: `VB-WIZ-STEP6-ONE-ROW` → `open editors=1` after clicking a second row's pencil while another was open.
- Esc collapses: `SetupWizardReview.jsx:80-90`, scoped `useEffect` inside the Step-6-only component (unmounts with the step, so it can't collapse Step 2's NAICS modal — confirmed no keydown collision: `SetupWizardNaicsModal.jsx:88` has its own independent Escape→`onClose` handler). Live check: `VB-WIZ-STEP6-ESC` → `open editors=0` after Escape.
- Skipped fields render `SKIPPED_PLACEHOLDER` (italic, muted "—", `SetupWizardReviewRow.jsx:22-24`), confirmed editable — live check `VB-WIZ-STEP6-04` passed.
- Inline Save/Cancel: `saveEdit`/`cancelEdit` (`SetupWizardReview.jsx:73-79`) — Save calls `updateSetup({ [field]: draft[field] })` (a **patch**, not whole-object replace), Cancel discards the local `draft` without touching wizard state. Live checks `VB-WIZ-STEP6-08` / `-09` both passed with correct before/after values.
- Per-step editors reused in place, confirmed by reading `SetupWizardReview.jsx`: plain text inputs for Step 2 fields + address (`textRow()` helper, lines 116-138), `<select>` populated from `us-states.js` for State, NAICS pencil opens `SetupWizardNaicsModal` in-place (not a text editor, lines 172-186), radio toggle for accounting method with Accrual disabled (lines 230-250), month `<select>` + `<input type="date">` for Step 5 fields (lines 253-297).

### B. Final POST + chaining
- `handleFinishSetup()` (`SetupWizard.jsx:307-330`): calls `updateBusiness()` when `business` prop is truthy, else `createBusiness()`. Confirmed `naics_title` is destructured off and excluded from the POST/PATCH body (`SetupWizard.jsx:311`) — matches `businessService.js`'s `BUSINESS_FIELDS` whitelist (no `naics_title` column, `businessService.js:15-32`).
- On success: `localStorage.removeItem(WIZARD_STORAGE_KEY)` happens *before* `setState({ setupCompletedAt: ... })` (`SetupWizard.jsx:319-324`) — confirms `setupCompletedAt` never round-trips through localStorage as part of the cleared payload (paranoia check confirmed: it's set in memory only, and the wizard is about to unmount/navigate away anyway).
- `onSetupComplete` (BooksShell's `gate.refetch`) is `await`ed (`SetupWizard.jsx:326-328`), wrapped in its own try/catch so a refetch failure doesn't block navigation.
- Navigation: `navigateAfterSetup(navigate)` walks `CATEGORIES_NAV_CHAIN = ['/books/categories/wizard', '/books/categories', '/books']` (`SetupWizard.jsx:172-184`). `BooksShell.jsx` wires `/books/categories/wizard` → `Categories.jsx` as a stand-in with an explicit comment marking the B3a swap-in point (`BooksShell.jsx:246-253`).
- On error: `SetupWizardReview.jsx`'s `handleFinish()` (lines 98-108) catches, sets `submitError` to `err.message` (human-readable, e.g. "Simulated server failure" in the harness — confirmed not a stack dump), re-enables the CTA via `setSubmitting(false)`. Wizard state untouched (harness confirmed `statePreserved: true`).

### C. Schema versioning (NIT F5)
- `DEFAULT_STATE.schemaVersion === 2` (`SetupWizard.jsx:88`). Live check `VB-WIZ-SCHEMA-01` confirmed `schemaVersion=2` actually lands in localStorage.
- `hydrateWizardState()` (`SetupWizard.jsx:118-155`): missing schemaVersion → treated as 1 → if `< current`, forces `setupStep = 1` + attaches transient `schemaPrompt` (not merged into the persisted object); newer-than-current → `freshDefaultState()` (full discard); matches → hydrates silently, no prompt. All three branches read correctly.
- Banner renders on Step 1 only (`SetupWizard.jsx:409-431`), gated on `state.schemaPrompt.needed`, with "Continue from here" / "Start over" buttons wired to `continueFromSchemaPrompt` / `startOverFromSchemaPrompt`. Live check `VB-WIZ-SCHEMA-02` confirmed the banner + prompt text on a simulated v1 payload; `VB-WIZ-RESUME-04` confirmed "Continue from here" jumps back to the prior step (3), preserves the legacy data (`name: "Legacy User"`), and bumps `schemaVersion` to 2.
- **Persistence non-leak confirmed:** the debounced-save effect destructures `schemaPrompt` out before writing (`SetupWizard.jsx:214`) — it never reaches localStorage.

### D. useSetupGate re-fetch (NIT F7)
- `BooksShell.jsx`'s `useSetupGate()` extracts `fetchGate` as a `useCallback` and returns `{ ...gate, refetch: fetchGate }` (`BooksShell.jsx:170-220`). `SetupWizard` receives it as `onSetupComplete={gate.refetch}` (`BooksShell.jsx:239-243`). `handleFinishSetup()` awaits it. Live check `VB-WIZ-GATE-01` confirmed the sidebar (`nav` with links) is present immediately after the wizard completes, no reload.

### E. BooksShell route additions
- `/books/categories/wizard` route exists (`BooksShell.jsx:246-253`) with a clear comment explaining it's a stand-in for B3a and the swap-in point. Confirmed no infinite-loop risk: `Categories.jsx` does not itself invoke any wizard-launching navigation (only a `Settings → Categories` link, `Categories.jsx:144`) — clicking through to `/books/categories/wizard` or `/books/categories` cannot recursively re-trigger the Setup Wizard.

### F. Round 1 NIT regression check
- F4 (NAICS Clear): `SetupWizardNaicsModal.jsx:71,163-168` — new `onClear` prop, falls back to `onSelect('', '')` only if `onClear` isn't supplied (backward-compat). `SetupWizardBusinessInfo.jsx:319-325` wires `onClear` to clear the field via `updateSetup` without closing the modal. `SetupWizardReview.jsx:178-185` (Step 6's NAICS row) uses the identical `onClear` pattern. Live check `VB-NAICS-CLEAR-01` confirmed `modalStillOpen: true` after Clear.
- N2 (Step 4 helper text): `SetupWizardAccounting.jsx:125` now reads "Settings → General" (a real v2 tab), no "Settings → Other" reference remains. Live check `VB-WIZ-STEP4-HELPER-01` confirmed `noOtherTab: true, hasGeneralTab: true`.

### G. Cross-cutting
- **Wireframe smoke:** ran `node docs/books/setup-wizard/tests/wf-smoke.mjs` → **255/255 passed** (fresh run, not just trusting the Cinder report).
- **Live QA harness:** ran `node server/scripts/qa-b2b-2.mjs` against the running dev app (Vite :5173 + API :3001) → **21/21 passed** (18 required + `VB-WIZ-STEP6-ONE-ROW`, `VB-WIZ-STEP6-ESC`, `VB-WIZ-STEP6-05-SERVER`). Full log tail confirms every ID. The harness restored the dev DB's business row afterward — verified via `curl /businesses/current` before/after; only `updated_at` changed, all other fields matched pre-run values.
- **Steps 3-5 untouched:** `git diff e308c59..HEAD -- client/src/books/SetupWizardContact.jsx client/src/books/SetupWizardTimeline.jsx` → empty (no changes). `SetupWizardAccounting.jsx` has exactly the 1-line N2 text change (confirmed via targeted diff, not a rewrite).
- **Settings.jsx:** confirmed via `git status --short` that `Settings.jsx` shows as a working-tree modification, **not** part of either `37973cd` or `9c04ffc`/`06117e5` — matches the brief's note that this is a pre-existing uncommitted diff, not Cinder's work.
- **Resume/Start over (pre-existing pattern):** `SetupWizardWelcome.jsx` confirmed untouched by this round's diff (`git diff e308c59..HEAD` shows no changes to that file); the "Welcome back" panel (`SetupWizard.jsx:333-364`, rendered when `setupCompletedAt` is set) is a separate, older pattern from the new schema-mismatch banner and both coexist correctly.
- **NAICS modal (B2a-wizard-B):** still functions per the Clear-button regression check above; no other changes to the modal beyond the F4 `onClear` prop addition.

### H. QA harness integrity
Spot-checked all 5 requested IDs by reading source + running live:
- `VB-WIZ-STEP6-05` (`qa-b2b-2.mjs:414-437`) — asserts on `pathname` post-navigation and a separate `VB-WIZ-STEP6-05-SERVER` check hits the real API (`curl`-equivalent fetch) to confirm the PATCH actually landed server-side (`proprietor_name=Jane Reviewer, business_name=Reviewer Studio` — genuinely written, not just asserted true).
- `VB-WIZ-CHAIN-02` (`qa-b2b-2.mjs:466-484`) — imports the actual `SetupWizard.jsx` module via dynamic `import()` in-page and calls the real `navigateAfterSetup` + `CATEGORIES_NAV_CHAIN` export with an injected `routeExists` that simulates the pre-B3a world. Not a re-implementation — exercises the shipped code directly.
- `VB-WIZ-SCHEMA-02` (`qa-b2b-2.mjs:187-220`) — writes a genuine v1-shaped payload (no `schemaVersion` key) directly to localStorage, reloads, and asserts the banner + prompt text render.
- `VB-WIZ-GATE-01` (`qa-b2b-2.mjs:450-463`) — checks for a live `nav` element with clickable links post-completion, no reload triggered (harness never calls `Page.reload` between the Save click and this check).
- `VB-WIZ-STEP6-ESC` (`qa-b2b-2.mjs:348-360`) — dispatches a real `KeyboardEvent('keydown', { key: 'Escape' })` and asserts zero `[data-testid$="-editor"]` elements remain.

All `data-testid` selectors referenced by the harness were cross-checked against the actual component source (`SetupWizardReviewRow.jsx`, `SetupWizardReview.jsx`, `SetupWizard.jsx`) and exist verbatim.

---

## Findings

### NIT-1 (cosmetic, already disclosed): Pencil icon / sidebar version-pill contrast
Cinder flagged this in `CINDER_REPORT_b2b-2.md` under Visual check — low-contrast pencil icons and sidebar version pill against the dark background. Not a functional bug, consistent with existing design language elsewhere in the app (NAICS modal's pencil-adjacent affordances). No fix proposed for this build; flagging for a future polish pass per Cinder's own note.

No blockers, no significant findings.

---

## Notes on judgment calls (reviewed, both reasonable)

1. **`business_description` omitted from Step 6.** Cinder followed the B2b-2 task brief's field table exactly (`queued/TASK-b2b-setup-wizard-completion.md` §1, "Name only, since that's the only Step-2 field that affects the review"), which supersedes the older wireframe's flat `<dl>` that includes a "What you do" row. This is a legitimate divergence between two source-of-truth documents (task brief re-scope vs. original wireframe), correctly disclosed by Cinder as an out-of-scope finding rather than silently resolved either way. Not a defect — flagging for Patrick's call on whether to add it in a future round.
2. **`updateBusiness()` as a thin alias** for the pre-existing `updateCurrentBusiness()` (`api.js:212-219`) rather than a new endpoint — correct given the single-tenant v2 API only has one PATCH route. Confirmed `updateCurrentBusiness` is still exported so no other caller broke.
3. **`onSetupComplete` as a callback prop**, not a custom event — consistent with `BooksShell`'s existing prop-drilling pattern (`business`, `navigate` are already passed the same way to `Dashboard`/`SetupWizard`). Reasonable fit.

---

## Recommended next step

Ship B2b-2 as-is. This closes out the full v2 Setup Wizard (Steps 1-6 + final POST + chaining). Suggest queuing B3a (Categories Wizard) next since `/books/categories/wizard` is currently a stand-in pointing at `Categories.jsx` — the swap-in comment in `BooksShell.jsx:246-253` marks exactly where that lands.

No fixes requested. No re-review needed unless Patrick asks for the `business_description` row to be added to Step 6, in which case that's a small, low-risk addition to `SetupWizardReview.jsx` (one more `textRow()` call).
