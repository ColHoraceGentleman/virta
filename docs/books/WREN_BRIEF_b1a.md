# Wren Review Brief — B1a (Transactions page polish)

**Reviewer:** Wren
**Build under review:** B1a — Transactions polish
**Builder:** Cinder
**Date:** 2026-07-13 13:48 MDT
**Branch:** `main` (local only, 3 commits ahead of `9f56ad6`)
**Spec source of truth:** `queued/TASK-b1a-transactions-polish.md`
**Report:** `docs/books/CINDER_REPORT_b1a.md`
**Demo:** `demos/2026.07.13-b1a-transactions-polish.mp4`

---

## What was built

Three commits local on `main`:

- `bf94529` — `docs(books): CINDER_REPORT_b1a + demo walkthrough`
- `e9420b4` — `feat(books): Transactions page polish — pagination + sortable columns + flexible dates`
- `11162a4` — `feat(books): server-side sort whitelist for GL listing` (round-1 work, verified working)

The build touches:
- `client/src/books/Transactions.jsx` (rewritten, ~410 lines)
- `client/src/books/api.js` (2-line change to add sort_by + sort_dir to query string)
- `server/services/journalService.js` (whitelist already in place; verified working)
- `server/routes/books/journal.js` (params already passing through; verified working)

The 4 user-facing changes:
1. **Removed the 3 metric tiles** (Entries this month / Unbalanced entries / User action needed).
2. **Added pagination** (top + bottom, 100/page, Go-to-page with snap, First/Prev/Next/Last).
3. **Made all 8 columns sortable** with 3-state cycle (asc → desc → cleared).
4. **Replaced native date pickers** with flexible text inputs that accept M/D/YYYY, M/D/YY, M/D, and ISO YYYY-MM-DD.

---

## What to review

For each item, look for: design-level bugs, wrong action firing, missing cascade, type confusion, off-by-one errors in pagination logic, missing edge cases, accessibility issues, contract drift from the spec.

### A. The metric tile removal

- Confirm nothing else references the removed `Metric` component or `metrics` useMemo. (Cinder claims she checked, but verify.)
- Confirm the page subtitle doesn't still say "{total.toLocaleString()} entries shown" (Cinder says she removed it).

### B. Pagination

- **Server contract.** Verify the call sends `limit=100&offset=N` where `N = (page-1)*100`. Confirm `total` from the server response drives `totalPages = ceil(total / 100)`.
- **Snap behavior.** Test edge cases: page=0, page=-5, page=999 on a 1-page result, page=2 on a 1-page result. All should snap cleanly.
- **Page reset.** Sort change → page 1. Filter change → page 1. Verify the reset hook is in the right place (effectively: every setter that changes the result set).
- **Empty state.** total=0 should hide the pagination strip entirely. Verify both top AND bottom strips hide.
- **First/Prev disabled state.** When on page 1, both should be visually disabled AND not clickable (pointer-events-none or disabled attribute).

### C. Sortable columns

- **3-state cycle.** asc → desc → cleared. Verify the "cleared" state returns to the default (txn_date DESC), not just no-sort.
- **Indicator rendering.** ▲ on asc, ▼ on desc, ↕ on hover for inactive columns. Cinder used `opacity-0 group-hover:opacity-100` — check this is actually wired in Tailwind.
- **All 8 columns sortable.** Verify the whitelist has all 8 in the client-side SORTABLE_COLUMNS array too (in addition to server-side).
- **Sort persists across page changes.** Page 2 of "Amount asc" should still show amount asc on page 3. (Cinder claims this works — verify.)

### D. Date parser

**This is where I want extra scrutiny.** The brief's example outputs had a copy-paste typo (`05/08/2026 → 2026-08-05` listed under all 4 forms), but the placeholder and description said US M/D. Cinder implemented US M/D (`05/08/2026 → 2026-05-08`).

- **Ambiguity check.** Is there ANY case where Cinder's parser would silently misinterpret? E.g., does it handle:
  - Leading whitespace?
  - Trailing whitespace?
  - Single digit months (`5/8/26`)?
  - Two-digit years that look like four-digit? (`5/8/2026` → year=2026 ✓; `5/8/26` → year=2026 ✓ via 20YY rule)
  - Day=0, day=32, month=0, month=13? (Should reject.)
  - Leap year (Feb 29)? (Should accept only in leap years.)
  - ISO `YYYY-MM-DD` on input? (Cinder explicitly accepts this — good.)
- **Parse trigger.** On blur AND on Enter. Verify both paths fire the same commit function. Verify neither fires on every keystroke (would re-filter mid-typing).
- **Edge case: user types and then clicks elsewhere with an invalid value.** Field should revert to last valid value, NOT clear. Verify.
- **Edge case: user types "5/" and waits.** Field shows "5/", filter doesn't fire. Verify.
- **Edge case: user types valid date, presses Tab.** Field commits and re-renders as `YYYY-MM-DD`. Verify the displayed format changes.

### E. Server-side sort whitelist

- **Whitelist matches client.** Client-side `SORTABLE_COLUMNS` array should match server-side. Any mismatch means user clicks a column, server ignores it, page seems "broken."
- **Invalid column fallback.** Server should fall through to default (txn_date DESC). Verify error case.
- **Direction clamping.** Anything other than asc|desc should clamp. Verify.

### F. What you do NOT need to review

- Don't re-review the existing `ManualEntryModal.jsx` or `AuditModal.jsx` — they weren't touched.
- Don't review `Categories.jsx`, `Settings.jsx`, `SetupWizard.jsx`, `Dashboard.jsx` — they're out of B1a scope.
- Don't run the wireframe smoke test (`docs/books/setup-wizard/tests/wf-smoke.mjs`) — Cinder didn't touch it, must remain 255/255 but you can spot-check.
- Don't review `_stub-template.jsx` — out of scope.
- Don't review the existing seeded default chart in `data/tasks.db`.

---

## Output

Write `docs/books/WREN_REPORT_b1a.md` with:

- **TL;DR verdict** at top: ✅ SHIP / ⚠️ SHIP WITH FIXES / ❌ BLOCKED
- **Findings** table: ID | Severity (BLOCKER / SIGNIFICANT / NIT) | Description | File:line | Suggested fix
- **Behavior verification** table: each VB-TXN-* ID, ✓ / ✗, evidence
- **Spec drift** section: anything in the build that doesn't match the brief
- **Out-of-scope findings** section: things you noticed that aren't in the build (Rusty decides whether to fold these into a follow-up)

Severity definitions:
- **BLOCKER** — must fix before demo; no ship. Examples: page doesn't render, action fires wrong, data corruption.
- **SIGNIFICANT** — must fix in same cycle; don't ship without addressing. Examples: misaligned UI, missing edge case that breaks 10%+ of users.
- **NIT** — cosmetic or polish; ship-blocking only if Patrick asks.

## Hard rules

- `trash` > `rm`. Don't run destructive commands.
- No edits to wireframe HTML, spec, smoke test, or any _archived/ file.
- No pushing to origin.
- No sub-agent spawns.
- Verify by reading code AND running checks (curl, sqlite, browser if needed) — don't review-by-reading alone. The methodology doc (`docs/books/qa/METHODOLOGY.md`) is the QA discipline; your review is the design-discipline layer above that.

Begin.