# Echo QA Brief — B3b (Categories Wizard Steps 4-6 + Add Account Modal + final bulk POST)

**Reviewer:** Echo (QA executor)
**Build under review:** B3b — Categories Wizard second half
**Spec source of truth:** `queued/TASK-b3b-categories-wizard-second-half.md`
**Builder report:** `CINDER_REPORT_b3b.md`
**Wren report:** `WREN_REPORT_b3b.md`
**Date queued:** 2026-07-14 14:40 MDT
**Spawn trigger:** AFTER Wren B3b SHIP event. Don't spawn until Wren's report exists.

---

## What's in scope

B3b covers 22 behavior IDs across 4 sub-areas. Run the matrix against the live app.

### Area 1: Step 4 subheaders

| Behavior ID | What to verify |
|---|---|
| VB-CATWIZ-STEP4-01 | 3 subheaders: Cash & bank / Credit & loans / Equity |
| VB-CATWIZ-STEP4-02 | Each subheader has its own table |
| VB-CATWIZ-STEP4-03 | Single "+ Add account" button at top |
| VB-CATWIZ-STEP4-04 | 8 default accounts pre-included (3+2+3) |
| VB-CATWIZ-STEP4-05 | Same Hide/Delete/sticky/sortable |
| VB-CATWIZ-STEP4-06 | Skip = all defaults |

### Area 2: Step 5 + Step 6

| Behavior ID | What to verify |
|---|---|
| VB-CATWIZ-STEP5-01 | Step 5 renders Review Later explainer |
| VB-CATWIZ-STEP5-02 | NO Skip button on Step 5 |
| VB-CATWIZ-STEP6-01 | 3 collapsible sections |
| VB-CATWIZ-STEP6-02 | Count + names per section |
| VB-CATWIZ-STEP6-03 | Edit link per row → navigates back to relevant Step |
| VB-CATWIZ-STEP6-04 | Back returns to Step 5 |
| VB-CATWIZ-STEP6-05 | Finish setup → POSTs all accounts |
| VB-CATWIZ-STEP6-06 | Success clears wizard state + sets completedAt |
| VB-CATWIZ-STEP6-07 | Error stays on Step 6 with inline error |

### Area 3: Add Account modal

| Behavior ID | What to verify |
|---|---|
| VB-CATWIZ-MODAL-01 | Type + Name + Code + Tax Line Item + Note |
| VB-CATWIZ-MODAL-02 | Type picker changes Schedule C lines shown |
| VB-CATWIZ-MODAL-03 | Tax Line Item hidden for Asset/Liability/Equity |
| VB-CATWIZ-MODAL-04 | Save POSTs new account |
| VB-CATWIZ-MODAL-05 | Cancel closes without saving |
| VB-CATWIZ-MODAL-06 | onSave inserts new row into the wizard table |

### Area 4: Shell + regression

| Behavior ID | What to verify |
|---|---|
| VB-CATWIZ-SHELL-02 | useSetupGate re-fetches on Categories Wizard completion |

---

## Methodology

Per `qa/METHODOLOGY.md`. Playwright (or project's chosen tool).

- **Block on FAIL → FIX → RETEST.** Don't skip.
- Capture screenshots per B2a Protocol amendment (post-hoc).
- Run wireframe smoke `node docs/books/setup-wizard/tests/wf-smoke.mjs` before declaring done.

---

## Live app state

- App URL: `http://localhost:5173/books/categories/wizard`
- Backend: `http://localhost:3001/api/v1/books/...`
- Both confirmed live as of 14:18 MDT.

---

## Specific things to verify hard

1. **Bulk endpoint** (VB-CATWIZ-STEP6-05/06) — actually exists at `POST /api/v1/books/accounts/bulk`. Hit it; if 404, BLOCKER.
2. **System account write** (Step 5) — verify the Review Later account (6999, no irs_line) writes successfully without violating the existing CHECK constraint.
3. **Add modal Type picker** (VB-CATWIZ-MODAL-02/03) — toggle Type between Expense and Asset and confirm the Tax Line Item field shows/hides.
4. **UseSetupGate re-fetch** (VB-CATWIZ-SHELL-02) — complete the wizard, verify the sidebar appears with the new Categories link (or whatever post-completion state the gate enforces).

---

## Report format

Write `ECHO_REPORT_b3b.md` at workspace root. Mirror prior Echo reports:

- **Summary** (one line)
- **Behavior matrix** (22 IDs → PASS / FAIL / BLOCKED)
- **Screenshots** (dark-mode captures)
- **Findings** (BLOCKER / SIGNIFICANT / NIT, with file:line)
- **Cross-cutting** (wireframe smoke result)

---

## Hard rules

- READ-ONLY on `client/src/`, `server/`. Exception: write `ECHO_REPORT_b3b.md` + capture screenshots.
- No pushing to origin.
- No sub-agent spawns.
- Don't fix things yourself — report and hand back.

## When done

End your session. Completion event routes here.