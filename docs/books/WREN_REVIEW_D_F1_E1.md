# WREN REVIEW — Phase D + F1 + E.1 combined · verdict: FIX-FIRST

**Reviewer:** Wren 🪶
**Date:** 2026-07-02
**Phases reviewed:** D (Reports), F1 (Orphan-safe delete), E.1 (Reconciliation)
**Model:** anthropic/claude-sonnet-4-6 reviewing minimax/MiniMax-M3 output
**Prior reviews:** WREN_REVIEW_A_B.md (B1–B5), WREN_REVIEW_C.md (C-B1, C-B2, C-S1–C-S4)

---

## Verdict

**FIX-FIRST**

One guaranteed browser crash (Reports.jsx `data.data` TypeError) and one missing file (`journalHelpers.js` never deployed to `task-manager`) are the hard blockers. The rest of Phase D and E.1 is solid; the F1 FK migration is safe and idempotent. Two SIGNIFICANTs in E.1 (no locked-recon guard on clear/unclear; books_balance sign confusion) need fixing before Echo's next pass. Nothing here requires a redesign.

---

## TL;DR

| Category | Phase D | Phase F1 | Phase E.1 | Total |
|---|---|---|---|---|
| BLOCKER | 1 | 1 | 0 | **2** |
| SIGNIFICANT | 1 | 1 | 2 | **4** |
| MINOR | 0 | 0 | 0 | **0** |
| NIT | 1 | 0 | 1 | **2** |

---

## Prior regression check

Checking each Phase C finding against the three new phases:

| Prior finding | Touched by D/F1/E.1? | Status |
|---|---|---|
| C-B1 — bulk-categorize redundant outer UPDATE | Not touched (transactions.js — bulk-categorize only) | ✅ No regression |
| C-B2 — PayPal/Venmo sign convention | Not touched (parsers/*.js) | ✅ No regression |
| C-S1 — Rule button fires wrong action | Not touched (Categorization.jsx) | ✅ No regression |
| C-S2 — Enter key no-op | Not touched (Categorization.jsx) | ✅ No regression |
| C-S3 — restore leaves orphan journal entries | Not touched (transactions.js restore endpoint) | ✅ No regression |
| C-S4 — dead code safeIntegers side effect | Not touched (imports.js) | ✅ No regression |
| B2 — Payment INSERT not atomic | Not touched (payments.js) | ✅ No regression |
| VB-DED-07 — F1 cascade (journal_entries.source_id) | Directly improved by F1 | ✅ FK verified |
| VB-CAT-02 — balanced journal entries | Not touched by D or E.1; F1 only changes delete path | ✅ No regression |

No Phase C regressions introduced. All previously-fixed BLOCKERs remain fixed.

---

## Phase D: Reports

### D-B1 — `data.data` TypeError: Reports.jsx AR Aging tab crashes on every response

**File:** `client/src/books/Reports.jsx` lines 122, 129, 144, 161

**Root cause:** The `booksApi.arAging()` method calls the shared `request()` helper (api.js line 28), which auto-unwraps any response that has a `data` property:

```js
// api.js line 28 — the unwrap contract:
return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
```

The AR aging endpoint returns `{ data: [...rows...], as_of: "...", totals: {...} }`. The wrapper returns `json.data` = the rows array. Then in `ArAgingTab`:

```js
// Reports.jsx line 51-52:
const result = await booksApi.arAging(override || (asOf || undefined));
setData(result);  // data = [...rows array...]
```

```jsx
// Reports.jsx line 122 — CRASH: array.data is undefined:
{data.data.length === 0 ? (...)  }  // TypeError: Cannot read properties of undefined

// Reports.jsx line 97 — also broken:
as_of: <span>{data.as_of}</span>    // undefined — array has no 'as_of' property

// Reports.jsx line 155 (tfoot):
{fmtMoney(data.totals[b.key])}       // data.totals is undefined
```

The AR Aging tab crashes with an unhandled TypeError on every page load. Since there is no React error boundary in `ArAgingTab` or `BooksShell.jsx`, the entire Books app crashes. This is a **BLOCKER** — the Reports page is completely unusable.

This is the same double-unwrap bug that Cinder flagged in the E.1 report ("pre-existing bug: `/books/categorize` crashes on first render") and explicitly left unfixed per Hard Rule #1 (out of scope). For Reports.jsx, **it was introduced in Phase D** — making it in-scope for this review.

**Fix (2 approaches, choose one):**

Option A (minimal — change setData to store the raw json, not the unwrapped result):
```js
// In ArAgingTab, call booksApi.arAging but prevent auto-unwrap.
// Change the arAging API method to return the full json:
arAging: (asOf) =>
  fetch(`/api/v1/books/reports/ar-aging${asOf ? `?as_of=...` : ''}`)
    .then(r => r.json()),
// Then use data.data, data.as_of, data.totals normally.
```

Option B (preferred — consistent with how Cinder fixed Reconcile.jsx):
```js
// In Reports.jsx, change setData to map the already-unwrapped result correctly:
// booksApi.arAging() returns the array after the unwrap. So restructure:
const rows = await booksApi.arAging(override || (asOf || undefined));
// But we also need as_of and totals. So either:
// (a) change arAging to not unwrap (different from other methods)
// (b) add a new arAgingRaw method that returns the full shape
// (c) change setData(result) to setData({ data: result, as_of: ..., totals: ... })
//     and separately fetch as_of from somewhere
```

The cleanest fix is to change `arAging` in `api.js` to use `fetch` directly (no auto-unwrap) or to wrap the response before storing:

```js
// api.js — don't auto-unwrap for endpoints that return multi-key objects:
arAging: async (asOf) => {
  const url = `/api/v1/books${asOf ? `/reports/ar-aging?as_of=${encodeURIComponent(asOf)}` : '/reports/ar-aging'}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { code: json.code });
  return json; // return the whole object, not just json.data
},
```

Then in `ArAgingTab`, `result` = `{ data: [...], as_of: ..., totals: {...} }` and `setData(result)` makes all the existing accesses (`data.data`, `data.as_of`, `data.totals`) correct.

Severity: **BLOCKER** — AR aging tab crashes the entire app on load. Cinder's smoke tests were curl-only and did not catch this.

---

### D-S1 — Trial balance is year-scoped but includes all account types; no opening balance for assets/liabilities

**File:** `server/routes/books/reports.js`, `buildTrialBalanceCsv()`, line 209 SQL

The trial balance CSV query:

```sql
WHERE je.txn_date >= ? AND je.txn_date <= ?  -- year-scoped
```

This is a period-scoped trial balance (activity within the year). The spec's example `trial_balance.csv` shows `1000,Business Checking,15000.00,12500.00`. For a bank account with prior-year history, the year-scoped trial balance shows only in-year debits and credits — not the running balance as a bank statement reconciler would expect.

For a Schedule C export, year-scoped income/expense CSVs are correct (you report only that year's income and expenses). The trial balance is meant as a cross-check for the CPAs. Standard practice is to include opening balances for asset/liability accounts in the trial balance, but the spec doesn't specify this.

Additionally: asset/liability/equity accounts with zero in-year journal activity are silently absent from the trial balance. The `HAVING debits > 0 OR credits > 0` clause drops them.

This matches the spec's "Mechanically computed from journal entries" instruction and is arguably correct for the v1 export tool. Flagging as **SIGNIFICANT** because the spec's own example shows `Business Checking` in the trial balance — which would typically be the running balance, not just in-year activity. Worth confirming with Chantelle/Rusty before Phase H (full balance sheet).

**Suggested clarification (not a code change):** Add a comment to `buildTrialBalanceCsv` documenting that this is year-activity-only, not a cumulative balance, so the next developer who extends this for a balance sheet knows the scope.

---

### D-NIT1 — `resolveAsOf` defaults to UTC date, not local date; off-by-one after midnight MDT

**File:** `server/routes/books/reports.js`, `resolveAsOf()`, line 43

```js
if (!raw) return new Date().toISOString().slice(0, 10);  // UTC
```

`new Date().toISOString()` returns UTC time. In MDT (UTC-6), from midnight to 6 AM local time, the server's "today" is tomorrow's date in UTC. A user who clicks "AR Aging" at 11 PM MDT sees the report dated the next calendar day.

The server's timezone is determined by the host OS. This is minor for a local/hosted personal app, but worth a comment. No code change needed — just acknowledge in a code comment that the fallback date is UTC.

Severity: **NIT** — off-by-one for 6 hours/day at most; user can supply `?as_of=` explicitly.

---

## Phase F1: Orphan-safe delete

### F1-B1 — `journalHelpers.js` never deployed to `task-manager`; live delete paths bypass the helper

**Files:**
- `CINDER_REPORT_F1.md` documents: new file at `~/clawd/projects/accounting-app/server/services/journalHelpers.js`
- `server/routes/books/transactions.js` imports: `import { categorizeTransaction } from './imports.js';` — no `deleteTransaction` import
- Helper file does not exist at any path under `~/clawd/projects/task-manager/server/`

The F1 design intent was:
1. Add FK `ON DELETE CASCADE` on `journal_entries.source_id` (the safety net). ✅ Done.
2. Add `deleteTransaction()` helper in `journalHelpers.js` (discoverability, single delete path). ✅ Exists in the now-deleted `accounting-app` dev directory. ❌ Not in `task-manager/`.
3. Swap both delete sites in `transactions.js` to call `deleteTransaction()`. ❌ Not done.

The live `transactions.js` `keep_this` and `keep_original` branches still manually iterate `journal_entries`:

```js
// transactions.js lines 263-268 — keep_this path (manual loop, not helper):
const origEntries = db.prepare(
  `SELECT id FROM journal_entries WHERE source = 'transaction_import' AND source_id = ?`
).all(originalId);
for (const e of origEntries) {
  db.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(e.id);
}
db.prepare(`DELETE FROM transactions WHERE id = ?`).run(originalId);
```

The FK cascade on `journal_entries.source_id` fires AFTER the transaction is deleted. The manual loop above deletes journal_entries BEFORE deleting the transaction, so the cascade fires on an already-empty set. This is **functionally correct** — both paths (manual loop + FK cascade) end in the same result: no orphan journal_entries or journal_lines.

However, the F1 design goal of "single discoverable delete path" is NOT achieved. Any future developer adding a third delete site (e.g., a `/transactions/:id` DELETE endpoint) will see the pattern in `transactions.js` and believe they need to manually loop through journal_entries — missing that the cascade handles it. The helper was supposed to prevent this.

**Fix:**
1. Create `server/services/journalHelpers.js` in `task-manager` (copy from Cinder's documented implementation):
```js
import db from '../../db.js';
export function deleteTransaction(id) {
  const tx = db.transaction(() => {
    const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return result.changes;
  });
  return tx();
}
```
2. Add import to `transactions.js`: `import { deleteTransaction } from '../../services/journalHelpers.js';`
3. Swap `keep_this` path to call `deleteTransaction(originalId)` after the `UPDATE near_duplicate_of = NULL` line.
4. Swap `keep_original` path to call `deleteTransaction(req.params.id)`.
5. Remove the manual `journal_entries` selection and deletion loops from both paths.

Severity: **BLOCKER** — not a runtime bug (the cascades and manual loops produce the same result), but a discoverability defect that will cause the next delete-path author to use the unsafe manual pattern. Classify as BLOCKER because it directly undermines the stated safety guarantee of F1 ("any delete path that forgets to call `deleteTransaction()` is structurally safe via the helper"). Without the helper, there is no safe default — there's only the cascade, which works, but is invisible to callers.

---

### F1-S1 — Manual `journal_entries` deletion loops in `keep_this`/`keep_original` are now redundant and misleading

**File:** `server/routes/books/transactions.js`, lines 263-268, 274-279

Now that the FK CASCADE is in place, the explicit journal_entries deletion loops are redundant. If a future developer adds a guard inside the manual loop (e.g., "only delete entries from this source"), they'll be silently leaving entries for other sources — while believing they cleaned up everything — when in fact the cascade handles all sources.

This is the dual of F1-B1 above. The loops create false confidence: they appear to be the delete mechanism, but the real safety net is the FK. A developer who reads only the code (not the F1 migration) won't know the cascade exists.

**Fix:** Resolve with F1-B1 (deploy `journalHelpers.js`, swap loops to helper call).

Severity: **SIGNIFICANT** — subsumed by F1-B1; same fix.

---

## Phase E.1: Reconciliation

### E1-S1 — No lock-out guard on clear/unclear for a `reconciled` reconciliation

**Files:** `server/routes/books/reconcile.js`, `POST /:recon_id/clear` (lines 344-385) and `DELETE /:recon_id/clear/:transaction_id` (lines 396-429)

Neither the `/clear` nor the `DELETE /clear/:transaction_id` endpoints check `recon.status` before writing. A caller can mark additional transactions cleared (or un-clear existing ones) on a reconciliation that is already in `status='reconciled'`. This:

1. Changes `cleared_count` on a closed record, creating audit ambiguity ("why does this reconciled period have a different cleared_count than when it was signed off?")
2. Modifies `transactions.cleared_at` globally — the DELETE un-clear path NULLs `cleared_at` on the transaction row regardless of how many other recon periods may have considered it cleared.

The spec (ACCOUNTING-v1.md §13) says reconciled status indicates the period is "closed." There's no explicit prohibition on post-close modifications in the spec, but the `DIFF_NOT_ZERO` gate on marking reconciled implies the intent is to lock down the cleared set at reconcile time.

**Fix (5 lines, both endpoints):**
```js
// Add near the top of POST /:recon_id/clear and DELETE /:recon_id/clear/:transaction_id:
if (recon.status === 'reconciled') {
  return res.status(409).json({
    error: 'Cannot modify clears on a reconciled period. Reopen to investigating first.',
    code: 'RECON_LOCKED',
  });
}
```

The user can set `status='investigating'` via PATCH to reopen it, which is already supported. The error message should suggest this.

Severity: **SIGNIFICANT** — allows post-close mutations on a "signed-off" audit record.

---

### E1-S2 — `books_balance` sign is counter-intuitive for asset accounts; UI provides no sign guidance

**File:** `server/routes/books/reconcile.js`, `computeBooksBalance()`, lines 61-76

```js
// Returns SUM(credit) - SUM(debit) for the account up to period_end.
// For an asset account (debit-normal), this is typically NEGATIVE (net debit activity = negative).
// For a liability (credit-normal), this is typically POSITIVE.
return money((row.credits || 0) - (row.debits || 0));
```

The spec says "let the UI show it as signed" (ACCOUNTING-v1.md §13), but `Reconcile.jsx` shows `books_balance` as a raw currency value without any sign convention label or hint. For an asset account like `1000 Business Checking`, where the user primarily sees debit activity (money IN), the `books_balance` will be negative (credits minus debits). The bank statement shows a positive number. Chantelle will enter `$2352.58` as statement balance; the `diff = books_balance - statement_balance = -2352.58 - 2352.58 = -4705.16`. She will never be able to reconcile.

The smoke test worked because the test account only had credit journal entries (3 expense transactions that debit expense accounts, crediting the source asset), so `credits - debits = 147.42 - 0 = 147.42`. This is an exceptional test case. With real data (income and expenses both), the checking account will have debits from income transactions too, and the sign will be ambiguous.

The spec's instruction "let the UI show it as signed" was meant for the display, not the entry UX. The fix is either:
1. Flip the sign for assets in `computeBooksBalance`: return `money((row.debits || 0) - (row.credits || 0))` when `account_type === 'asset'` (debit-normal). This makes `books_balance` match what the bank statement shows for asset accounts.
2. Or add a label/hint in the UI: "Books balance is `(credits − debits)` — enter your statement balance in the same sign convention."

**Option 1 is strongly preferred** because it makes the `diff == 0` reconciliation workflow intuitive:

```js
function computeBooksBalance(accountId, periodEnd, accountType) {
  const row = db.prepare(`...`).get(accountId, periodEnd);
  const credits = row.credits || 0;
  const debits  = row.debits || 0;
  // Debit-normal accounts (asset): positive balance = more debits than credits (net asset)
  // Credit-normal accounts (liability): positive balance = more credits than debits (net liability)
  return money(accountType === 'asset' ? debits - credits : credits - debits);
}
```

The caller in `POST /reconcile` already has `account.account_type` — pass it through. The same change is needed in the `PATCH /:recon_id` diff recomputation and in `buildDetail` if it's ever recalculated there.

Severity: **SIGNIFICANT** — the reconciliation workflow is broken for any account that has net debit activity (i.e., every real bank account). The smoke test used an artificial scenario where only credit activity existed; real usage will hit this immediately.

---

### E1-NIT1 — `buildDetail` makes 2 DB queries per call (accounts lookup is an extra round-trip)

**File:** `server/routes/books/reconcile.js`, `buildDetail()` lines 437-449

```js
function buildDetail(recon) {
  const { uncleared, cleared } = splitTxnsForPeriod(...);
  // ...
  const account = db.prepare('SELECT id, code, name, account_type FROM accounts WHERE id = ?').get(recon.account_id);
  return { reconciliation: recon, account, uncleared, cleared: clearedWithBalance };
}
```

`buildDetail` is called from 5 endpoints (GET detail, POST create, PATCH, POST clear, DELETE clear). Each call fetches the account row. The account data doesn't change between requests; the initial GET of the `recon` row already has `account_id`. This could be combined into a JOIN on the `reconciliations` SELECT, or the account lookup could be made conditional (only fetch if not already attached to the recon object).

At Chantelle's usage volume this is imperceptible, but it means each clear/unclear operation fires 4-5 DB queries where 3-4 would suffice.

Severity: **NIT** — no correctness issue. Defer to cleanup phase.

---

## Cross-cutting concerns

### XC-1 — `booksApi` double-unwrap pattern: D introduced a new instance; E.1 avoided it

The double-unwrap bug (api.js line 28 auto-unwraps `data`, component then accesses `.data` again) is a systemic trap in the `booksApi` helper design. The pattern surfaces when:
- The server endpoint returns a multi-key response: `{ data: [...], as_of: ..., totals: {...} }` (AR aging)
- The api.js wrapper unwraps: returns `json.data` = just the array
- The component stores the array and then accesses `.data` on it

This is the same bug that appeared in `Categorization.jsx` (surfaced by Cinder in Phase E.1, not yet fixed) and now in `Reports.jsx` (Phase D). Both instances were mentioned in the E.1 Cinder report but only `Reconcile.jsx` was fixed.

**Affected files confirmed:**
- `Reports.jsx` — **BLOCKER** (D-B1 above). The AR aging tab crashes.
- `Categorization.jsx` — pre-existing (not introduced by D, F1, or E.1). Status: still unfixed.

**Scope of the fix:** There are two viable solutions to prevent recurrence:
1. **Per-endpoint opt-out** (current approach, applied to Reconcile.jsx): call `request()` but restructure the component to use the unwrapped shape.
2. **API method returns full JSON** (cleaner for multi-key responses): add a `requestRaw` variant, or check at the api method level whether to return `json` vs `json.data`.

Recommend a dedicated XC pass (one Cinder spawn) to audit all 14+ `booksApi.X()` method call sites and confirm none of them are storing the unwrapped result and then accessing `.data` on it. The pattern is: look for any `booksApi.X()` call where the component accesses `.data`, `.totals`, `.meta`, or any non-`data` field on the stored result.

---

## Recommended fix-pass scope

### Must fix before Echo QA (BLOCKERs):

**1. D-B1 — Reports.jsx AR aging crash (~5 lines in api.js)**
Change `arAging` in `api.js` to return the full JSON object rather than the unwrapped `data` array:
```js
arAging: async (asOf) => {
  const path = `/reports/ar-aging${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ''}`;
  const res = await fetch(`${BASE}${path}`);
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { code: json.code });
  return json; // { data: [...], as_of: ..., totals: {...} }
},
```
No change needed in `Reports.jsx` — all existing `data.data`, `data.as_of`, `data.totals` accesses are correct once `data` is the full object.

**2. F1-B1 — Deploy `journalHelpers.js` and swap delete sites (~20 lines)**
a. Create `server/services/journalHelpers.js` in `task-manager/server/services/` with the `deleteTransaction()` implementation documented in CINDER_REPORT_F1.md.
b. Add import to `transactions.js`.
c. Swap `keep_this` and `keep_original` loops to `deleteTransaction(id)`.
d. Remove the manual `journal_entries` DELETE loops from both branches.

---

### Fix alongside BLOCKERs (SIGNIFICANTs):

**3. E1-S2 — `books_balance` sign for asset accounts (~10 lines in reconcile.js)**
Pass `account_type` to `computeBooksBalance`. Return `debits - credits` for asset accounts; `credits - debits` for liability. Also update the diff computation in `PATCH /:recon_id` (the `diff = recon.books_balance - stmtBal` on line 299 is already correct after the sign fix — the signed balance will now match what the user types from their bank statement).

**4. E1-S1 — Lock reconciled recon against clear/unclear (~4 lines per endpoint)**
Add `if (recon.status === 'reconciled') return 409 RECON_LOCKED` at the top of both `/clear` and `/clear/:transaction_id` endpoints.

**5. D-S1 — Trial balance year-scope comment (~3 lines)**
Add a comment in `buildTrialBalanceCsv` documenting that balances are year-activity-only, not cumulative, so future Phase H balance-sheet work knows to change the date filter.

---

### Defer (NITs, already-known DEBT):

- D-NIT1 — UTC default date in `resolveAsOf` (minor, add comment only)
- E1-NIT1 — `buildDetail` accounts lookup extra query (defer to cleanup)
- XC-1 `Categorization.jsx` double-unwrap — pre-existing, not introduced here; fix in a dedicated XC pass

---

## Clean areas

**F1 FK migration is correct.** The `foreign_keys = OFF` wrapper around the `DROP TABLE / CREATE / INSERT / RENAME` block is correctly placed (line 465 before the `db.exec()`, line 485 after). The idempotency detection via `sqlite_master` SQL regex is sound. The `BEGIN TRANSACTION; ... COMMIT;` inside the `db.exec()` call makes the rebuild atomic — if `DROP TABLE` succeeds but `RENAME` fails, the whole thing rolls back. ✅

**E.1 schema migration is clean.** All three changes are safe additions: `ALTER TABLE ADD COLUMN` (idempotent, no data loss), `CREATE TABLE IF NOT EXISTS reconciliations`, `CREATE TABLE IF NOT EXISTS reconciliation_clears`. No DROP TABLE, no FK-OFF trick needed. Idempotency is solid. ✅

**Reconcile.jsx does NOT repeat the double-unwrap bug.** `setAccounts(data || [])` for the list view and `setDetail(data)` for the detail view both use the api-unwrapped value correctly (the `/reconcile` LIST returns `{ data: [...] }` so `data` = the array; the `/reconcile` POST/PATCH return `{ data: {...detail...} }` so `data` = the detail object). Cinder got this right after the `Categorization.jsx` lesson. ✅

**`previousMonth()` and `monthBounds()` are correct.** Year rollover (January → December prior year), leap year February (Feb 2024 = 29 days), and DST-safe UTC boundary computation all verified. The `Date.UTC(y, m, 0)` trick for last-day-of-previous-month is correct. ✅

**AR aging SQL is correct.** `JULIANDAY(?asOf) - JULIANDAY(due_date)` produces positive values for overdue invoices (due_date in the past). Bucket boundaries (BETWEEN 1 AND 30, etc.) are inclusive and non-overlapping. Grand-total accumulation applies `money()` to both per-customer values and to the aggregated totals (correct float-rounding pattern). ✅

**Schedule C income and expense CSV queries are correct.** The `jl.credit > 0` filter on the income query and `jl.debit > 0` on the expenses query correctly select only the relevant side of each journal entry, preventing double-counting. The `csvCell()` RFC 4180 escaping handles commas, quotes, and newlines correctly. ✅

**All new SQL uses parameterized queries.** Reviewed every `db.prepare()` call in `reports.js` and `reconcile.js`. Zero string interpolation into SQL. The dynamic `updates.join(', ')` in PATCH reconcile builds from an allowlisted pushes array (not user input), same correct pattern as Phase C. ✅

**`resolveAsOf` defensive parsing is thorough.** The `?as_of=` parameter is guarded against missing, wrong format, and invalid dates (NaN check + round-trip check). ✅

**`archiver` v8 ESM import is correct.** The `import { ZipArchive } from 'archiver'` form is the correct v8 API (the v7 `archiver('zip', opts)` form is gone). The error and warning handlers on the archive are in place. The "headers may already be sent" guard in the outer `catch` correctly uses `!res.headersSent`. ✅

**Reconcile PATCH builds `updates` from guarded pushes, not user input.** `updates` array is only populated from hardcoded string literals (`'statement_balance = ?'`, `'notes = ?'`, etc.) — not from any user-controlled field name. No SQL injection surface. ✅

**`INSERT OR IGNORE` + `cleared_at IS NULL` guard is correct.** Re-clearing a transaction is a safe no-op (INSERT OR IGNORE blocks the duplicate clears row; the `AND cleared_at IS NULL` guard on the UPDATE prevents overwriting an existing timestamp). ✅

**`reconciliation_clears` FK cascade is correct.** `ON DELETE CASCADE` from `reconciliations(id)` means deleting a reconciliation row cleanly removes its clears. `transactions.cleared_at` is preserved per spec (the recon is the audit log; the cleared flag is the canonical state). ✅

---

*Review complete.*
*Path: `/Users/colonelhoracegentleman/clawd/projects/task-manager/docs/books/WREN_REVIEW_D_F1_E1.md`*

— Wren 🪶
