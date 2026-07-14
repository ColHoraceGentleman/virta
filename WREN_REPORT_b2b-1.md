# Wren Review Report — B2b-1 (Setup Wizard Steps 3-5)

**Reviewer:** Wren
**Build under review:** B2b-1 — Setup Wizard Steps 3-5 (Contact, Accounting method, Timeline)
**Commit:** `bfdd386` on `main` (1 ahead of `5de5cef`, 12 ahead of `bfdd386`'s own count per brief — confirmed local, not pushed)
**Files reviewed:** 5 changed (4 new + 1 modified), 1,305 insertions / 9 deletions per `git diff --stat`
**Review date:** 2026-07-14 14:00 MDT

---

## VERDICT: ✅ SHIP

Implementation is correct, complete, and matches the spec (`SETUP_AND_CATEGORIES.md` §6 Steps 3-5) end-to-end. Re-ran the harness live (not just read it) — 15/15 passed. Wireframe smoke re-run — 255/255 passed. Independently wrote and ran two additional CDP probes not in Cinder's harness (mid-wizard resume-on-reload, and cross-step revert isolation with forced non-default values) — both passed cleanly. No BLOCKER, no SIGNIFICANT findings. Two NIT-level cosmetic observations only, neither blocks this build or B2b-2.

---

## What I verified

1. **QA harness re-run live.** `node server/scripts/qa-b2b-1.mjs` against the running dev server (existing processes on :5173/:3001, confirmed healthy via curl before running) → **15/15 passed**, output matches Cinder's report claims exactly (state counts, field values, labels).
2. **Wireframe smoke re-run.** `node docs/books/setup-wizard/tests/wf-smoke.mjs` → **255/255 passed.** No regression.
3. **Data-testid integrity.** Extracted every `data-testid` string used in `qa-b2b-1.mjs` (24 unique) and cross-referenced against the 6 wizard step source files with a Node script (not manual eyeballing). All 24 exist in source. The one apparent miss (`wizard-step6-back`) turned out to be a template-literal id (`` `wizard-step${stepNumber}-back` `` in `SetupWizardStepPlaceholder.jsx`) that my static grep didn't expand — confirmed by reading the file directly. No invented selectors.
4. **Per-step revert isolation — read + empirically tested.** Read `SetupWizardContact.jsx`, `SetupWizardAccounting.jsx`, `SetupWizardTimeline.jsx`, and the `SetupWizard.jsx` dispatcher. Confirmed via `grep` that `revertSetupToDefaults` is passed as a prop **only** to `SetupWizardBusinessInfo` (Step 2) — Steps 3-5 do not receive it and never call it; each uses local `updateSetup()` calls scoped to its own field set. Then wrote a standalone CDP script that seeded localStorage with a mid-wizard state at Step 4 with `accounting_method: 'accrual'` (forcing the dirty branch that's otherwise dead in v1 since Accrual is UI-disabled) plus non-default Step 2/3/5 values, clicked Step 4's "Revert to Defaults," and asserted the resulting state:
   - Step 2 (`proprietor_name`, `business_name`) — **intact**
   - Step 3 (`address_line1`, `city`, `state`, `postal`) — **intact**
   - Step 4 (`accounting_method`) — **reverted to `'cash'`**
   - Step 5 (`fiscal_year_start_month`, `business_started_on`) — **intact**
   - Advanced to Step 5 correctly.
   This is the empirical confirmation the brief asked for — reverting Step 4 does not touch Step 3 (or any other step's) fields.
5. **SetupWizard.jsx dispatcher.** Read the full file. Confirmed Steps 3/4/5 render `<SetupWizardContact>`, `<SetupWizardAccounting>`, `<SetupWizardTimeline>` respectively (not the placeholder), and Step 6 still renders `<SetupWizardStepPlaceholder>`. The +2 net line count (322 vs 320) is explained by the diff being a net-neutral swap: the old single conditional `(stepNumber === 3 || 4 || 5 || 6)` rendering the placeholder was replaced by 4 separate conditionals (3 new components + 1 narrowed placeholder branch), plus 3 new import lines minus 1 removed import (`useMemo`, now unused) — the diff stat (48 changed lines) reflects real, substantive rewiring, not padding. Confirmed by reading `git show bfdd386 -- client/src/books/SetupWizard.jsx` in full.
6. **F4 (NAICS "Clear" modal bug) — untouched.** `git diff 5de5cef bfdd386 --stat` confirms `SetupWizardNaicsModal.jsx` does not appear in the changed-files list at all. F4 is correctly deferred to B2b-2 as instructed.
7. **The 7 B2a-wizard-B NITs — untouched files.** Same `git diff --stat` confirms none of `Transactions.jsx`, `Categories.jsx`, `BooksShell.jsx`, `Dashboard.jsx`, `Settings.jsx` appear in the B2b-1 diff.
8. **Settings.jsx uncommitted diff.** `git status` shows `client/src/books/Settings.jsx` still modified-but-uncommitted in the working tree (138 lines of diff, pre-existing from B1 round 1) — confirmed this predates and is untouched by `bfdd386`. Cinder did not stage or commit it.
9. **Wizard resume pattern.** Wrote a CDP probe that seeded `localStorage['virta_books:wizard:setup:state']` with `setupStep: 4, setupCompletedAt: null` and reloaded `/books/setup`. Result: page correctly resumed at Step 4 (`wizard-step4-radios` present, Step 1 CTA absent), header read "Step 4 of 6 — Accounting method." No "Resume / Start over" prompt exists on the Welcome screen — see NIT-1 below; this is a spec-reading nuance, not a functional bug (the wizard resumes correctly regardless).
10. **State shape preservation.** Read `DEFAULT_STATE.setup` directly — all 15 fields present: 7 B2a fields (`proprietor_name`, `business_name`, `trade_name`, `business_description`, `naics_code`, `naics_title`, `ein`) + 8 B2b fields (`address_line1`, `address_line2`, `city`, `state`, `postal`, `accounting_method`, `fiscal_year_start_month`, `business_started_on`). Nothing dropped or renamed.
11. **US states list.** Counted programmatically: 51 entries (50 states + DC), alphabetical by name, DC last. Verified via harness (`count=51, hasDC=true, allUnique=true`) and by reading `us-states.js` directly.
12. **Demo screenshots.** Viewed `step4-accounting.png` and `step3-contact-filled.png` via the image tool. Both are genuine dark-mode captures — Step 4 shows Cash/Accrual radios with correct helper text and "Coming later" pill; Step 3 shows a filled address form (123 Main St / Suite 100 / Anytown / California / 90210) matching the harness test data used in `VB-WIZ-STEP3-02`. Not stale — content matches this build's field set exactly.

---

## Findings

### NIT-1: Design decision #4 kept "B2b" phrasing instead of "B2b-2"

- **Severity:** NIT
- **File:** `client/src/books/SetupWizardStepPlaceholder.jsx:33`
- **What's wrong:** The Step 6 placeholder card still reads "This step lands in **B2b — Setup Wizard completion**." Now that B2b has split into B2b-1 (this build) and B2b-2 (Step 6 + final POST), this should say "B2b-2" for clarity to future readers. Cinder flagged this explicitly in the report as a judgment call and left it for review — correctly not fixing it themselves since it's a one-line cosmetic change outside strict B2b-1 scope.
- **Concrete fix:** In `SetupWizardStepPlaceholder.jsx`, change the string to "This step lands in **B2b-2 — Setup Wizard completion**." One-line edit, zero behavior change. Low priority — can ride along with B2b-2's own changes to this same file (B2b-2 replaces this placeholder entirely for Step 6 anyway, so this NIT is likely moot the moment B2b-2 lands).

### NIT-2: Step 4 helper text references "Settings → Other" — a tab that doesn't exist yet

- **Severity:** NIT
- **File:** `client/src/books/SetupWizardAccounting.jsx:125`
- **What's wrong:** The helper text says "You can change this later in **Settings → Other**." Per `queued/TASK-b5-settings-general.md:113`, the Settings → Other tab is explicitly listed as "deferred; spec §11 sketches but no v2 scope" — it doesn't exist in the current build plan for v2. The brief text (`TASK-b2b-1-steps-3-5.md`) itself only says "Settings" with no tab name. Cinder added the "→ Other" detail beyond what the brief specified, and it points at a UI surface that isn't scheduled to ship in v2.
- **Concrete fix:** Either (a) drop the tab reference and just say "You can change this later in Settings," matching the brief's wording exactly, or (b) if the team commits to building a Settings → Other tab eventually, leave it as a forward-reference but flag it in a code comment so nobody wonders why the wizard promises a tab Settings doesn't have. Recommend (a) — safest, matches spec text precisely, no promise to keep.

No BLOCKER or SIGNIFICANT findings.

---

## Behavior verification (15/15, re-run live)

| ID | Verifies | Status | Evidence |
|---|---|---|---|
| VB-WIZ-ROUTE-01 | `/books/setup` renders SetupWizard | ✅ | Step 1 CTA present after localStorage wipe + reload |
| VB-WIZ-STEP3-01 | Step 3 Contact fields + US state dropdown | ✅ | All 8 affordances (5 fields + Back/Skip/Save) present |
| VB-WIZ-STEP3-04 | 50 US states + DC in dropdown | ✅ | count=51, allUnique=true, hasDC=true |
| VB-WIZ-STEP3-02 | Step 3 Save persists + advances | ✅ | address_line1/city/state/postal all persisted; onStep4=true |
| VB-WIZ-STEP3-03 | Step 3 Skip clears fields + advances | ✅ | All 5 fields cleared on dirty-skip; advances |
| VB-WIZ-STEP4-01 | Cash selected + Accrual greyed | ✅ | 2 radios; cash checked+enabled; accrual disabled |
| VB-WIZ-STEP4-02 | Accrual tooltip text | ✅ | title="Available in a future version"; pill="Coming later" |
| VB-WIZ-STEP4-04 | Helper text matches spec | ✅ | Both required substrings present |
| VB-WIZ-STEP4-03 | Skip defaults to Cash, advances | ✅ | method='cash', onStep5=true |
| VB-WIZ-STEP5-01 | FY + business start fields | ✅ | All 5 affordances present |
| VB-WIZ-STEP5-02 | FY dropdown defaults January | ✅ | value=1, 12 options |
| VB-WIZ-STEP5-03 | Business start date optional | ✅ | Blank save still advances |
| VB-WIZ-STEP5-04 | Step 5 Save persists + advances | ✅ | fy=7, started='2025-01-15' persisted |
| VB-WIZ-STEP6-STILL-PLACEHOLDER | Step 6 still placeholder | ✅ | "Coming in B2b" pill + "Finish setup (in B2b)" present |
| VB-WIZ-PERSIST-04 | Steps 1-5 fields persist | ✅ | All 4 checked fields restored correctly |

**Cross-cutting:**
- Wireframe smoke: `node docs/books/setup-wizard/tests/wf-smoke.mjs` → **255/255** ✅ (re-run, not just trusted from Cinder's report)
- Additional isolation probe (not in original harness): Step 4 revert with forced non-default values on Steps 2/3/4/5 simultaneously → only Step 4's field reverted, all others intact ✅
- Additional resume probe: seeded mid-wizard state at Step 4, reload → correctly resumes at Step 4 rendering the real Accounting component (not a placeholder) ✅

---

## Spec drift notes

None material. Both NITs above are cosmetic text deviations, not functional drift. Implementation matches:
- `TASK-b2b-1-steps-3-5.md` §1 (Step 3 — Contact fields, skip behavior, US state dropdown)
- `TASK-b2b-1-steps-3-5.md` §2 (Step 4 — Cash/Accrual radios, helper text, skip-to-cash)
- `TASK-b2b-1-steps-3-5.md` §3 (Step 5 — FY dropdown default January, optional start date)
- `TASK-b2b-1-steps-3-5.md` §5 (per-step isDirty/revert pattern — verified both by code read and empirical CDP test)
- `SETUP_AND_CATEGORIES.md` §6 Steps 3-5 (field lists, defaults, skip behavior)

---

## Out-of-scope findings (not touched, correctly deferred)

Confirmed via `git diff 5de5cef bfdd386 --stat` that none of these files appear in the B2b-1 changeset:

1. **F4 (NAICS modal "Clear" keeps modal open)** — `SetupWizardNaicsModal.jsx` untouched. Correctly deferred to B2b-2 per brief.
2. **The other 6 NITs from `WREN_REPORT_b2a-wizard-b.md`** (F1, F2, F3, F5, F6, F7) — all reference files/behaviors not touched by this build (`SetupWizard.jsx`'s `setupDirty` naming (F1/F3), `SetupWizardBusinessInfo.jsx` layout (F2), schema versioning (F5), apostrophe entities (F6), `useSetupGate` re-fetch (F7)). None fixed, none needed fixing — correctly out of scope.
3. **Settings.jsx uncommitted diff** — confirmed still present and untouched (working-tree modification, predates B2b-1, not staged/committed by Cinder).
4. **Welcome-back panel unreachable until B2b-2's final POST** — same observation as prior reports; `setupCompletedAt` stays `null` until B2b-2 lands. Correct, not a regression.
5. **B2a-wizard-B QA harness staleness** (Cinder's out-of-scope finding #1) — `qa-b2a-wizard-b.mjs` now has 2 failing IDs because Step 3 is no longer a placeholder. This is expected collateral of shipping real Steps 3-5; the *implementation* under test in that older harness is stale, not broken. Correctly flagged as a follow-up, not a B2b-1 blocker.

---

## Recommended next step

**SHIP.** No blocking or significant issues. The two NITs (B2b vs B2b-2 wording; Settings → Other tab reference) are cosmetic and can be batched into B2b-2's changes to `SetupWizardStepPlaceholder.jsx` (which B2b-2 rewrites anyway for the real Step 6) or fixed in a trivial follow-up commit whenever convenient — no urgency, no user-facing risk in the interim.

No action needed from Cinder for this build. B2b-2 should:
- Replace `SetupWizardStepPlaceholder.jsx`'s Step 6 branch with the real Review & create component (already planned).
- While touching that file, consider updating the "B2b" → "B2b-2" wording (NIT-1) as a drive-by, since B2b-2 owns that file's Step 6 content anyway.
- NIT-2 (Settings → Other) can be fixed independently at any time — it's isolated to `SetupWizardAccounting.jsx` and doesn't block or interact with B2b-2's scope.

---

## Definition of done (Wren side)

- [x] Read brief (`TASK-b2b-1-steps-3-5.md`) and prior reports (`CINDER_REPORT_b2b-1.md`, `WREN_REPORT_b2a-wizard-b.md`)
- [x] Read spec source of truth (`SETUP_AND_CATEGORIES.md` §6 Steps 3-5)
- [x] Read all 4 new files + the modified dispatcher in full
- [x] Re-ran QA harness live (15/15) — not just trusted the report
- [x] Re-ran wireframe smoke (255/255)
- [x] Verified data-testid selectors are real, not invented (scripted cross-reference)
- [x] Empirically tested per-step revert isolation with a standalone CDP probe (beyond just reading code)
- [x] Empirically tested mid-wizard resume-on-reload
- [x] Confirmed F4 (NAICS modal) untouched via diff
- [x] Confirmed B2a-wizard-B's 7 NITs' files untouched via diff
- [x] Confirmed Settings.jsx uncommitted diff still uncommitted, untouched by this build
- [x] Confirmed DEFAULT_STATE has all 15 fields, no drops/renames
- [x] Viewed 2 of 6 demo screenshots, confirmed genuine and current
- [x] No BLOCKER, no SIGNIFICANT findings
- [x] Cleaned up all test artifacts (temp Chrome profiles, scratch scripts) — no residue left in the repo

---

*End of report.*
