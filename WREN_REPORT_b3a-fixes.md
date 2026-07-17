# WREN_REPORT_b3a-fixes.md — Categories Wizard B3a NEEDS-FIX re-review

**Reviewer:** Wren
**Build under review:** B3a-fixes — Cinder's NEEDS-FIX round (2 SIGNIFICANT resolved, 1 NIT deferred)
**Date:** 2026-07-17 13:xx MDT
**Commits:** `ea7836e` (system-account guard), `1ab7a47` (DEFAULT_EXPENSES/INCOME §10 alignment)
**Report under review:** `CINDER_REPORT_b3a-fixes.md`
**Brief:** `docs/books/WREN_BRIEF_b3a-fixes.md`
**Prior review:** `WREN_REPORT_b3a.md` (2026-07-14 15:30 MDT, NEEDS-FIX, 2 SIGNIFICANT + 1 NIT)
**Head at time of review:** `a3627f3` (Settings.jsx stub, separately committed, out of scope for this review)

---

## VERDICT: SHIP

Both SIGNIFICANTs are resolved, verified via commit diff *and* independent live CDP probes (not just re-reading Cinder's claims). No regressions found. QA harness 23/23, wireframe smoke 255/255. NIT-1 correctly deferred, no change in that area's behavior.

---

## SIGNIFICANT-1 status: RESOLVED

**Evidence — commit diff (`ea7836e`):**
- `CategoriesWizardExpensesStep.jsx`: both the Hide button and the Delete/hasTx-disabled cell are now gated `acc.system ? <span title="Review Later can't be hidden or deleted."> : <button>...`. Mirrors the pre-existing rename-guard's visual pattern (`!acc.system && startEditName(acc)`) exactly, no new pattern invented.
- `CategoriesWizard.jsx`: `hideAccount`/`deleteAccount` state mutators now look up the target account and short-circuit (`if (target && target.system) return s;`) before mutating state, and again before firing the `server-` prefixed PATCH/DELETE call — belt-and-suspenders defense beyond the UI gate, as Cinder's report claims.

**Evidence — independent live CDP probe** (`server/scripts/wren-probe-b3a-fixes.mjs`, written and run fresh for this review, not reused from Cinder's report):

```
✅ A-1  Review Later Hide renders as disabled <span> with exact tooltip  · title="Review Later can't be hidden or deleted."
✅ A-2  Review Later Delete renders as disabled <span> with exact tooltip  · title="Review Later can't be hidden or deleted."
✅ A-3  Review Later row visible in Step 2 table
✅ A-4  Clicking disabled spans is a no-op (no row removed, no confirm modal)  · before=23 after=23 modalOpened=false
✅ A-neg-1  Advertising (non-system) Hide is an active <button>, not disabled  · hideLabel=Hide
✅ A-neg-2  Advertising Hide still works (label flips to Unhide)  · label=Unhide
```

- Confirmed the exact tooltip string on both Hide and Delete spans.
- Confirmed clicking the disabled spans does nothing — no confirm modal opens, row count unchanged (23 before and after both clicks).
- **Negative test passed:** a non-system row (Advertising) still has an active `<button>` for Hide, and clicking it correctly flips the label to "Unhide" — the guard is scoped to `acc.system` only, not over-zealous.
- Screenshot `demos/2026.07.14-b3a-fixes/step2-review-later-guard.png` reviewed: Review Later row shows greyed-out Hide/Delete, visually distinct from active rows, with the `(System)` label present. One cosmetic note below (not a regression from this round — see "Anything else").

## SIGNIFICANT-2 status: RESOLVED

**Evidence — commit diff (`1ab7a47`) vs spec §10, line-by-line (all 23 rows):**

Read `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md` §10 "Expenses (23 default, alphabetical)" table directly and compared every row against the new `DEFAULT_EXPENSES` in `CategoriesWizard.jsx`. All 23 rows match verbatim on **name, code, and Schedule C line**:

Accounting/16b, Advertising/8, Car & Truck/9, Commissions/10, Contract Labor/11, Depletion/12, Depreciation/13, Insurance/14, Interest/15b, Legal & Professional/16a, Meals/24b, Mortgage Interest/15a, Office Expense/17, Phone/25b, Rent/19, Repairs & Maintenance/20a, Retirement/18, Supplies/20b, Taxes & Licenses/21, Travel/24a, Utilities/25a, Wages/26, Review Later/null(system) — **23/23 exact matches.** No divergence found. The 5 previously-missing rows (Depletion, Insurance, Interest, Mortgage Interest, Phone) are now present at the correct code slots, and the 5 non-spec invented rows (Bank Fees, Dues & Subscriptions, Licenses & Fees, Postage & Shipping, Software & Subscriptions) are gone.

**`DEFAULT_INCOME` audit:** Read the (unchanged) `DEFAULT_INCOME` array — Sales/Part I line 1, Refunds & Returns/Part I line 7, Other Income/Part I line 1 — matches spec §10's Income table verbatim. Cinder's claim that no code change was needed is honest; spot-checked all 3 rows (not just 2-3 as the brief suggested), all match.

**`IRS_LINE_OPTIONS` new lines — live probe confirms correct rendering, not just data presence:**

```
✅ B-1  Mortgage Interest tax-line cell shows Line 15a  · text="Line 15a"
✅ B-2  Interest tax-line cell shows Line 15b  · text="Line 15b"
✅ B-3  Utilities tax-line cell shows Line 25a  · text="Line 25a"
✅ B-4  Phone tax-line cell shows Line 25b  · text="Line 25b"
✅ B-5  Mortgage Interest tax-line popover <select> value = Line 15a  · value="Line 15a"
```

Confirmed the badge in the table cell *and* the popover `<select>`'s actual selected value both show the correct line for all 4 previously-missing options (15a/15b/25a/25b) — not a `— None —` fallback, which is what would have shown if `IRS_LINE_OPTIONS` hadn't been extended. This validates Cinder's judgment call #1 (extending the options list was a necessary consequence, not scope creep) was correctly executed, not just correctly reasoned about.

**Rendering/UX regression check:** confirmed via QA harness (below) that sort, sticky header, rename, and PATCH wiring are all unaffected by the pure data-table swap — no consumer-side changes were needed, matching Cinder's claim.

## NIT-1 status: DEFERRED

Per prior recommendation. Not re-investigated; no regression observed in `VB-CATWIZ-STEP2-10` or the (harness-uncovered) `VB-CATWIZ-STEP1-02` behavior — both still pass via the harness and were not touched by either fix commit (confirmed via `git diff --stat`, only `CategoriesWizard.jsx` and `CategoriesWizardExpensesStep.jsx` touched).

## Regression check

- **QA harness:** `node server/scripts/qa-b3a.mjs` re-run live against the running app → **23/23 passing.** No new failures, all IDs from the prior run still pass, including STEP2-05/07/10 (hide/delete/tx-guard behaviors touched by SIGNIFICANT-1's fix) and the resume/persistence/sort IDs untouched by either fix.
- **Wireframe smoke:** `node docs/books/setup-wizard/tests/wf-smoke.mjs` → **255/255 passed.**
- **Dark-mode screenshots reviewed:**
  - `step2-expenses-fixed.png` — all visible rows (Utilities through Depletion range shown) use the new §10 names + correct Schedule C lines, sortable header arrows intact, no layout breakage.
  - `step2-expenses-sorted-fixed.png` — descending sort correctly reverses row order relative to the ascending view (confirms sort still works against the new data).
  - `step2-review-later-guard.png` — Review Later row shows greyed-out disabled Hide/Delete controls, `(System)` label present, visually distinct from active rows on other rows in frame.

## Anything else

- **Pre-existing cosmetic artifact, not a regression from this round:** the sticky `<thead>` in `CategoriesWizardExpensesStep.jsx` uses `bg-slate-900/80` (80% opacity), which lets the row scrolling underneath show through faintly near the header when the table is mid-scroll (visible as faint ghosted text — e.g. tail-end of a descriptor like "...employees" — bleeding through near "DESCRIPTOR" in `step2-review-later-guard.png`). Traced via `git log --follow` — this class was introduced in the original B3a commit `d32b3eb` and is untouched by both fix commits (`ea7836e`, `1ab7a47`). Not a functional bug (no click-through, no data corruption), purely a semi-transparent-header visual quirk that predates this review round. Worth a NIT for a future pass (`bg-slate-900` at full opacity, or `bg-slate-900/95`+ backdrop-blur) but does not block ship and is explicitly out of scope for this narrow re-review.
- No other new issues found. Everything confirmed correct in `WREN_REPORT_b3a.md` remains untouched and unregressed (confirmed via `git diff --stat` scope: only `CategoriesWizard.jsx` and `CategoriesWizardExpensesStep.jsx` touched by the two commits under review).
- Verification tooling: wrote `server/scripts/wren-probe-b3a-fixes.mjs` (standalone CDP probe, 12/12 checks passing) to independently verify both SIGNIFICANTs live rather than relying solely on Cinder's report claims or the existing harness. Left in the repo alongside the other `qa-*.mjs` scripts as a reusable regression check for this specific guard + tax-line behavior.

---

## Out-of-scope (confirmed, not re-reviewed)

- Everything from `WREN_REPORT_b3a.md` not flagged NEEDS-FIX (state machine, resume UX, Step 3 ordering, route wiring, API method reuse, dark-mode rendering) — not re-litigated.
- B3b's Add Account modal, Steps 4-6, final POST/chaining — untouched, as expected.
- B2b NITs — out of scope.
- `Settings.jsx` (`a3627f3`) — separately committed, not part of this review's commits.
- v1 backlog / parked work — not in v2.
