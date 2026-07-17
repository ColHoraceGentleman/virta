# Echo QA Brief — B2b-2 (Setup Wizard Step 6 + final POST + chaining + NIT captures)

**Reviewer:** Echo (QA executor)
**Build under review:** B2b-2
**Spec source of truth:** `queued/TASK-b2b-setup-wizard-completion.md` (re-scoped to B2b-2 2026-07-14 14:14 MDT)
**Builder report:** `CINDER_REPORT_b2b-2.md`
**Wren report (precedent for findings):** `WREN_REPORT_b2b-2.md`
**Date queued:** 2026-07-14 14:25 MDT
**Spawn trigger:** AFTER Wren B2b-2 SHIP event. Don't spawn until Wren's report exists.

---

## What's in scope

B2b-2 covers 4 sub-areas. Each has behavior IDs in the brief — your job is to RUN the matrix against the live app, following Wren's findings pattern (block → fix → retest, not skip).

### Area 1: Edit-on-review pattern (Step 6)

| Behavior ID | What to verify in Playwright |
|---|---|
| VB-WIZ-STEP6-01 | Step 6 renders two-column review |
| VB-WIZ-STEP6-02 | Every row has a pencil icon |
| VB-WIZ-STEP6-03 | Click pencil → expands inline with Save + Cancel |
| VB-WIZ-STEP6-04 | Skipped items render as "—" (italic, muted), editable |
| VB-WIZ-STEP6-08 | Save re-renders row with new value |
| VB-WIZ-STEP6-09 | Cancel reverts row to pre-edit value |

### Area 2: Final POST + chaining

| Behavior ID | What to verify |
|---|---|
| VB-WIZ-STEP6-05 | "Save & continue to Categories →" POSTs the business row |
| VB-WIZ-STEP6-06 | Successful POST clears wizard state + sets setupCompletedAt |
| VB-WIZ-STEP6-07 | POST error stays on Step 6 with inline error |
| VB-WIZ-PERSIST-03 | Wizard state clears from localStorage on success |
| VB-WIZ-CHAIN-01 | After success, navigates to /books/categories/wizard |
| VB-WIZ-CHAIN-02 | Falls back to /books/categories or /books on 404 |
| VB-WIZ-GATE-01 | useSetupGate re-fetches after wizard completion |

### Area 3: NIT captures (F4, F5, N2)

| Behavior ID | What to verify |
|---|---|
| VB-NAICS-CLEAR-01 | NAICS modal "Clear" keeps modal open (F4 fix) |
| VB-WIZ-SCHEMA-01 | schemaVersion=2 in DEFAULT_STATE |
| VB-WIZ-SCHEMA-02 | hydrateWizardState prompts on schema mismatch |
| VB-WIZ-STEP4-HELPER-01 | Step 4 helper text references a tab that exists in v2 (N2 fix) |

### Area 4: Regression

| Behavior ID | What to verify |
|---|---|
| VB-WIZ-RESUME-04 | Resume/Start over prompt still works |

---

## Methodology

Per `qa/METHODOLOGY.md`. The Behavior IDs are durable contracts.

- Run each ID in Playwright (or the project's chosen tool — verify in the brief).
- Block on **FAIL → FIX → RETEST**, not FAIL → skip.
- Capture screenshots per the B2a Protocol amendment (post-hoc screenshots, not during build budget).
- Run the wireframe smoke (`node docs/books/setup-wizard/tests/wf-smoke.mjs`) before declaring done. Must remain 255/255.

---

## Live app state

- App URL: `http://localhost:5173/books/setup`
- Backend: `http://localhost:3001/api/v1/books/...`
- Both confirmed live as of 14:18 MDT.

---

## Report format

Write `ECHO_REPORT_b2b-2.md` at workspace root. Mirror `ECHO_REPORT_b2a-wizard-a.md`:

- **Summary** (one line)
- **Behavior matrix** (all 18 IDs → PASS / FAIL / BLOCKED)
- **Screenshots** (paths to dark-mode captures for each area)
- **Findings** (BLOCKER / SIGNIFICANT / NIT, with file:line)
- **Cross-cutting** (wireframe smoke result)

If any BLOCKER, the build fails QA and goes back to Cinder for fix. If SIGNIFICANT, Rusty decides whether to ship or fix. If NIT only, ship and document for future.

---

## Hard rules

- READ-ONLY on `client/src/`, `server/`, schema, migrations, wireframe HTML, smoke test. Exception: write `ECHO_REPORT_b2b-2.md` at workspace root + capture screenshots.
- No pushing to origin.
- No sub-agent spawns.
- Don't fix things yourself — report and hand back.

## When done

End your session. Completion event routes here.