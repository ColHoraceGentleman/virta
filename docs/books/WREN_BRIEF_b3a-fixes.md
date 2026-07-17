# Wren Review Brief — B3a-fixes (NEEDS-FIX re-review)

**Reviewer:** Wren
**Build under review:** B3a NEEDS-FIX round — fixes for SIGNIFICANT-1 + SIGNIFICANT-2 from `WREN_REPORT_b3a.md`
**Builder:** Cinder (sonnet-5)
**Date:** 2026-07-17 12:58 MDT (Rusty, ad-hoc)
**Commits under review:** `ea7836e`, `1ab7a47`
**Report under review:** `CINDER_REPORT_b3a-fixes.md`
**Spec source of truth:** `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md` §7 Steps 1-3, §10 defaults
**Prior review:** `WREN_REPORT_b3a.md` (2026-07-14 15:30 MDT, NEEDS-FIX)

---

## What this round is

Your prior review (`WREN_REPORT_b3a.md`) flagged 2 SIGNIFICANT + 1 NIT on B3a. Cinder's B3a-fixes round (`CINDER_REPORT_b3a-fixes.md`) addresses both SIGNIFICANTs and defers the NIT per your own recommendation. This brief asks you to verify the fixes actually resolve the SIGNIFICANTs (no regressions, no new SPEC violations), not to re-review the entire B3a surface.

**Scope is narrow by design.** The chain is waiting on a SHIP verdict to advance to B3b. Don't re-litigate anything from your prior review that wasn't flagged NEEDS-FIX.

---

## What to verify

### A. SIGNIFICANT-1: System-account Hide/Delete guard

**Original finding (from your prior report):** Review Later (`acc.system === true`) was deletable and hideable in `CategoriesWizardExpensesStep.jsx`. Spec §7 Step 5 says Review Later is a system category — user cannot rename/delete/merge.

**Cinder's fix (commit `ea7836e`):**
- Both Hide button and Delete button (or the delete-disabled span) in `CategoriesWizardExpensesStep.jsx` now gate on `acc.system` first.
- System rows render a disabled `<span>` with `title="Review Later can't be hidden or deleted."` — matches the existing rename-guard visual treatment (muted text + `cursor-not-allowed` + tooltip).
- Mirror not invented; uses the same pattern as the rename guard.

**Verify:**
1. Read the diff: `git diff ea7836e^..ea7836e -- client/src/books/CategoriesWizardExpensesStep.jsx`
2. Live probe: navigate to `/books/categories/wizard` → Step 2 (Expenses). Find Review Later (the top row, system badge should be visible). Confirm:
   - Hide button → renders disabled `<span>` with the exact tooltip text "Review Later can't be hidden or deleted."
   - Delete button → renders disabled `<span>` with the same tooltip text.
   - Clicking the spans does nothing (no modal, no state change).
   - The exact tooltip string matches the commit's intent.
3. **Negative test:** pick a non-system row (e.g. "Advertising") and confirm Hide + Delete still work normally — no over-zealous guard that locks everything.
4. Confirm no visual regression — screenshot at `demos/2026.07.14-b3a-fixes/step2-review-later-guard.png` should show Review Later row with the disabled controls visible.

### B. SIGNIFICANT-2: `DEFAULT_EXPENSES` / `DEFAULT_INCOME` §10 alignment

**Original finding:** 21 of 23 default expense rows diverged from spec §10's canonical table — names, codes, and IRS line values all differed. The shipped data was a different, self-consistent but non-canonical scheme.

**Cinder's fix (commit `1ab7a47`):**
- `DEFAULT_EXPENSES` replaced with the exact §10 transcription (23 rows verbatim).
- `DEFAULT_INCOME` audited against §10's Income table — Cinder reports it was already an exact match (no code change needed; comment added documenting the audit).
- `IRS_LINE_OPTIONS` in `CategoriesWizardExpensesStep.jsx` extended with `Line 15a`, `Line 15b`, `Line 25a`, `Line 25b` because the §10-aligned defaults use those exact lines for Mortgage Interest, Interest, Utilities, and Phone.

**Verify (this is the bigger of the two fixes):**
1. **Diff the array itself:** `git diff 1ab7a47^..1ab7a47 -- client/src/books/CategoriesWizard.jsx` — read the new `DEFAULT_EXPENSES` line-by-line.
2. **Line-by-line compare against spec §10.** Open `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md`, find §10 (default categories tables for expenses and income). For every one of the 23 expense rows, confirm:
   - Name matches spec verbatim
   - Code matches spec verbatim
   - IRS Schedule C line matches spec verbatim
   - System-flag set correctly (only Review Later is `system: true`)
3. **Verify the §10 rows that need new line values.** Spot-check that the four newly-required IRS lines render correctly in the tax-line popover:
   - Pick Mortgage Interest row → tax-line popover should show "Line 15a" selected.
   - Pick Interest row → "Line 15b" selected.
   - Pick Utilities row → "Line 25a" selected.
   - Pick Phone row → "Line 25b" selected.
4. **`DEFAULT_INCOME` audit.** Read the existing `DEFAULT_INCOME` in `CategoriesWizard.jsx` and verify it matches §10's Income table verbatim (Sales → Refunds & Returns → Other Income, with codes + system flags correct). Cinder's report claims no change was needed; spot-check 2-3 rows to confirm the audit was honest.
5. **No regressions in Step 2 rendering.** Same table UX (sortable, sticky header, inline rename, Hide/Delete with system guard) — confirm no consumer-side breakage from the data swap.

### C. NIT-1 (deferred, just note it)

NIT-1 (QA harness placebo assertions for `VB-CATWIZ-STEP1-02` and `VB-CATWIZ-STEP2-10`) was deferred per your own recommendation in the prior report ("doesn't block ship"). Cinder's report correctly notes this. Don't re-investigate unless you see a regression in those specific behaviors. Mention it in your verdict as deferred-and-known.

### D. No regressions elsewhere

- Re-run `node server/scripts/qa-b3a.mjs` (live, against the running app) → confirm 23/23 still passing.
- Re-run `node docs/books/setup-wizard/tests/wf-smoke.mjs` → confirm 255/255 still passing.
- Confirm the dark-mode screenshot at `demos/2026.07.14-b3a-fixes/step2-expenses-fixed.png` renders correctly with the new defaults (all 23 rows visible, no overflow, sortable headers intact).
- Confirm the sorted screenshot at `demos/2026.07.14-b3a-fixes/step2-expenses-sorted-fixed.png` reflects the new data (column sort still works on the §10 names — e.g. sorting by Code ascending should give a different order than sorting by Name ascending on the new defaults).

---

## Verdict shape (use this format)

- **Verdict:** SHIP / NEEDS-FIX
- **SIGNIFICANT-1 status:** RESOLVED / STILL_BROKEN / REGRESSED — with one-line evidence (live probe result + commit diff cite).
- **SIGNIFICANT-2 status:** RESOLVED / STILL_BROKEN / REGRESSED — with one-line evidence (line-by-line §10 comparison result + commit diff cite).
- **NIT-1 status:** DEFERRED (per your prior recommendation).
- **Regression check:** QA 23/23, smoke 255/255, both pass / fail.
- **Anything else:** call out new issues only.

---

## Out-of-scope (do not re-review)

- Everything from `WREN_REPORT_b3a.md` that wasn't NEEDS-FIX (state machine, resume UX, Step 3 ordering, route wiring, API method reuse, dark-mode rendering) — all confirmed correct in your prior report. Do not re-litigate.
- B3b's Add Account modal, Steps 4-6, final POST/chaining — untouched, as expected.
- B2b NITs — out of scope.
- The pre-existing `client/src/books/Settings.jsx` modification — separately committed (`a3627f3`), not in this review's commits.
- v1 backlog / parked work — not in v2.

---

## Spawn trigger

Spawn **now** (Rusty is dispatching in main session). Do not wait for additional prompts.

## Model

sonnet-5 (Cinder's build agent uses sonnet-5 for parity; Wren has been sonnet-5 throughout the B3a chain — stay on sonnet-5).

## Output

Write your review to `/Users/colonelhoracegentleman/clawd/projects/task-manager/WREN_REPORT_b3a-fixes.md` (repo root, matching the convention from `WREN_REPORT_b3a.md`).

When done, report back to main session with one of:
- `WREN_B3A_FIXES: SHIP` — chain advances to `ECHO_BRIEF_b3a` (already pre-staged at `docs/books/ECHO_BRIEF_b3a.md`).
- `WREN_B3A_FIXES: NEEDS-FIX` — chain pauses for Cinder round 3.