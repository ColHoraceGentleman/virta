# CINDER_REPORT_b2b-1.md

**Status:** DONE
**Build:** B2b-1 — Setup Wizard Steps 3-5 (Contact, Accounting method, Timeline)
**Date:** 2026-07-13 22:20 MDT
**Branch:** `main` (local only — not pushed)
**Commit:** _set by `git commit` after this report is written_
**Builder:** Cinder (round 2 of B2a/B2b; first round for B2b-1)

---

## Summary

Steps 3, 4, 5 of the Setup Wizard — Contact (address fields + US state dropdown), Accounting method (Cash + greyed Accrual), Timeline (FY month + business start date) — ship as real React components. Each step matches the Step 2 pattern: dirty detection, "Skip ↔ Revert to Defaults" label flip, debounced localStorage persistence (already in the parent), and a `data-testid` for every testable affordance. Step 6 is **still the placeholder** (B2b-2 builds the real Review & create + final POST). The parent `SetupWizard.jsx` dispatcher now routes Steps 3-5 to the new components and keeps Step 6 on the placeholder.

Total: 4 new files + 1 modified file. ~650 lines of new code. All 15 behavior IDs from the brief verified end-to-end via a Playwright-style Chrome DevTools Protocol QA harness (`server/scripts/qa-b2b-1.mjs`). Wireframe smoke still 255/255.

---

## Files

| File | Status | Lines | What |
|---|---|---|---|
| `client/src/books/SetupWizardContact.jsx` | new | 222 | Step 3 — address fields + US state dropdown + ZIP soft-validation |
| `client/src/books/SetupWizardAccounting.jsx` | new | 161 | Step 4 — Cash/Accrual radios (Accrual disabled with tooltip) |
| `client/src/books/SetupWizardTimeline.jsx` | new | 152 | Step 5 — fiscal year dropdown + business start date |
| `client/src/books/us-states.js` | new | 67 | 50 US states + DC as `{code, name}` array |
| `client/src/books/SetupWizard.jsx` | modified | 322 (+2) | Dispatcher now routes steps 3-5 to new components; step 6 stays on placeholder |
| `server/scripts/qa-b2b-1.mjs` | new | — | QA harness (Chrome DevTools Protocol) — 15 behavior IDs verified |
| `demos/2026.07.13-b2b-1/*.png` | new | — | 6 dark-mode screenshots as visual verification (no video, per brief) |

---

## Behavior verification (15/15 passed)

Driven by `server/scripts/qa-b2b-1.mjs`. Chrome headless, wipes localStorage, walks the wizard, asserts each behavior ID against the live DOM + localStorage.

| ID | Verifies | Status |
|---|---|---|
| **VB-WIZ-ROUTE-01** | `/books/setup` renders SetupWizard | ✅ Step 1 CTA present after clean reload |
| **VB-WIZ-STEP3-01** | Step 3 renders Contact fields + US state dropdown | ✅ All 5 fields + 3 CTAs present |
| **VB-WIZ-STEP3-04** | State dropdown has 50 US states + DC | ✅ count=51, hasDC=true, all unique |
| **VB-WIZ-STEP3-02** | Step 3 Save persists + advances to Step 4 | ✅ All 4 fields persisted in localStorage; onStep4=true |
| **VB-WIZ-STEP3-03** | Step 3 Skip clears all fields + advances | ✅ On skip with dirty state, all 5 contact fields cleared, advances to step 4 |
| **VB-WIZ-STEP4-01** | Step 4 Cash selected + Accrual greyed | ✅ 2 radios, cash checked+enabled, accrual disabled |
| **VB-WIZ-STEP4-02** | Accrual tooltip "Available in a future version" | ✅ wrapper title=✓ + "Coming later" pill text |
| **VB-WIZ-STEP4-04** | Helper text matches spec | ✅ "Most sole proprietorships…" + "You can change this later in Settings" |
| **VB-WIZ-STEP4-03** | Step 4 Skip defaults to Cash, advances | ✅ Skip → step 5, accounting_method='cash' |
| **VB-WIZ-STEP5-01** | Step 5 FY + business start date fields | ✅ All 5 affordances present |
| **VB-WIZ-STEP5-02** | FY dropdown defaults to January | ✅ value=1, 12 month options |
| **VB-WIZ-STEP5-03** | Business start date is optional | ✅ Blank save still advances to step 6 |
| **VB-WIZ-STEP5-04** | Step 5 Save persists + advances | ✅ FY=7 + start='2025-01-15' persisted in localStorage |
| **VB-WIZ-STEP6-STILL-PLACEHOLDER** | Step 6 still placeholder | ✅ "Coming in B2b" pill + "Review & create" + "Finish setup (in B2b)" |
| **VB-WIZ-PERSIST-04** | Steps 1-5 fields persist in localStorage | ✅ proprietor_name + accounting_method + fiscal_year_start_month + business_started_on all restored on reload |

**Cross-cutting:**
- `node docs/books/setup-wizard/tests/wf-smoke.mjs` → **255/255** ✅
- Dark mode visual check: 6 screenshots captured at 1280×1100 (Steps 3, 4, 5, 5-filled, 6, 3-filled) — all match spec

---

## Design decisions

### 1. Revert-to-Defaults ownership

The parent `SetupWizard.jsx` has a `revertSetupToDefaults` callback that resets **Step 2** fields and preserves B2b fields untouched. In B2a-wizard-B that was the only step that needed it, so it lived in the parent.

For Steps 3-5, the spec is explicit: "Revert to Defaults" on Step 4 should only reset Step 4's `accounting_method`, not all earlier steps' fields. Calling the parent's `revertSetupToDefaults` from Step 4 would actually clear Step 2 fields too (since it spreads `DEFAULT_STATE.setup` which has Step 2 fields = '').

**Resolution:** Steps 3, 4, 5 each handle their own revert locally via `updateSetup` with step-specific field defaults. The parent's `revertSetupToDefaults` is **Step-2-specific** (now documented in code). Steps 3, 4, 5 don't take `revertSetupToDefaults` as a prop.

Comment in the parent at `SetupWizard.jsx:163-167`:
> "Steps 3-5 each handle their own revert locally via updateSetup so they only clear the fields they own. The parent's revertSetupToDefaults is Step-2-specific."

### 2. Step 4 dirty check (future-proof)

Step 4's `isStep4Dirty()` returns true if `accounting_method !== 'cash'`. In v1 the Accrual radio is disabled, so the user can never select a non-default value — the dirty branch is dead code. The check is kept so when B2c / v2 / whoever enables Accrual, the "Revert to Defaults" label flip works automatically with no logic change.

### 3. ZIP soft-validation (Step 3)

Per spec, ZIP is "5-digit or 5+4 format." Soft warning (amber border + helper text) on bad input, never a block — same pattern as Step 2's EIN.

### 4. Step 6 placeholder text

The placeholder copy says "This step lands in **B2b — Setup Wizard completion**." I considered updating it to say "B2b-2" (the new split) but kept "B2b" because the placeholder file is shared with the B2a-wizard-B build and the wording is still accurate (B2b-2 is part of B2b). Wren's B2a-wizard-B report also used "B2b" as the future-round label. If the team prefers "B2b-2" explicitly, it's a one-line edit in `SetupWizardStepPlaceholder.jsx` — flag for Wren.

### 5. US states list

Hardcoded in `client/src/books/us-states.js` as `{code, name}` objects. Alphabetical by name. DC at the end. 51 total. Reusable for B5 Settings or any future US state selector.

### 6. Visual chrome

All three steps follow the same dark-mode slate-700/800/900 palette as the rest of BooksShell. Step 4 has radio cards with a "selected" border (indigo-500/60) so the user can see at a glance which option is picked. Step 4's Accrual card uses opacity-60 + cursor-not-allowed + the "Coming later" pill to make the disabled state obvious without being ambiguous.

---

## Out-of-scope findings

1. **B2a-wizard-B QA harness is now stale.** `server/scripts/qa-b2a-wizard-b.mjs` has 2 behavior IDs that expected Step 3 to be a placeholder (VB-WIZ-STEP2-06 "advances to Step 3 placeholder" and VB-WIZ-STEP3-PLACEHOLDER "Step 3 placeholder renders with Back"). Step 3 is no longer a placeholder, so those 2 IDs fail. The other 17 IDs in that harness still pass. **Not in scope for B2b-1** — it's a follow-up to update the B2a-wizard-B harness. The B2a-wizard-B *implementation* is correct; the *test* is just dated.

2. **Welcome-back panel is still unreachable.** `if (state.setupCompletedAt)` branch in SetupWizard.jsx activates only after the wizard's final POST sets `setupCompletedAt`. B2b-2 will land that POST. Documented as an existing observation (was also flagged in CINDER_REPORT_b2a-wizard-b.md and WREN_REPORT_b2a-wizard-b.md as "lands in B2b").

3. **No schema versioning on localStorage payload.** This was F5 in Wren B2a-wizard-B — recommended for B2b. **Lands in B2b-2** when the final POST lands and the state shape is touched again. Not in scope for B2b-1.

4. **useSetupGate re-fetch on wizard completion.** Wren B2a-wizard-A NIT M-02 — lands in B2b-2. Not in scope for B2b-1.

5. **Settings.jsx uncommitted diff.** Still present, still not in scope. (Pre-existing observation from B1 round 1; Cinder doesn't touch it.)

6. **F4 (NAICS modal "Clear" behavior).** Wren B2a-wizard-B NIT — **deferred to B2b-2 review**, per the task brief. Not touched in B2b-1.

---

## Hard scope compliance

| Rule | Status |
|---|---|
| Don't touch Transactions.jsx, Categories.jsx, BooksShell.jsx, Dashboard.jsx, Settings.jsx | ✅ Unchanged in this commit |
| Don't fix Wren B2a-wizard-B NITs in this build | ✅ F4 deferred to B2b-2 per brief; others already in B2b-2 scope or out-of-scope findings |
| Don't build Step 6 | ✅ Still placeholder (SetupWizardStepPlaceholder.jsx) |
| Don't edit the NAICS modal | ✅ Unchanged |
| Don't push to origin | ✅ Local commit only |
| Don't spawn sub-agents | ✅ No sub-agents spawned |
| Visual check in dark mode | ✅ 6 screenshots captured at 1280×1100 |
| Wireframe smoke 255/255 | ✅ Confirmed |
| `trash` > `rm` | ✅ No `rm` of user files |
| B1a polish + B1a Categories CRUD untouched | ✅ Confirmed |

---

## Definition of done

- [x] Read prior reports (CINDER_REPORT_b2a-prime.md, CINDER_REPORT_b2a-wizard-a.md, CINDER_REPORT_b2a-wizard-b.md, WREN_REPORT_b2a-wizard-b.md)
- [x] Read existing SetupWizard.jsx to understand dispatcher pattern
- [x] 3 step components built matching the B2a-wizard-B style
- [x] us-states.js helper file
- [x] SetupWizard.jsx updated to wire Steps 3-5 into dispatcher; Step 6 still placeholder
- [x] Skip ↔ Revert to Defaults label flip on all 3 steps
- [x] "isDirty" detection per step (Step 3 = any of 5 fields; Step 4 = non-cash; Step 5 = non-Jan or non-empty start date)
- [x] All 15 behavior IDs verified via Playwright-style Chrome DevTools Protocol harness
- [x] Wireframe smoke still 255/255
- [x] Visual check in dark mode (6 screenshots)
- [x] No demo (deferred to Rusty per B2a Protocol amendment)
- [x] Committed (next step)
- [x] CINDER_REPORT_b2b-1.md written

---

## Demo

**None recorded per build** (per B2a Protocol amendment — demo recording moved to Rusty post-Cinder-commit, decoupled from build step, batched at protocol end). Rusty will record B2b-1 alongside B1a + B2a + B2b-2 in a single batch at protocol completion.

Visual verification: 6 dark-mode screenshots in `demos/2026.07.13-b2b-1/` (step3-contact, step3-contact-filled, step4-accounting, step5-timeline, step5-timeline-filled, step6-placeholder).

---

*End of report.*
