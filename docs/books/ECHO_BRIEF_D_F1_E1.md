# Echo Brief — Phase D + F1 + E.1 combined QA

**Goal:** Browser-driven QA against the live Books service. Run the full `qa/QA.md` behavior register as the floor (cross-cutting regression check), with Phase D's 15 new behaviors and Phase E.1's 11 new behaviors in deeper focus. F1 has no new IDs — its behaviors are VB-DED-07 and VB-DED-08 already in the register.

**Read first (in this order):**
1. This brief (you're here).
2. `~/clawd/projects/process/ENGINEERING.md` — universal policies (especially §2 Build lifecycle, §3 Roles, §5 Testing philosophy).
3. `~/clawd/projects/task-manager/docs/books/qa/METHODOLOGY.md` — methodology. Read §"What 'run the QA doc' means" and §"Failure artifacts" — they're the discipline.
4. `~/clawd/projects/task-manager/docs/books/qa/QA.md` — full behavior list (73 active). **Run all of them**, not just the new ones.
5. `~/clawd/projects/task-manager/docs/books/ACCOUNTING-v1.md` — spec, for definitions.
6. `~/clawd/projects/task-manager/docs/books/WREN_REVIEW_D_F1_E1.md` (when it's written) — Wren's findings for context.

**Authoritative code paths (live):**
- Phase D's surface area:
  - `GET /api/v1/books/reports/ar-aging` (and `?as_of=YYYY-MM-DD`)
  - `GET /api/v1/books/reports/schedule-c?year=YYYY`
  - `/books/reports` UI page (two tabs)
- Phase F1's surface area (no new IDs; verify regression):
  - `deleteTransaction()` helper at `server/services/journalHelpers.js` (NOW LIVE — fix-pass landed 14:14 MDT; was missing pre-fix-pass)
  - FK on `journal_entries.source_id` → `transactions.id` ON DELETE CASCADE
  - VB-DED-07, VB-DED-08 (DEDUPE section)
- Phase E.1's surface area:
  - `GET/POST /api/v1/books/reconcile/*` (list, detail, drafts, clears, statement)
  - `/books/reconcile` UI page (two-column cleared/uncleared layout, period picker, diff display)
  - New tables: `reconciliations`, `reconciliation_clears`; new column `transactions.cleared_at`
  - **⚠️ E.1 fix-pass (2026-07-02 14:14): `computeBooksBalance()` now takes `accountType` arg.** For asset accounts: `debits - credits`. For liability/equity/income/expense: `credits - debits`. Verify behavior VB-REC-02 against the post-fix sign convention; expected for an asset account: a $500 deposit produces `books_balance: 500`. For an expense account (normal debit): `books_balance < 0` for accrued expenses. **Do not rely on the pre-fix-pass behavior description.**

**Fix-pass summary (already landed before this brief was finalized):**
A concurrent Cinder fix-pass has already shipped 5 of the Wren findings. The fixes are live on the running service. Your job is to verify them, not re-flag them as bugs.

| Wren finding | Severity | Fixed in | Verify by |
|---|---|---|---|
| D-B1: Reports.jsx AR Aging crash via `.data` double-unwrap | BLOCKER | `client/src/books/api.js` | Open `/books/reports`, click AR Aging tab, see 4 customers + $429 totals row. No white screen, no error overlay. |
| F1-B1: `journalHelpers.js` helper not deployed | BLOCKER | New `server/services/journalHelpers.js` + helper swap in `server/routes/books/transactions.js` | Confirm FK cascade works for both helper-mediated deletes AND the HTTP `keep_this` / `keep_original` paths (which now route through the helper). |
| E1-S2: `computeBooksBalance()` sign convention wrong for assets | SIGNIFICANT | `server/routes/books/reconcile.js` | Synthetic $500 deposit to asset account 1000 → `books_balance: 500`, `diff: 0` when statement matches, reconciles successfully. |
| E1-S1: Reconciled recons mutatable | SIGNIFICANT | `server/routes/books/reconcile.js` | After marking a recon reconciled, hitting `/clear` or `/clear/:transaction_id` returns 409 RECON_LOCKED. Draft recons still allow clear/unclear (200). |
| D-S1: Trial balance year-activity scope undocumented | SIGNIFICANT | `server/routes/books/reports.js` | Verify the SCOPE NOTE comment exists at top of `buildTrialBalanceCsv()`. No behavior change to verify — comment-only. |

**Remaining pre-existing bug (NOT in fix-pass scope, flag if seen):**
`/books/categorize` still crashes on first render because of the `.data` double-unwrap in `api.js` — but per the Cinder report the same crash pattern in Reports.jsx was fixed by switching `arAging()` to use `fetch` directly without auto-unwrap. **`Categorize.jsx` was not migrated.** If your QA flow tries to verify VB-CAT-01 (inbox list) and hits this crash, note it as a NEEDS-DECISION; don't try to fix.

**Live service right now:**
- URL: `http://localhost:3001` (and `https://virta.muckdart.com` for the fronted-URL test).
- Phase: E.1. Health: `{"status":"ok","phase":"E.1",...}`.
- DB counts: 29 accounts, 5 customers, 5 invoices (1 draft + 4 overdue), 11 transactions, 0 reconciliations, 1 vendor rule, 2 source mappings.
- DB file: `~/clawd/projects/task-manager/data/tasks.db`. Backups at `~/clawd/projects/task-manager/data/backups/`.

---

## Verification scope

Two layers, both mandatory.

### Layer 1 — Run the full QA doc

Execute **every active behavior** in `~/clawd/projects/task-manager/docs/books/qa/QA.md` (73 active IDs, `[ ]` not struck through). For each:

- **PASS** — mark with `[x]` + today's date in the QA doc.
- **FAIL** — write a finding to the report; save failure artifact under `~/clawd/projects/task-manager/docs/books/qa/runs/2026-07-02/<VB-ID>/`; mark with temporary `[!]` in the QA doc so Rusty notices on curation.
- **NEEDS-DECISION** — behavior is correct in code but the spec is ambiguous; write a NEEDS-DECISION finding with the decision you want Rusty/Patrick to make.

The 62 already-verified behaviors (DED-01 through DED-06, REP-01 through REP-15) were verified at the API + curl level by Cinder + Rusty at Phase D ship time, NOT browser-verified. **Re-verify them in the browser** — Phase E.1 also modified db.js (ALTER TABLE transactions ADD cleared_at) and added two new tables, both of which could have rippled into the reports code.

### Layer 2 — Phase-specific scope

#### Phase D depth (15 new REP behaviors)

For each of VB-REP-01 through VB-REP-15:
- **Render** — UI element exists in DOM after the relevant state is reached.
- **Interaction** — click/select/type/submit fires the right handler.
- **Effect** — backend state matches expected.
- **Side effects** — no console errors, no surprise network calls, no other DOM mutations.

Plus for **each** of REP-01 through REP-15, also re-run VB-DED-04 (Keep Original cascade) and VB-DED-07 (F1 cascade from transactions → journal_entries → journal_lines) as cross-cutting regression checks. Phase D is read-only against the DB schema but it's the first phase to ship after F1, so confirm F1's FK behavior is intact.

#### Phase F1 depth (no new IDs — verification only)

VBs: VB-DED-04, VB-DED-05, VB-DED-07, VB-DED-08. Verify the FK cascade works end-to-end in the browser by:
1. Creating a categorizable test transaction (or use one of the 11 existing).
2. Categorize it (creates journal_entries + journal_lines).
3. Hit `keep_this` or `keep_original` HTTP endpoint, OR call `deleteTransaction()` directly via a route that uses it.
4. Confirm in SQLite: `journal_entries` for the txn gone, `journal_lines` for those entries gone. Use `sqlite3 data/tasks.db "SELECT COUNT(*) FROM journal_entries WHERE source_id = '<id>'"` and similar.
5. Repeat for raw-SQL DELETE (VB-DED-08): `sqlite3 data/tasks.db "DELETE FROM transactions WHERE id = '<id>'"`.

If you don't want to delete real test data, clone one of the test rows into a fresh txn first.

#### Phase E.1 depth (11 new REC behaviors)

For each of VB-REC-01 through VB-REC-11:
- **Render** — list, detail, period picker, statement-balance input, status pill, error renders.
- **Interaction** — clicking an account row navigates to detail; clicking a txn in uncleared column moves it to cleared; entering statement balance shows diff; pressing "Reconcile" either succeeds (diff==0) or returns 400 (diff!=0).
- **Effect** — `reconciliations` table has the right row; `reconciliation_clears` table has the right clears; `transactions.cleared_at` is set / nulled correctly.
- **Side effects** — no console errors, no surprise network calls, no other DOM mutations, no other DB writes.

Plus for **each** of REC-01 through REC-11, also re-run VB-CAT-02 (categorization creates balanced journal entry) and VB-REP-02 (AR aging honors `?as_of=`) as cross-cutting regression checks. E.1 wrote to `transactions.cleared_at`; confirm AR aging still correctly excludes the cleared transactions.

#### Pre-existing bug Cinder surfaced (NOT in scope, but flag if seen)

`/books/categorize` crashes on first render because of the `.data` double-unwrap pattern in `api.js`. Cinder did NOT fix this in E.1 per Hard Rule #1. **If you hit this crash and it's blocking your QA flow, note it as a high-priority NEEDS-DECISION in your report; don't try to fix it.** Logger for Rusty to schedule a fix-pass.

---

## What you DON'T need to do

- Don't re-verify Wren findings. Wren already covered the design-level; commit history is the proof.
- Don't rewrite schema or code. If you find a real bug, list it; don't apply a fix.
- Don't promote yourself to Sonnet. Use `minimax/MiniMax-M3` (your default).
- Don't skip cross-cutting regression checks even if you "don't have time." They're the highest-value part of this run.

## Deliverable

A single `~/clawd/projects/task-manager/docs/books/ECHO_REPORT_D_F1_E1.md` with:

1. **Header summary** — verdict (SHIP / FIX-FIRST / NEEDS-DISCUSSION), counts (X/Y behaviors PASS, Z FAIL, W NEEDS-DECISION), grouped by phase (D, F1, E.1).
2. **Behavior-by-behavior results** — for each active ID (73 total), PASS/FAIL/NEEDS-DECISION with one paragraph of evidence. Group by status (all PASSes together, then all FAILs, then all NEEDS-DECISIONs).
3. **Phase-specific findings** — design-level observations from the code review portion of this pass.
4. **Cross-cutting findings** — interactions, regressions, behavioral surprises.
5. **Failure artifact index** — list of `docs/books/qa/runs/2026-07-02/<VB-ID>/` paths.
6. **Overall recommendation** — SHIP / FIX-FIRST / NEEDS-DISCUSSION.

Append to existing `qa/QA.md` (mark `[x]` for PASS with today's date) AND update the "Coverage at a glance" table to record this run's last-verified dates.

## Constraints

- Read-only when reasonable. Don't rewrite working code; if a fix is needed, list it.
- Use your default model (`minimax/MiniMax-M3`).
- Estimated time: ~50-70 minutes for the full doc + phase-specific depth.

## Appendix — failure artifact checklist

When you write a FAIL, you MUST produce all of these under `docs/books/qa/runs/2026-07-02/<VB-ID>/`:
- `screenshot.png` — page state before the failing action.
- `screenshot-after.png` — page state after.
- `console.log` — full browser console output.
- `network.log` — every request/response with status codes.
- `command.txt` — exact Playwright command(s).
- `notes.md` — one paragraph: expected vs. observed, hypothesis, suggested fix.

Push completion event to parent session when done. If a BLOCKER is found, escalate immediately.
