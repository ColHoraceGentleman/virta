# TASK — B2b-1: Setup Wizard Steps 3-5 (Contact, Accounting method, Timeline)

**Status:** RESUMING — B2a done. B2b split into B2b-1 (this, Steps 3-5) and B2b-2 (Step 6 edit-on-review + final POST).
**Phase:** v2 Setup Wizard — first half of B2b
**Author:** Rusty
**Date:** 2026-07-13 21:55 MDT
**Branch:** `main`

---

## Why this is split from B2b-2

B2b scope (Steps 3-6 + edit-on-review + final POST + chaining to Categories Wizard) is too big for one Cinder round given the upstream ~5min model budget. B2b-1 covers the form-heavy steps (3-5); B2b-2 covers the review + final POST (more complex, edit-on-review pattern + state machine finalization).

---

## Prerequisites

B2a is on disk:
- B2a-wizard-A: sidebar + Dashboard first-run (`984c223`)
- B2a-wizard-B: wizard Steps 1-2 + NAICS modal (`5de5cef`, Wren ✅ SHIP)
- B2a-prime server foundation: `POST /businesses`, `PATCH /businesses/current`, `GET /businesses/current`, `GET /settings`, `PUT /settings/:key`
- DB schema: `businesses` table (id, proprietor_name, business_name, trade_name, business_description, naics_code, address_line1/2, city, state, postal, country, ein, accounting_method, fiscal_year_start_month, business_started_on, business_type, currency, created_at, updated_at)
- `accounts` CHECK constraint: `irs_line IS NOT NULL` unless `name = 'Review Later'`

**Read these reports first:**
- `CINDER_REPORT_b2a-prime.md` (server foundation)
- `CINDER_REPORT_b2a-prime-fixups.md` (NAICS + API hygiene)
- `CINDER_REPORT_b2a-wizard-a.md` (sidebar + Dashboard)
- `CINDER_REPORT_b2a-wizard-b.md` (wizard Steps 1-2 + NAICS modal)

---

## Scope of THIS build (B2b-1 only)

### 1. Step 3 — Contact

Per `SETUP_AND_CATEGORIES.md` §6 Step 3.

| Field | Type | Notes |
|---|---|---|
| Street address | text | |
| Street address 2 | text | optional |
| City | text | |
| State | text | dropdown — 50 US states + DC |
| ZIP | text | 5-digit or 5+4 format |

- Skip behavior: all fields blank. Label "Skip" until dirty, "Revert to Defaults" after.
- Save & continue → Step 4. Persist to localStorage.
- No server write yet — final POST lands in B2b-2.

### 2. Step 4 — Accounting method

Per `SETUP_AND_CATEGORIES.md` §6 Step 4.

- **Accounting method** radio: Cash (selected by default), Accrual (greyed out with tooltip "Available in a future version").
- Helper text under radios: "Most sole proprietorships use cash accounting — recording money when it actually moves. You can change this later in Settings, but it affects how every transaction is recorded."
- Skip behavior: defaults to `cash`. Label "Skip" until dirty (any non-default selection), "Revert to Defaults" after.
- Save & continue → Step 5.

### 3. Step 5 — Timeline

Per `SETUP_AND_CATEGORIES.md` §6 Step 5.

| Field | Type | Notes |
|---|---|---|
| Fiscal year starts | dropdown (month, 1-12) | Default January (1). Helper: "Most small businesses use the calendar year (Jan 1 – Dec 31). If you track your finances on a different cycle, change it here." |
| When did your business start? | date (text input) | Optional. |

- Skip behavior: defaults to January 1. Label "Skip" until dirty, "Revert to Defaults" after.
- Save & continue → Step 6.

### 4. Files to touch

- `client/src/books/SetupWizardContact.jsx` (new) — Step 3 component
- `client/src/books/SetupWizardAccounting.jsx` (new) — Step 4 component
- `client/src/books/SetupWizardTimeline.jsx` (new) — Step 5 component
- `client/src/books/SetupWizard.jsx` — replace Step 3-5 placeholder branches with the new components; remove Step 6 placeholder (Step 6 lands in B2b-2 as a placeholder for now since B2b-2 will rebuild it as a real component — leave B2b-1's Step 6 as the current placeholder).

### 5. State machine preservation

The `setup` object in DEFAULT_STATE already has the B2b fields:
```
address_line1, address_line2, city, state, postal,
accounting_method, fiscal_year_start_month, business_started_on
```

`revertSetupToDefaults()` already preserves these untouched when Step 2 reverts (correct — Step 2 doesn't own these fields). Steps 3-5 each need their own "isDirty" check that mirrors the Step 2 pattern:

```js
// Step 3 fields
const STEP3_FIELDS = ['address_line1', 'address_line2', 'city', 'state', 'postal'];
function isStep3Dirty(setup) {
  return STEP3_FIELDS.some((f) => setup[f] && String(setup[f]).length > 0);
}
```

And similar for Step 4 (`accounting_method !== 'cash'`) and Step 5 (`fiscal_year_start_month !== 1 || business_started_on`).

For Steps 4 + 5, "revert to defaults" only changes the field on the current step, not all earlier steps. The pattern:
- `handleSkipOrRevert()` for Step 4: if dirty (non-cash), set accounting_method='cash'; advance to step 5.
- For Step 5: if dirty, set fiscal_year_start_month=1, business_started_on=''; advance to step 6.

### 6. US states list

50 US states + DC + (optionally) territories. Hardcode in the Step 3 component or in a small `us-states.js` helper file. Recommended: `client/src/books/us-states.js` exporting an array of `{code, name}` objects.

### 7. Don't break

- B1a Transactions polish
- B1a Categories CRUD
- B2a-wizard-A sidebar + Dashboard
- B2a-wizard-B Steps 1-2 + NAICS modal
- The 7 NITs from Wren B2a-wizard-B (don't fix in this build; most defer to B2b-2 or future)
- The NAICS modal (F4 — Clear keeps modal open — was flagged by Wren B2a-wizard-B. **DO NOT FIX IN THIS BUILD.** F4 lives in B2b-2's review, not B2b-1. Don't expand scope.)
- Wireframe smoke (255/255)
- The uncommitted `Settings.jsx` diff from B1 round 1

---

## Build behaviors (Test coverage)

| Behavior ID | Name | Verifies |
|---|---|---|
| VB-WIZ-STEP3-01 | Step 3 renders Contact fields with US state dropdown | ✓ |
| VB-WIZ-STEP3-02 | Step 3 Save persists to localStorage + advances to Step 4 | ✓ |
| VB-WIZ-STEP3-03 | Step 3 Skip clears all fields and advances | ✓ |
| VB-WIZ-STEP3-04 | Step 3 has 50 US states + DC in the dropdown | ✓ |
| VB-WIZ-STEP4-01 | Step 4 renders Cash (selected) + Accrual (greyed) radios | ✓ |
| VB-WIZ-STEP4-02 | Accrual tooltip "Available in a future version" shows on hover | ✓ |
| VB-WIZ-STEP4-03 | Step 4 Skip defaults to Cash and advances | ✓ |
| VB-WIZ-STEP4-04 | Step 4 helper text matches spec | ✓ |
| VB-WIZ-STEP5-01 | Step 5 renders Fiscal year + business start date fields | ✓ |
| VB-WIZ-STEP5-02 | Fiscal year dropdown defaults to January | ✓ |
| VB-WIZ-STEP5-03 | Business start date is optional | ✓ |
| VB-WIZ-STEP5-04 | Step 5 Save persists + advances | ✓ |
| VB-WIZ-STEP6-STILL-PLACEHOLDER | Step 6 still renders "Coming in B2b-2" placeholder (B2b-2 lands the real Step 6) | ✓ |
| VB-WIZ-ROUTE-01 | `/books/setup` still works | ✓ |
| VB-WIZ-PERSIST-04 | All 7 fields across Steps 1-5 persist in localStorage | ✓ |

---

## Definition of done

- [ ] Read prior build reports.
- [ ] Steps 3, 4, 5 render with full field validation + skip/revert.
- [ ] Step 6 still placeholder (B2b-2 builds the real one).
- [ ] All 15 behavior IDs verified.
- [ ] No demo (deferred per B2a Protocol amendment).
- [ ] Committed.
- [ ] CINDER_REPORT_b2b-1.md written (Rusty writes post-hoc if Cinder times out).

## When done

Push completion event with:
- 2-line summary
- Commit hash
- Anything to flag for Wren
- Any out-of-scope findings

## Hard rules

- Don't touch Transactions.jsx, Categories.jsx, BooksShell.jsx, Dashboard.jsx, Settings.jsx.
- Don't fix Wren B2a-wizard-B NITs in this build (F4 = B2b-2 review; others defer).
- Don't push to origin.
- No sub-agent spawns.
- Visual check in dark mode.

---

## Why this is a focused build

~250-300 lines of new code (3 step components + 1 small helper file + the SetupWizard.jsx dispatcher updates). Smaller than B2a-wizard-B (1,032 lines), should fit in one Cinder round comfortably.
