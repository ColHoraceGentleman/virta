# Wren Brief — Phase D + F1 + E.1 combined review

**Goal:** Design-level code review of three backfilled phases that shipped without a Wren review. Find BLOCKERs (correctness/data loss/security), SIGNIFICANTs (design-level issues), MINORs (style), and NITs. Report regression surface from each against the phases that came before.

**Read first (in this order):**
1. This brief (you're here).
2. `~/clawd/projects/process/ENGINEERING.md` — universal policies (especially §2 Build lifecycle, §3 Roles, §4 Hard rules, §5 Testing philosophy). This is the policy baseline; this brief is the project-specific scope.
3. `~/clawd/projects/task-manager/docs/books/qa/METHODOLOGY.md` — methodology. §5.8 references the post-Cinder gate that triggered this backfill.
4. `~/clawd/projects/task-manager/docs/books/qa/QA.md` — full behavior list. Don't break any of these.
5. `~/clawd/projects/task-manager/docs/books/ACCOUNTING-v1.md` — spec, for definitions.

**Authoritative build artifacts (one per phase):**
- Phase D (Reports): `CINDER_REPORT_D.md` + diff in `server/routes/books/reports.js`, `client/src/books/Reports.jsx`, `server/index.js` (mount), `package.json` (`archiver` dep). No schema changes.
- Phase F1 (orphan-safe delete): `CINDER_REPORT_F1.md` + diff in `server/db.js` (+45 / -0, FK cascade on `journal_entries.source_id` + helper at `server/services/journalHelpers.js`), `server/routes/books/transactions.js` (helper swap).
- Phase E.1 (Reconciliation): `CINDER_REPORT_E1.md` + diff in `server/db.js` (+60, ALTER ADD COLUMN + 2 new tables), `server/routes/books/reconcile.js` (new, 454 lines), `client/src/books/Reconcile.jsx` (new, 511 lines).

**Authoritative code paths (live):**
- Server: `~/clawd/projects/task-manager/server/` (routes under `server/routes/books/`, services under `server/services/`, schema in `server/db.js`)
- Client: `~/clawd/projects/task-manager/client/src/books/` (BooksShell.jsx is the route mount; api.js wraps every call)
- Live service: `http://localhost:3001` (currently phase E.1)
- Live DB: `~/clawd/projects/task-manager/data/tasks.db`
- Live fronted URL: `https://virta.muckdart.com/books`

**Live state right now (verified 2026-07-02 13:52 MDT):**
- Service phase: E.1. Counts: 29 accounts, 5 customers, 5 invoices (1 draft, 4 overdue), 11 transactions, 0 reconciliations, 1 vendor rule, 2 source mappings.
- Health: `{"status":"ok","phase":"E.1",...,"reconciliations":0}`. Service is up.

**Prior Wren reviews (for regression baseline):**
- `WREN_REVIEW_A_B.md` — B1-B5 BLOCKERs/SIGNIFICANTs; all confirmed fixed (Cinder confirmed post-Phase-C).
- `WREN_REVIEW_C.md` — C-B1 (bulk-categorize double-UPDATE), C-B2 (PayPal/Venmo sign convention), 3 SIGNIFICANTs (Rule button wrong action, Enter no-op, restore orphans). All confirmed fixed in Phase C fix-pass.

---

## Scope

Three independent reviews bundled into one spawn to clear the backfill queue (per ENGINEERING.md §5.8 rule 5: backfill multiple un-reviewed phases in one spawn). Treat each as its own phase for finding classification.

For **each** of D, F1, E.1:

1. **Read the Cinder report** end-to-end. Not just the TL;DR — the actual migration diff, the smoke tests, the build details.
2. **Read the code** for changed and adjacent files. Adjacent = anything that calls into the changed functions, anything in the same route file, anything in the same SQL file.
3. **Regression check** against the last Wren report in the same area:
   - D → regress against C's findings (C-B1 double-UPDATE, C-B2 sign convention). Did Phase D touch any of that code?
   - F1 → regress against C's F1-fix coverage (VB-DED-07/08). Does the FK behave as documented under all four delete paths (helper call, raw SQL DELETE, HTTP keep_this, HTTP keep_original)?
   - E.1 → regress against C's VB-CAT-02 (balanced journal entries), B2 (payment atomicity), and any other classification surface adjacent to the reconciliation_clears transaction logic.
4. **Surface NEW findings** classified as BLOCKER / SIGNIFICANT / MINOR / NIT, with file:line citations and concrete fixes.

---

## What to look for (class-by-class)

### BLOCKER hunting (correctness / data loss / security)

These three phases are particularly exposed to:

- **SQL injection** — every new SQL statement. Parameterized queries (`?` placeholders) are correct; string interpolation is not. The PayPal/Venmo `CANONICAL_MAPPING.amount_sign_convention` bug in Phase C was a value-encoding issue, not injection, but the pattern (using a config field whose meaning is "flip sign" was inverted) is exactly the kind of trap that `amount_sign_convention` could fall into again. Phase D has new CSV-string-building; check the `archiver` v8 ESM import path for the same trap.
- **Atomicity** — F1 wraps the rebuild in `db.transaction()`. E.1 creates reconciles + reconciliation_clears across two new tables. Any multi-step write that's not atomic is a candidate for split-brain state. Same pattern as B2 (payment atomicity) in Phase A+B.
- **FK + DROP TABLE** — F1's migration already hit this once (Cinder caught her own bug). The fix is the `foreign_keys=OFF` wrapper. **Verify the wrapper exists and is in the right place.** E.1's migration is all `ADD COLUMN` + new tables, so this trap doesn't apply to E.1 directly.
- **WAL-mode side-effects** — Phase D is read-only, so no risk. E.1 writes to `transactions.cleared_at` during reconciliation. Verify the UPDATE path doesn't reopen the WAL log in a way that races with the running overdue cron (whose `overdueCron.js` has S2 swallowed errors from Phase A+B; consider whether E.1's writes could trigger another S2-style swallowed-error event).
- **Schema leakage** — E.1 has `setAccounts(data || [])` fix and "Account RENAME" placeholders mentioned in Cinder's report. Audit whether the E.1 reconcile route is exposing placeholder names to clients in a way that would confuse a real user. (Not a BLOCKER — but worth a SIGNIFICANT note if so.)
- **Phase E.1 bug Cinder flagged but did not fix** — `/books/categorize` crashes on first render because of the same `.data` double-unwrap pattern from the API wrapper. Cinder did NOT fix this in E.1 per Hard Rule #1. **Verify the same pattern does not appear in the new Reconcile.jsx code.** If it does, BLOCKER — same trap on a different page.
- **Vault / secret leakage** — Phase D added a new dep (`archiver`). Verify `package.json` does not introduce any new transitive dep that loads `.env` or credential files.

### SIGNIFICANT hunting (design-level)

- The Reports.jsx and Reconcile.jsx components both new — UI patterns matter. Audit the date input binding (E.1 has `previousMonth()` helper; verify the helper handles month boundaries correctly across year-rollover, including Feb in a leap year).
- AR aging report in Phase D: partial payments flagged as Phase E follow-up in Cinder's report. Verify the SQL doesn't silently break when Phase B adds partial payment (no `amount_paid` column today, but the SQL should be `i.total - COALESCE(SUM(p.amount), 0)`-ready).
- Reconciliation `diff == 0` check: is floating-point exact-equality risky? `books_balance - statement_balance` could be a long float subtraction. Should we compare on rounded values for diff tolerance? Don't speculate — check the spec; flag only if spec is silent.

### MINOR + NIT

Style, naming, comment gaps, console.log left behind. Report them in a single section at the end of the report — don't mix with BLOCKERs.

---

## Output format

Write to `~/clawd/projects/task-manager/docs/books/WREN_REVIEW_D_F1_E1.md` with:

1. **Top line:** `WREN REVIEW — Phase D + F1 + E.1 combined · verdict: [PASS / PASS-WITH-CONDITIONS / FIX-FIRST]`
2. **TL;DR** — counts: X BLOCKERs, Y SIGNIFICANTs, Z MINORs, N NITs. Phases broken out separately.
3. **Prior regression check** — table of C's findings → D/F1/E.1 status.
4. **Per-phase findings** — three sections (D, F1, E.1) with BLOCKER / SIGNIFICANT / MINOR / NIT subsections. Each finding: file:line, what it is, suggested fix (concrete, not "consider").
5. **Cross-cutting concerns** — bugs that touch more than one phase (e.g., the `.data` double-unwrap pattern, if it appears in both Reconcile.jsx and Categorize.jsx).
6. **Recommended fix-pass scope** — what Cinder should fix in the next iteration. BLOCKERs first, then SIGNIFICANTs, MINORs optional.

---

## What you DON'T need to do

- Don't run the live service, click around in the browser, or fetch URLs. That's Echo's job. You're design-level.
- Don't rewrite schemas or refactor working code. Findings + suggested fixes only.
- Don't promote yourself to a higher model. Use Sonnet (your default).

## Estimated time

~30-40 minutes for three phases. If you find yourself going over 60, surface to Rusty — that means each phase is bigger than expected and we should consider splitting the spawn.

## Deliverable reminder

Push completion event to parent session when done via `sessions_send` to `main`. If a BLOCKER is found, surface immediately (don't wait for the whole review to finish).

---

**Why this is one spawn:** per ENGINEERING.md §5.8 rule 5, backfilling multiple un-reviewed phases bundles into one Wren brief to reduce spawn overhead. Echo runs the full QA doc on the same bundle; she'll re-run regression checks independently.
