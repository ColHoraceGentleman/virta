# Echo QA Brief — B3a (Categories Wizard Welcome + Steps 2-3)

**Reviewer:** Echo (QA executor)
**Build under review:** B3a — Categories Wizard first half (Welcome + Step 2 Expenses + Step 3 Income)
**Spec source of truth:** `queued/TASK-b3a-categories-wizard-first-half.md`
**Builder report:** `CINDER_REPORT_b3a.md`
**Wren report:** `WREN_REPORT_b3a.md`
**Date queued:** 2026-07-14 14:30 MDT
**Spawn trigger:** AFTER Wren B3a SHIP event. Don't spawn until Wren's report exists.

---

## What's in scope

B3a covers 21 behavior IDs across 3 sub-areas. Run the matrix against the live app, fix-on-fail per Wren's findings pattern.

### Area 1: Welcome + toggle cascade (Step 1)

| Behavior ID | What to verify |
|---|---|
| VB-CATWIZ-ROUTE-01 | `/books/categories/wizard` route renders CategoriesWizard |
| VB-CATWIZ-PERSIST-01 | Wizard state persists to localStorage on every change |
| VB-CATWIZ-PERSIST-02 | Wizard state hydrates from localStorage on mount |
| VB-CATWIZ-STEP1-01 | Step 1 renders Welcome + Show account numbers toggle |
| VB-CATWIZ-STEP1-02 | Toggle writes to settings.show_account_numbers |
| VB-CATWIZ-STEP1-03 | Toggle default = OFF |
| VB-CATWIZ-SHELL-01 | BooksShell routes /books/categories/wizard correctly |

### Area 2: Step 2 Expense categories

| Behavior ID | What to verify |
|---|---|
| VB-CATWIZ-STEP2-01 | Step 2 expense table with sticky header |
| VB-CATWIZ-STEP2-02 | Step 2 default sort = Name ascending |
| VB-CATWIZ-STEP2-03 | Step 2 each column header clickable |
| VB-CATWIZ-STEP2-04 | Step 2 Code column shows/hides based on Step 1 toggle |
| VB-CATWIZ-STEP2-05 | Step 2 Hide toggles is_hidden |
| VB-CATWIZ-STEP2-06 | Step 2 Delete opens confirmation modal |
| VB-CATWIZ-STEP2-07 | Step 2 confirmed delete calls DELETE |
| VB-CATWIZ-STEP2-08 | Step 2 Skip = all defaults included |
| VB-CATWIZ-STEP2-09 | Step 2 +Add opens placeholder modal |
| VB-CATWIZ-STEP2-10 | Step 2 Delete disabled with tooltip if account has transactions (defensive) |

### Area 3: Step 3 Income categories

| Behavior ID | What to verify |
|---|---|
| VB-CATWIZ-STEP3-01 | Step 3 income table with sticky header |
| VB-CATWIZ-STEP3-02 | Step 3 default order = Sales, Refunds, Other Income (NOT alphabetical) |
| VB-CATWIZ-STEP3-03 | Step 3 Hide/Delete/sortable columns |
| VB-CATWIZ-STEP3-04 | Step 3 +Add opens placeholder modal |

---

## Methodology

Per `qa/METHODOLOGY.md`. Run Playwright (or project's chosen tool) per behavior ID.

- **Block on FAIL → FIX → RETEST.** Don't skip.
- Capture screenshots per B2a Protocol amendment (post-hoc, not during build).
- Run wireframe smoke (`node docs/books/setup-wizard/tests/wf-smoke.mjs`) before declaring done.

---

## Live app state

- App URL: `http://localhost:5173/books/categories/wizard` (after BooksShell route added)
- Backend: `http://localhost:3001/api/v1/books/...`
- Both confirmed live.

---

## Specific things to verify hard

1. **Income ordering** (VB-CATWIZ-STEP3-02) — must be Sales, Refunds & Returns, Other Income — NOT alphabetical.
2. **Code column hidden when toggle OFF** (VB-CATWIZ-STEP2-04) — toggle the switch and confirm Code column appears/disappears.
3. **Sort persistence** (VB-CATWIZ-STEP2-02/03) — sort by Code, then toggle Code off, sort should still apply (visible via Name+other columns).

---

## Report format

Write `ECHO_REPORT_b3a.md` at workspace root. Mirror `ECHO_REPORT_b2a-wizard-a.md`:

- **Summary** (one line)
- **Behavior matrix** (21 IDs → PASS / FAIL / BLOCKED)
- **Screenshots** (dark-mode captures for each area)
- **Findings** (BLOCKER / SIGNIFICANT / NIT, with file:line)
- **Cross-cutting** (wireframe smoke result)

---

## Hard rules

- READ-ONLY on `client/src/`, `server/`. Exception: write `ECHO_REPORT_b3a.md` + capture screenshots.
- No pushing to origin.
- No sub-agent spawns.
- Don't fix things yourself — report and hand back.

## When done

End your session. Completion event routes here.