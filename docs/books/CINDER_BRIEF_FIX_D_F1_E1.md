# Cinder Brief — Fix-pass for Wren findings on D + F1 + E.1

**Goal:** Fix the BLOCKERs and SIGNIFICANTs in `WREN_REVIEW_D_F1_E1.md`. Do not introduce new features. Do not refactor unrelated code. This is the high-priority fix pass gated on Wren's review.

**Read first (in this order):**
1. This brief (you're here).
2. `~/clawd/projects/process/ENGINEERING.md` — universal policies (especially §4 Hard Rules, especially #1 "STOP on data loss").
3. `~/clawd/projects/task-manager/docs/books/WREN_REVIEW_D_F1_E1.md` — Wren's full review. Read it end-to-end. The fixes below are scoped to what Wren flagged; nothing more.
4. `qa/METHODOLOGY.md` and `qa/METHODOLOGY.md` are referenced for context but no Test coverage section is needed for THIS brief (this is a fix-pass, not a new phase). Update Test coverage in your report only if a behavior's meaning changed.

**Authoritative code paths (live):**
- `~/clawd/projects/task-manager/server/routes/books/transactions.js` (F1-B1 delete sites)
- `~/clawd/projects/task-manager/server/services/` (F1-B1 missing helper file)
- `~/clawd/projects/task-manager/client/src/books/api.js` (D-B1 arAging method)
- `~/clawd/projects/task-manager/client/src/books/Reports.jsx` (D-B1 crash site, no code change needed — fixing api.js fixes this)
- `~/clawd/projects/task-manager/server/routes/books/reconcile.js` (E1-S1 + E1-S2)
- `~/clawd/projects/task-manager/server/db.js` (no change — schema is correct)

**Live state right now (verified 2026-07-02 14:03 MDT):**
- Service phase: E.1. Counts: 29 accounts, 5 customers, 5 invoices, 11 txns.
- Wren just landed her review. Two BLOCKERs found.

**What NOT to touch:**
- Schema. No new tables, no new columns, no new migrations.
- Categorization.jsx double-unwrap (XC-1 pre-existing bug). Do NOT fix in this pass. Wren explicitly deferred it to a dedicated XC pass — keep scope tight here.
- E1-NIT1 (buildDetail accounts lookup extra query). Do NOT fix. Wren marked it NIT and recommended deferring.
- D-NIT1 (UTC default date in resolveAsOf). Do NOT fix. Add the suggested comment if it's a one-liner — flag in your report either way.

---

## Scope — five fixes in priority order

### 🔴 BLOCKER 1 — D-B1: Reports.jsx AR aging tab crashes on page load

**File:** `client/src/books/api.js` — `arAging` method.
**Symptom:** AR Aging tab crashes with `TypeError: Cannot read properties of undefined (reading 'data')` on every page load. The error boundary is missing in `BooksShell.jsx`, so the crash takes down the whole Books app.
**Root cause:** `booksApi.arAging()` runs through the auto-unwrap helper, which strips the `data` wrapper. The component then tries to access `data.data`, `data.totals`, `data.as_of` on the unwrapped array.

**Fix:** Change `arAging` in `api.js` to NOT auto-unwrap. Use the pattern Wren suggests (Option B in the brief):

```js
arAging: async (asOf) => {
  const path = `/reports/ar-aging${asOf ? `?as_of=${encodeURIComponent(asOf)}` : '/reports/ar-aging'}`;
  const res = await fetch(`${BASE}${path}`);
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { code: json.code });
  return json; // { data: [...], as_of: ..., totals: {...} }
},
```

No change to `Reports.jsx` needed — all existing accesses (`data.data`, `data.as_of`, `data.totals`) are correct once `arAging` returns the full object.

Verify: open `/books/reports`, click the AR Aging tab. No crash. The four customers with overdue invoices render with bucket totals, totals row appears at the bottom.

### 🔴 BLOCKER 2 — F1-B1: `journalHelpers.js` never deployed to `task-manager`

**Files:**
- New file at `~/clawd/projects/task-manager/server/services/journalHelpers.js` (create it)
- Modified file at `~/clawd/projects/task-manager/server/routes/books/transactions.js` (swap the two loops)

**Symptom:** Live `keep_this` and `keep_original` delete paths still iterate `journal_entries` manually. Behavior is correct (FK cascade handles cleanup), but the design goal of "one discoverable delete path" is not achieved. Wren explicitly classified this as BLOCKER because future developers will pattern-match on the existing manual loop.

**Fix:** Follow Wren's exact spec (lines after the F1-B1 BLOCKER heading):

```js
// File: server/services/journalHelpers.js (NEW)
import db from '../../db.js';
export function deleteTransaction(id) {
  const tx = db.transaction(() => {
    const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return result.changes;
  });
  return tx();
}
```

In `transactions.js`:
1. Add import: `import { deleteTransaction } from '../../services/journalHelpers.js';`
2. Find the `keep_this` path (manual journal_entries loop around line 263) — replace the loop with `deleteTransaction(originalId)`.
3. Find the `keep_original` path (manual journal_entries loop around line 274) — replace the loop with `deleteTransaction(req.params.id)`.
4. Remove the manual loops entirely.

Verify: existing test transactions still categorize/uncategorize cleanly. Direct DB test: `sqlite3 data/tasks.db "DELETE FROM transactions WHERE id = 'X'; SELECT COUNT(*) FROM journal_entries WHERE source_id = 'X';"` should return 0. Smoke test through the `/keep_this` and `/keep_original` HTTP endpoints; confirm journal_entries and journal_lines are both 0 for the deleted transaction IDs.

### 🟡 SIGNIFICANT 1 — E1-S2: `books_balance` sign flipped for asset accounts

**File:** `server/routes/books/reconcile.js` — `computeBooksBalance()` around line 61, and the diff recomputation in PATCH around line 299.

**Symptom:** Reconciliation shows `books_balance` as `(credits - debits)`, which is the wrong sign for asset accounts (debit-normal). A real bank account with net deposit activity will show a negative `books_balance`, and the `diff = books_balance - statement_balance` will never be zero. The smoke test passed because the test account had only credit journal entries.

**Fix (pass `account_type` through, flip sign for asset accounts):**

```js
function computeBooksBalance(accountId, periodEnd, accountType) {
  const row = db.prepare(`...`).get(accountId, periodEnd);
  const credits = row.credits || 0;
  const debits  = row.debits || 0;
  // Debit-normal accounts (asset): positive = net debit activity
  // Credit-normal accounts (liability/equity): positive = net credit activity
  return money(accountType === 'asset' ? debits - credits : credits - debits);
}
```

The caller in `POST /reconcile` already has `account.account_type` from the JOIN — pass it through. Same change in the PATCH recalculation. Do not change `diff = books_balance - statement_balance` arithmetic — once `books_balance` is properly signed for the account type, the existing subtraction yields the correct diff.

Verify: open `/books/reconcile`, pick a checking account, paste a statement balance. The books_balance should match what the bank statement shows for that account.

### 🟡 SIGNIFICANT 2 — E1-S1: Lock reconciled periods against clear/unclear mutations

**File:** `server/routes/books/reconcile.js` — both endpoints: `POST /:recon_id/clear` (lines ~344-385) and `DELETE /:recon_id/clear/:transaction_id` (lines ~396-429).

**Symptom:** Caller can mutate clears on a `reconciled` reconciliation, breaking audit immutability.

**Fix (4-5 lines per endpoint):** At the top of both endpoints, after fetching the recon:

```js
if (recon.status === 'reconciled') {
  return res.status(409).json({
    error: 'Cannot modify clears on a reconciled period. Set status to investigating first.',
    code: 'RECON_LOCKED',
  });
}
```

Verify: write a curl test that creates a recon with diff=0, marks it reconciled, then attempts to clear another transaction. Expect 409 RECON_LOCKED.

### 🟡 SIGNIFICANT 3 — D-S1: Comment on trial-balance year-scope

**File:** `server/routes/books/reports.js` — `buildTrialBalanceCsv()`, around line 209.

**Fix:** Add a one-paragraph comment above the SQL explaining that this is year-activity-only, not cumulative. Use Wren's suggested wording or your own. Three lines, no behavior change.

## Migration spec (only F1-B1 touches anything close to data)

F1-B1 creates a new file; no schema change. Take a backup before any other touch (Hard Rule #3) even though nothing else alters schema:

```bash
cp ~/clawd/projects/task-manager/data/tasks.db \
   ~/clawd/projects/task-manager/data/backups/tasks-pre-d-f1-e1-fixpass-$(date +%s).db
```

WAL mode: copy `.db-shm` and `.db-wal` siblings too.

## Verification spec

For each fix:

1. **Schema check:** none.
2. **Smoke tests:**
   - D-B1: open `/books/reports` in the browser, click AR Aging tab. Expected: tab loads, no crash.
   - F1-B1: curl-driven test or use the dedupe `keep_this` route against a test transaction. Expected: manual journal_entries loops are gone; helper is called; journal_lines still 0.
   - E1-S2: open `/books/reconcile`, pick checking account, paste a statement balance. Expected: `books_balance` matches sign of bank statement.
   - E1-S1: write curl request sequence — create recon with diff=0, mark reconciled, attempt to clear a transaction. Expected: 409 RECON_LOCKED.
   - D-S1: grep the file for the comment. Expected: comment exists.
3. **No-regression checks:**
   - VB-CAT-02 (balanced journal entries) still holds: smoke-test 5+1 journal entries, balance sums still match.
   - VB-REP-01 (AR aging endpoint shape) still returns `{ data, as_of, totals }` — wrap doesn't change the wire format.
   - VB-REC-01 (Reconciliation list) still renders all 8 accounts.
4. **Visual confirmation:** Open `/books` in the browser. Both before and after the fix-pass, confirm the page renders, the shell works, and dark mode still looks right.
5. **Live health:** after restart, `curl http://localhost:3001/api/v1/books/health` returns OK with `phase: "E.1"` and non-zero counts.

## What you DON'T need to do

- Don't touch `Categorization.jsx` (XC-1 pre-existing bug).
- Don't add the `deleteInvoice()` helper (out of scope; same WREN review ruled).
- Don't refactor unrelated routes or files.
- Don't promote yourself to Sonnet. Use `minimax/MiniMax-M3`.

## Deliverable

Single report at `~/clawd/projects/task-manager/docs/books/CINDER_REPORT_FIX_D_F1_E1.md`:

1. TL;DR with verdict (SHIP / FIX-FIRST).
2. Backup & rollback trail.
3. Per-fix: what changed, file:line, before/after diff snippet, smoke test output.
4. No-regression results: VB-CAT-02 still balanced, VB-REP-01 still returns expected shape, VB-REC-01 still renders all accounts.
5. Live health output.
6. **No Test coverage section needed** — this is a fix-pass; behavior IDs in QA.md are unchanged. If you discover that a behavior's meaning has shifted (it shouldn't — these are correctness fixes, not semantic changes), surface that in the report so Rusty can decide whether to update QA.md.

## Estimated time

~25-35 minutes. Five fixes, all small surface area. If you go over 45, surface to Rusty — that means scope creep is happening or something is harder than expected.

## Constraint reminder

This is a fix-pass. Keep it tight. If a fix is harder than expected (e.g., E1-S2 requires propagating `account_type` through three layers), do the smallest viable version and surface the rest in your report. Don't refactor.

Push completion event to parent session when done. If a BLOCKER escalates during the fix (e.g., F1-B1 reveals the manual loops are doing something subtle the helper doesn't), escalate immediately.
