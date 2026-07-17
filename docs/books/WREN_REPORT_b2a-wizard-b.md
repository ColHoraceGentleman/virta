# Wren Review Report — B2a-wizard-B (wizard Steps 1-2 + NAICS modal)

**Reviewer:** Wren
**Build under review:** B2a-wizard-B
**Commit:** `5de5cef` on `main` (1 ahead of `984c223`)
**Branch state:** local-only, not pushed
**Files reviewed:** 6 (1 modified + 5 new), 1,008 insertions per `git show --stat`
**Review date:** 2026-07-13 22:00 MDT

---

## TL;DR — ✅ SHIP

Implementation is correct, complete, and matches the spec end-to-end. State machine + persistence + Step 1 + Step 2 + NAICS modal + Steps 3-6 placeholder all behave as the brief requires. Wireframe smoke still 255/255. No BLOCKER, no SIGNIFICANT findings. A handful of NIT observations only — none of them block this build or B2b.

The Cinder report's behavior matrix matches the on-disk code. The post-hoc provenance (Cinder hit provider overload mid-demo; Rusty committed + wrote report) is fine — implementation is real and verifiable on disk.

---

## Findings table

| ID  | Severity | Description | File:line | Suggested fix |
|-----|----------|-------------|-----------|---------------|
| F1  | NIT      | `setupDirty` flag in `SetupWizard.jsx` is set on every `setStep` call, not just on field edits. It's never read in B2a-wizard-B, so it's harmless — but the name is slightly misleading for the next reader. | `SetupWizard.jsx:146`, `:153` | Either rename to `setupTouched` (true once the user has interacted) or document the semantics in the comment. Or leave alone — B2b may want it. |
| F2  | NIT      | The "About your business" subheader ships in the **right** column, but the **left** column subheader "About you" appears to be `text-xs uppercase tracking-wider` — same as the right. Spec doesn't pin which side is which, so this is fine. | `SetupWizardBusinessInfo.jsx:74` | None — flagging for awareness only. |
| F3  | NIT      | `setupDirty` in `DEFAULT_STATE` is `false`. After a single `setStep()` call it becomes `true`. If a future spec change reads `setupDirty` to gate a "Save before leaving?" prompt, the prompt will fire the first time the user advances from Step 1 → 2 (no field edits yet). Document or rename. | `SetupWizard.jsx:74`, `:146` | Same as F1. |
| F4  | NIT      | In the NAICS modal, the "Clear" button in the selected-code header calls `onSelect('', '')`. In `SetupWizardBusinessInfo` this triggers `updateSetup({ naics_code: '', naics_title: '' })` AND closes the modal (`setShowNaicsModal(false)`). That means clicking "Clear" both clears the field AND closes the modal — surprising if the user intended only to clear. The Step 2 field has its own separate ✕ clear button that does the same thing without closing the modal. | `SetupWizardNaicsModal.jsx:158`, `SetupWizardBusinessInfo.jsx:315-318` | Decide intent: either (a) "Clear" in the modal should keep the modal open so the user can pick a different code, or (b) document that "Clear" = "clear and close" and align with the Step 2 ✕. Recommend (a) — opens the modal just to clear feels wrong. |
| F5  | NIT      | `hydrateWizardState()` merges over `DEFAULT_STATE.setup`, so adding a new field to the default in the future automatically hydrates old payloads. Good. But there's no schema version key — if a future B2b renames a field (e.g. `proprietor_name` → `legal_name`), old localStorage payloads will silently keep both keys. | `SetupWizard.jsx:90-104` | Add a `schemaVersion` integer to the state object, bump it when DEFAULT_STATE shape changes, and migrate (or discard) on mismatch. B2b is the natural place to introduce this since B2b is adding more fields. |
| F6  | NIT      | Step 1 (Welcome) uses `&apos;` for the apostrophe in "Let's" and "that's". The other components use `&apos;` too. Consistent — but in 2026 you can use a real apostrophe in JSX text. `'` works fine. | `SetupWizardWelcome.jsx:18,22`, etc. | Optional cleanup. |
| F7  | NIT      | `useSetupGate` in `BooksShell.jsx` does not re-fetch on wizard completion. Already flagged as Wren B2a-wizard-A NIT M-02 and correctly documented in source as a TODO. Not blocking B2a-wizard-B; lands in B2b. | `BooksShell.jsx` (cited in source comments) | B2b. |

No BLOCKER or SIGNIFICANT findings.

---

## Behavior verification table (19 IDs)

| Behavior ID | Verifies | Status | Evidence |
|---|---|---|---|
| **VB-WIZ-ROUTE-01** | `/books/setup` renders SetupWizard | ✅ | `BooksShell.jsx:177-178` — `else if (path === '/books/setup' || path === '/books/setup/') { page = <SetupWizard navigate={navigate} />; }` |
| **VB-WIZ-PERSIST-01** | State persists to localStorage on every change (debounced 250ms) | ✅ | `SetupWizard.jsx:130-141` — `useEffect` schedules `setTimeout(..., 250)` after each state change; `clearTimeout` on every render. Storage key = `virta_books:wizard:setup:state`. |
| **VB-WIZ-PERSIST-02** | State hydrates from localStorage on mount | ✅ | `SetupWizard.jsx:122` — `useState(() => hydrateWizardState())`. Hydrate function validates shape and falls back to defaults on bad payload (`SetupWizard.jsx:88-105`). |
| **VB-WIZ-PERSIST-04** | Step 1 + Step 2 fields persist | ✅ | `DEFAULT_STATE.setup` includes all 7 B2a fields (proprietor_name, business_name, trade_name, business_description, naics_code, naics_title, ein). Persistence effect writes whole state. |
| **VB-WIZ-STEP1-01** | Step 1 renders Welcome headline + Schedule C sub + CTA | ✅ | `SetupWizardWelcome.jsx:17-30` — `<h2>Let's set up your books.</h2>`, infobox with Schedule C copy, "Most people finish in under 5 minutes" reassurance, "Get started →" button. `data-testid="wizard-step1-cta"`. |
| **VB-WIZ-STEP1-02** | Step 1 CTA advances to Step 2 | ✅ | `SetupWizardWelcome.jsx:26-29` — `onClick={() => setStep(2)}`. |
| **VB-WIZ-STEP2-01** | Step 2 renders "About you" + "About your business" subheaders | ✅ | `SetupWizardBusinessInfo.jsx:74` ("About you") and `:121` ("About your business"). 2-col grid `md:grid-cols-2`. Stacks on mobile by default. |
| **VB-WIZ-STEP2-02** | "Your name" required; error under field on attempt | ✅ | `SetupWizardBusinessInfo.jsx:78-86` — `handleSave` checks `!setup.proprietor_name || !setup.proprietor_name.trim()`, sets `nameError = 'Your name is required.'`. Error renders under the input with `data-testid="wizard-step2-name-error"` (`:99-101`). Border turns rose on error (`:89`). Error clears when user types after a failed save attempt (`:91`). |
| **VB-WIZ-STEP2-03** | EIN soft-validates; warning shown, doesn't block | ✅ | `SetupWizard.jsx:108-115` — `validateEinFormat` accepts `/^\d{9}$/` or `/^\d{2}-\d{7}$/` (functionally equivalent to spec's `/^\d{2}-?\d{7}$/`). `SetupWizardBusinessInfo.jsx:69-71` — `showEinWarning = setup.ein && !einCheck.valid`. Amber border + warning text render at `:191-198`. Save doesn't check EIN — confirmed `handleSave` only validates proprietor_name. |
| **VB-WIZ-STEP2-04** | Description counter when > 200 chars | ✅ | `SetupWizardBusinessInfo.jsx:73-74` — `descriptionLen > COUNTER_THRESHOLD` (200). Counter renders at `:156-162`. Color flips to amber at `>= MAX_DESCRIPTION - 10` (= 270). |
| **VB-WIZ-STEP2-05** | Skip ↔ "Revert to Defaults" label flip on dirty | ✅ | `SetupWizardBusinessInfo.jsx:48-50` — `isStep2Dirty(setup)` returns true if ANY of the 7 step-2 fields has a non-empty value. `skipLabel = dirty ? 'Revert to Defaults' : 'Skip'` (`:67`). `handleSkipOrRevert` calls `revertSetupToDefaults` when dirty (`:88-91`), which clears all 7 B2a step-2 fields and preserves B2b fields untouched (`:160-180` in parent). |
| **VB-WIZ-STEP2-06** | Step 2 Save persists + advances | ✅ | `SetupWizardBusinessInfo.jsx:78-86` — `handleSave` validates name then `setStep(3)`. Persistence is automatic via the debounced `useEffect` in the parent (SetupWizard.jsx:130-141). |
| **VB-WIZ-STEP3-PLACEHOLDER** | Step 3 renders "Coming in B2b" placeholder with Back | ✅ | `SetupWizardStepPlaceholder.jsx` renders for steps 3-6 (dispatched at `SetupWizard.jsx:243-247`). "Coming in B2b" pill (`:24-26`), step-specific blurb from `STEP_BLURBS` (`:13-18`), Back button (`:46-52`), Skip (steps 3-5 only, `:55-61`), Save & continue or "Finish setup (in B2b)" disabled on step 6 (`:63-71`). |
| **VB-NAICS-MODAL-01** | NAICS modal opens from "Industry code (NAICS)" field | ✅ | `SetupWizardBusinessInfo.jsx:172` (field `onClick={() => setShowNaicsModal(true)}`) and `:184` (Look up button). Modal mounted conditionally at `:312-319`. |
| **VB-NAICS-MODAL-02** | Search filters by keyword | ✅ | `SetupWizardNaicsModal.jsx:104-120` — filter pipeline lowercases the query once, then substring matches against `r.title`, `r.code`, and `r.keywords`. Debounced 200ms via `useDebouncedValue` (`:79-85`). |
| **VB-NAICS-MODAL-03** | Sector filter narrows | ✅ | `SetupWizardNaicsModal.jsx:105-110` — sector filter applied first (cheaper) via a `Set` lookup against `r.sector_code`. |
| **VB-NAICS-MODAL-04** | Clicking row writes code + closes | ✅ | `SetupWizardNaicsModal.jsx:233` — `onClick={() => onSelect(r.code, r.title)}`. In parent (`SetupWizardBusinessInfo.jsx:315-318`), `onSelect` writes `naics_code` + `naics_title` AND calls `setShowNaicsModal(false)`. |
| **VB-NAICS-MODAL-05** | JSON has 1,000+ codes from US Census 2022 | ✅ | `client/src/assets/naics-2022.json` has 1,012 entries. All 6-digit codes (111110 → 928120). No duplicates. Schema: `{ code, title, sector, sector_code, keywords[] }`. Built via `naics-build.mjs` (sibling file). |
| **VB-NAICS-MODAL-06** | 20 official 2022 sectors, no 41 or 91 | ✅ | `SetupWizardNaicsModal.jsx:35-58` — SECTORS array has 21 entries (1 "All" + 20 sectors). Sector codes: 11, 21, 22, 23, 31-33 (3 codes), 42, 44-45 (2), 48-49 (2), 51, 52, 53, 54, 55, 56, 61, 62, 71, 72, 81, 92. No 41 or 91. The merged labels (e.g. "31-33 Manufacturing") are display-only; the underlying data uses 2-digit codes 31/32/33/44/45/48/49 to match the JSON's `sector_code` values (24 unique sector codes in the data, 20 sectors in the UI). |

**19/19 verified by code reading + structural checks.**

---

## Spec drift notes

None. Implementation matches:
- TASK-b2a-wizard-b.md §1 (state machine, persistence, defaults)
- TASK-b2a-wizard-b.md §2 (Step 1 — headline, sub, reassurance, CTA)
- TASK-b2a-wizard-b.md §3 (Step 2 — subheaders, fields, validation, Skip↔Revert)
- TASK-b2a-wizard-b.md §4 (NAICS modal — search debounce, sector filter, selected display, Esc + backdrop close, Cancel-only footer)
- TASK-b2a-wizard-b.md §5 (file list — exactly the 6 files touched)
- WIREFRAMES.html `renderSetup()` step 2 layout (2-column grid with kicker subheaders)

Minor wireframe-vs-React alignment note (NOT drift): the wireframe uses inline `oninput` mutation of a global `state.setup` object; the React version uses controlled inputs with `updateSetup` patches. Same behavior, different mechanism. Standard wireframe-to-React translation.

---

## Out-of-scope findings

These are observed but not in scope for B2a-wizard-B:

1. **`useSetupGate` re-fetch on wizard completion** — Wren B2a-wizard-A NIT M-02. The `setupCompletedAt` column lands in B2b; once it does, BooksShell needs to re-fetch `getCurrentBusiness` after the wizard's final POST so the first-run → ready transition fires. Already documented as a TODO in source. **Lands in B2b.**

2. **Welcome-back panel is unreachable until B2b** — `if (state.setupCompletedAt)` branch in `SetupWizard.jsx:188-205` is correct and unit-testable, but `setupCompletedAt` stays `null` until B2b's final POST sets it. The branch is dead code in B2a-wizard-B but harmless and activates naturally when B2b lands. **Lands in B2b.**

3. **Settings.jsx uncommitted diff** — observed in `git status`. Not Cinder's commit; not in scope for this review per the brief. Belongs to B1 round 1. **Separate review when that commit lands.**

4. **Schema versioning on localStorage payload** — see F5. Not required for B2a-wizard-B but worth introducing in B2b since B2b adds more fields to the state shape. **Lands in B2b or later.**

---

## Cross-cutting checks

- **Wireframe smoke:** `node docs/books/setup-wizard/tests/wf-smoke.mjs` → **255/255 passed.** No regression.
- **BooksShell routes:** `/books/setup` → `SetupWizard` confirmed at `BooksShell.jsx:177-178`. BooksShell also handles the `/books/setup` first-run + error states (sidebarless layout) at `:262-275` and `:280-294` respectively.
- **API surface:** `validateEinFormat` is exported from SetupWizard.jsx and imported by SetupWizardBusinessInfo.jsx. No other cross-file coupling.
- **NAICS data integrity:** 1,012 codes, 24 unique sector codes (20 sectors with splits), no duplicates, all 6-digit, schema matches spec.
- **Dark-mode chrome:** all components use slate-700/800/900 palette consistent with the rest of BooksShell. Verified by reading the className strings.

---

## Recommendations for B2b

(Beyond B2a-wizard-B scope, listed for the next builder's convenience.)

1. Add a `schemaVersion` integer to the wizard state and migrate or discard on mismatch.
2. Re-fetch `getCurrentBusiness` in `useSetupGate` after the wizard's final POST so the sidebar appears.
3. Decide whether "Clear" in the NAICS modal should keep the modal open (so the user can re-pick) or close it (current behavior). See F4.
4. When B2b lands Steps 3-6, the parent `setupDirty` semantics may want tightening — see F1/F3.

---

## Definition of done (Wren side)

- [x] State machine + localStorage persistence reviewed
- [x] Step 1 Welcome reviewed
- [x] Step 2 BusinessInfo reviewed (all fields, validation, Skip/Revert)
- [x] NAICS modal reviewed (search, sector filter, selected display, Esc, footer)
- [x] Progress dots reviewed (no click-to-jump)
- [x] Steps 3-6 placeholder reviewed (Back/Skip/Save + disabled finish on Step 6)
- [x] NAICS data verified (1,012 codes, 20 sectors)
- [x] Wireframe smoke still 255/255
- [x] Cross-file imports clean (`validateEinFormat` exported once, imported once)
- [x] BooksShell routes `/books/setup` to SetupWizard
- [x] No BLOCKER, no SIGNIFICANT findings

---

*End of report.*
