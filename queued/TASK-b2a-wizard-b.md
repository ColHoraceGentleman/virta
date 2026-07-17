# TASK — B2a-wizard-B: SetupWizard Steps 1-2 + NAICS modal

**Status:** RESUMING — B2a-wizard-A done. Server foundation done. UI half of B2a is the wizard Steps 1-2 plus NAICS modal.
**Phase:** v2 Setup Wizard — second half of B2a UI (Steps 1-2)
**Author:** Rusty
**Date:** 2026-07-13 19:51 MDT
**Branch:** `main`

---

## Why this is split from B2a-wizard-A

The full B2a UI build was split per §5.11 cadence — small Cinder rounds to fit the upstream ~5min model budget. B2a-wizard-A handled chrome (sidebar + Dashboard state). B2a-wizard-B handles the actual wizard Steps 1-2 UI plus the NAICS modal.

**B2b** (separate brief) covers Steps 3-6 + edit-on-review + final POST. Do NOT touch B2b scope.

---

## Prerequisites

B2a-wizard-A is on disk:
- `client/src/books/BooksShell.jsx` — sidebar 4-link + `useSetupGate()`
- `client/src/books/Dashboard.jsx` — first-run experience
- Commit `984c223`

B2a-prime server foundation is live:
- `POST /businesses`, `GET /businesses/current`, `PATCH /businesses/current`
- `GET /settings`, `PUT /settings/:key`
- `GET /businesses/current` returns 200 with `{data: <row>}` when row exists; 404 when not

Cinder already wrote `SetupWizard.jsx` as a stub (still in place; do NOT overwrite without reading).

---

## Scope of THIS build (B2a-wizard-B only)

### 1. Wizard state machine

Per `SETUP_AND_CATEGORIES.md` §5.1 + §5.3. Wizard state lives in `localStorage` under `virta_books:wizard:setup:state`.

State shape (Steps 1-2 only — Steps 3-6 are B2b):

```js
{
  setupStep: 1,                    // 1, 2 (current)
  setup: {
    proprietor_name: '',           // Step 2
    business_name: '',             // Step 2
    trade_name: '',                // Step 2
    business_description: '',      // Step 2
    naics_code: '',                // Step 2 (6-digit string)
    naics_title: '',               // display-only, not persisted
    ein: '',                       // Step 2
    address_line1: '',             // B2b (Step 3)
    address_line2: '',             // B2b (Step 3)
    city: '',                      // B2b (Step 3)
    state: '',                     // B2b (Step 3)
    postal: '',                    // B2b (Step 3)
    accounting_method: 'cash',     // B2b (Step 4)
    fiscal_year_start_month: 1,    // B2b (Step 5)
    business_started_on: '',       // B2b (Step 5)
  },
  setupDirty: false,
  setupCompletedAt: null,
}
```

Behavior:
- On every state change, debounce-write to `localStorage` (250ms).
- On mount of `/books/setup`, hydrate from `localStorage`. If `setupCompletedAt` is set, render "Welcome back — your setup is complete. [Restart] [Continue to Books]" instead of the welcome screen.
- For B2a-wizard-B, Steps 3-6 are placeholders. Step 3 says "Coming in B2b" with a Back button. Steps 4-6 similarly.
- Skip behavior:
  - Step 1: no skip (intro).
  - Step 2: skip = all fields blank. Label: "Skip" until dirty, then "Revert to Defaults".

### 2. Step 1 — Welcome

Per §6 Step 1. Full-screen explainer:

- **Headline:** "Let's set up your books."
- **Sub-headline:** "We'll ask for the same basic info that's on the Schedule C of your IRS Form 1040 — the tax form sole proprietors file. This makes year-end tax filing much easier."
- **Reassurance line:** "Most people finish in under 5 minutes. You can change anything later."
- **CTA:** "Get started →" → advances to Step 2.

No preview bullets, no "Up next" hint.

### 3. Step 2 — Basic business info (merged)

Per §6 Step 2. Two subheaders:

**"About you" subheader:**
- Your name (text, required to advance)
- What does your business do? (textarea, max 280 chars, counter when > 200)

**"About your business" subheader:**
- Business name (text)
- Trade name (text, optional, helper: "Distinct from your business name, if you use one.")
- Industry code (NAICS) — picker, optional. Triggers NAICS modal (Part 4).
- EIN (text, optional, soft format validation only)

Field-level validation:
- "Your name" required (visible error under field on Save attempt).
- "Business name" not required.
- "EIN" — soft format `/^\d{2}-?\d{7}$/` check; non-blocking warning on bad input.
- Description counter when > 200 chars.

Save & continue persists to localStorage and advances to Step 3 placeholder. Skip clears all fields and advances.

### 4. NAICS modal

Per §6A. Bundled data: `client/src/assets/naics-2022.json` (1,012 codes, 20 official 2022 sectors, real US Census source).

- Triggered by clicking the "Industry code (NAICS)" field in Step 2.
- Modal chrome: same as existing Books modals (sticky footer, max-height 90vh, dark theme).
- **Search box** at top, autofocus. 200ms debounce. Type to filter by keyword (case-insensitive substring on title + keywords). Show "No matches" when zero results.
- **Sector filter** on left: 2-digit sectors. Default "All". Click to narrow to that sector.
- **Result list** below search, scrollable. Each row shows 6-digit code + official title. Hover state. Click → code written to field, modal closes.
- **Selected code display** at top of modal: when a code is already selected, show "Selected: 111110 Soybean Farming" with an "X" to clear.
- **Footer:** single "Cancel" button (no Save — selection closes the modal).

Sector list (20 official 2022 sectors):
- 11 Agriculture, Forestry, Fishing and Hunting
- 21 Mining, Quarrying, and Oil and Gas Extraction
- 22 Utilities
- 23 Construction
- 31-33 Manufacturing
- 42 Wholesale Trade
- 44-45 Retail Trade
- 48-49 Transportation and Warehousing
- 51 Information
- 52 Finance and Insurance
- 53 Real Estate and Rental and Leasing
- 54 Professional, Scientific, and Technical Services
- 55 Management of Companies and Enterprises
- 56 Administrative and Support and Waste Management
- 61 Educational Services
- 62 Health Care and Social Assistance
- 71 Arts, Entertainment, and Recreation
- 72 Accommodation and Food Services
- 81 Other Services (except Public Administration)
- 92 Public Administration

### 5. Files to touch

- `client/src/books/SetupWizard.jsx` — full rewrite. Step 1, Step 2, step placeholder for 3-6, state machine + persistence + Skip/Revert.
- `client/src/books/SetupWizardWelcome.jsx` (new) — Step 1 component.
- `client/src/books/SetupWizardBusinessInfo.jsx` (new) — Step 2 component.
- `client/src/books/SetupWizardStepPlaceholder.jsx` (new) — Step 3-6 placeholder card ("Coming in B2b").
- `client/src/books/SetupWizardNaicsModal.jsx` (new) — the NAICS modal.
- `client/src/books/SetupWizardProgress.jsx` (new) — progress dots shared.

### 6. Don't break

- B1a Transactions polish
- B1a Categories CRUD
- B2a-prime server foundation
- B2a-wizard-A sidebar + Dashboard first-run experience
- Wireframe smoke (255/255)
- The uncommitted `Settings.jsx` modification (don't touch)
- The `_stub-template.jsx` file

---

## Build behaviors (Test coverage)

| Behavior ID | Name | Verifies |
|---|---|---|
| VB-WIZ-ROUTE-01 | `/books/setup` route renders SetupWizard | ✓ |
| VB-WIZ-PERSIST-01 | Wizard state persists to localStorage on every change (debounced 250ms) | ✓ |
| VB-WIZ-PERSIST-02 | Wizard state hydrates from localStorage on mount | ✓ |
| VB-WIZ-PERSIST-04 | Step 1 + Step 2 fields persist in localStorage | ✓ |
| VB-WIZ-STEP1-01 | Step 1 renders Welcome headline + Schedule C sub-headline + CTA | ✓ |
| VB-WIZ-STEP1-02 | Step 1 CTA advances to Step 2 | ✓ |
| VB-WIZ-STEP2-01 | Step 2 renders "About you" + "About your business" subheaders | ✓ |
| VB-WIZ-STEP2-02 | "Your name" required to advance; error message under field on attempt | ✓ |
| VB-WIZ-STEP2-03 | "EIN" soft-validates format; warning shown on bad input but doesn't block save | ✓ |
| VB-WIZ-STEP2-04 | Description textarea shows character counter when > 200 chars | ✓ |
| VB-WIZ-STEP2-05 | Skip button label changes to "Revert to Defaults" after any field touched | ✓ |
| VB-WIZ-STEP2-06 | Step 2 Save persists to localStorage and advances to Step 3 placeholder | ✓ |
| VB-WIZ-STEP3-PLACEHOLDER | Step 3 renders "Coming in B2b" placeholder card with Back button | ✓ |
| VB-NAICS-MODAL-01 | NAICS modal opens from "Industry code (NAICS)" field click | ✓ |
| VB-NAICS-MODAL-02 | Search filters results by keyword (case-insensitive) | ✓ |
| VB-NAICS-MODAL-03 | Sector filter narrows results | ✓ |
| VB-NAICS-MODAL-04 | Clicking a result writes the code to the field and closes the modal | ✓ |
| VB-NAICS-MODAL-05 | Bundled JSON contains 1,000+ 6-digit codes from US Census 2022 | ✓ |
| VB-NAICS-MODAL-06 | Sector filter shows 20 official 2022 sectors (no 41 or 91) | ✓ |

---

## Definition of done

- [ ] Read existing SetupWizard.jsx stub before overwriting.
- [ ] Wizard state machine + localStorage persistence working.
- [ ] Step 1 + Step 2 with all field validation + Skip/Revert.
- [ ] Step 3-6 placeholders rendered.
- [ ] NAICS modal working (search, filter, select, close).
- [ ] All 19 behavior IDs verified.
- [ ] Demo recorded: `demos/2026.07.13-b2a-wizard-b.mp4` (silent 6-9 min walkthrough: Step 1 → Step 2 → fill form → NAICS modal → save → land on Step 3 placeholder).
- [ ] Committed.
- [ ] CINDER_REPORT_b2a-wizard-b.md written.

## When done

Push completion event with:
- 2-line summary
- Commit hash
- Demo path
- Anything to flag for Wren
- Any out-of-scope findings

## Hard rules

- Don't touch Transactions.jsx, Categories.jsx, BooksShell.jsx, Dashboard.jsx, Settings.jsx.
- Don't push, no sub-agent spawns.
- Visual check in dark mode.

## Why this is a focused build

~500 lines of new code (one wizard component family + state machine + NAICS modal). Bigger than A but smaller than the original B2a; should fit in one Cinder round. If you finish in <5 min, stop and report done.
