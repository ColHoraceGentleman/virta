# CINDER REPORT — Fix-pass: Wren findings on D + F1 + E.1

**Builder:** Cinder 🔥
**Date:** 2026-07-02 14:13 MDT
**Phase status:** E.1. Counts: 29 accounts, 5 customers, 5 invoices, 11 txns.
**Scope:** 5 fixes from `WREN_REVIEW_D_F1_E1.md` (2 BLOCKERs, 3 SIGNIFICANTs).
**Verdict:** ✅ **SHIP.**

---

## TL;DR

All 5 fixes shipped. AR Aging tab no longer crashes, `deleteTransaction()` helper deployed, asset accounts now reconcile correctly (debit-normal sign), reconciled recons are locked against clear/unclear mutations, and the trial-balance year-scope is documented inline.

| # | Severity | Finding | File | Status |
|---|---|---|---|---|
| 1 | BLOCKER | D-B1 — Reports.jsx AR Aging crash | `client/src/books/api.js` | ✅ Fixed |
| 2 | BLOCKER | F1-B1 — `journalHelpers.js` not deployed | `server/services/journalHelpers.js` (new) + `server/routes/books/transactions.js` | ✅ Fixed |
| 3 | SIGNIFICANT | E1-S2 — `books_balance` sign for asset accounts | `server/routes/books/reconcile.js` | ✅ Fixed |
| 4 | SIGNIFICANT | E1-S1 — Lock reconciled recons | `server/routes/books/reconcile.js` | ✅ Fixed |
| 5 | SIGNIFICANT | D-S1 — Trial balance year-scope comment | `server/routes/books/reports.js` | ✅ Fixed |

**Net diff:**
- New: `server/services/journalHelpers.js` (23 lines)
- Modified: `client/src/books/api.js`, `server/routes/books/transactions.js`, `server/routes/books/reconcile.js`, `server/routes/books/reports.js`
- Schema: untouched.
- Test data: 1 synthetic journal entry + 1 synthetic recon created and cleaned up during smoke tests; final state matches pre-fix-pass baseline (11 txn / 5 je / 10 jl / 0 reconciliations).

**Smoke tests:** all pass (5 fixes × at least 1 smoke each, plus 3 regression checks).
**Visual confirmation:** Reports page renders cleanly (D-B1 fix), no white screen, no error overlay.

---

## 1. Backup & rollback trail

Backup taken **before any code change** (Hard Rule #3):

```bash
cp ~/clawd/projects/task-manager/data/tasks.db \
   ~/clawd/projects/task-manager/data/backups/tasks-pre-d-f1-e1-fixpass-1783022728.db
cp ~/clawd/projects/task-manager/data/tasks.db-shm \
   ~/clawd/projects/task-manager/data/backups/tasks-pre-d-f1-e1-fixpass-1783022728.db-shm
cp ~/clawd/projects/task-manager/data/tasks.db-wal \
   ~/clawd/projects/task-manager/data/backups/tasks-pre-d-f1-e1-fixpass-1783022728.db-wal
```

Files: `tasks-pre-d-f1-e1-fixpass-1783022728.db` (327,680 bytes), `.db-shm` (32,768 bytes), `.db-wal` (2,286,632 bytes).

**Restore procedure if needed:**
1. Stop service: `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager`
2. `cp data/backups/tasks-pre-d-f1-e1-fixpass-1783022728.db data/tasks.db` (+ `-shm` + `-wal`)
3. Revert the 4 modified files, delete `server/services/journalHelpers.js`
4. `cd client && npm run build` and restart

No rollback needed — all smoke tests passed on first try after one path correction (see Fix 2 notes).

---

## 2. Per-fix details

### 🔴 Fix 1: D-B1 — Reports.jsx AR Aging tab crash

**File:** `client/src/books/api.js` (lines 145-160)

**Before:**
```js
// Phase D: Reports
arAging: (asOf) =>
  request('GET', `/reports/ar-aging${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ''}`),
```

**After:**
```js
// Phase D: Reports
// arAging uses fetch directly (no auto-unwrap) because the endpoint returns a
// multi-key response: { data: [...rows...], as_of: "...", totals: {...} }.
// The auto-unwrap helper would return just the rows array, leaving
// data.as_of / data.totals undefined and crashing the component.
arAging: async (asOf) => {
  const path = `/reports/ar-aging${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ''}`;
  const res = await fetch(`${BASE}${path}`);
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.code = json.code;
    err.status = res.status;
    throw err;
  }
  return json; // { data: [...], as_of: ..., totals: {...} }
},
```

**What it does:** Returns the full response object instead of the auto-unwrapped `data` array. All existing accesses in `Reports.jsx` (`data.data.length`, `data.as_of`, `data.totals[b.key]`) are now correct.

**Smoke test:**
- `curl http://localhost:3001/api/v1/books/reports/ar-aging` → `{ "data": [...4 customers...], "as_of": "2026-07-02", "totals": {...} }` (multi-key response confirmed).
- Headless Chrome dump-dom of `/books/reports` after the fix:
  - Top nav renders (Dashboard, Invoices, Payments, Customers, Import, Categorize, Reports, Reconcile, Settings)
  - AR Aging tab is selected (indigo highlight)
  - 4 customer rows render with their 90+ bucket amounts ($200, $99, $80, $50)
  - Totals row at bottom shows $429.00
  - No crash, no error overlay, no white screen
- Screenshot saved at `docs/books/fix-screenshots/ar-aging-after-final.png`

### 🔴 Fix 2: F1-B1 — Deploy `journalHelpers.js` + swap delete sites

**New file:** `server/services/journalHelpers.js` (23 lines)

```js
// Virta Books — F1 helper: orphan-safe delete for a transaction and its
// journal entries.
//
// The actual safety is the FK CASCADE on journal_entries.source_id (added
// in the F1 migration): deleting a transactions row cascades to its
// journal_entries, which in turn cascade to their journal_lines. This
// helper is a thin discoverable wrapper so future delete paths can call
// `deleteTransaction(id)` instead of hand-rolling loops over journal_entries.
//
// The wrapper also opens the door to future audit logging, soft-delete, or
// pre-delete hooks without touching every call site.
//
// Wrapped in db.transaction() to make the DELETE atomic at the better-sqlite3
// layer (single statement today, multi-statement when hooks are added).
import db from '../db.js';

export function deleteTransaction(id) {
  const tx = db.transaction(() => {
    const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return result.changes;
  });
  return tx();
}
```

> **Note:** The brief's example used `import db from '../../db.js'`. That path is **wrong** — `server/db.js` is at `../db.js` from `server/services/`, not `../../db.js`. I corrected the path. (The error surfaced immediately on first restart: `ERR_MODULE_NOT_FOUND … /Users/colonelhoracegentleman/clawd/projects/task-manager/db.js`. One-line fix; no rollback needed.)

**Modified file:** `server/routes/books/transactions.js`

**Imports added (line 13):**
```js
import { deleteTransaction } from '../../services/journalHelpers.js';
```

**`keep_this` branch (lines ~262-270) — before:**
```js
} else if (action === 'keep_this') {
  // Delete the original (and its journal entries — lines cascade).
  // First, clear any other transactions that reference this original as their near_duplicate_of,
  // since deleting the original would break those FK references.
  db.prepare(`UPDATE transactions SET near_duplicate_of = NULL WHERE near_duplicate_of = ?`).run(originalId);
  const origEntries = db.prepare(
    `SELECT id FROM journal_entries WHERE source = 'transaction_import' AND source_id = ?`
  ).all(originalId);
  for (const e of origEntries) {
    db.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(e.id);
  }
  db.prepare(`DELETE FROM transactions WHERE id = ?`).run(originalId);
  db.prepare(`UPDATE transactions SET near_duplicate_of = NULL, updated_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);
  deleted = originalId;
}
```

**After:**
```js
} else if (action === 'keep_this') {
  // Delete the original. F1: journal_entries cascade via FK on source_id;
  // journal_lines cascade via journal_lines.entry_id FK. The helper does it all.
  // First, clear any other transactions that reference this original as their near_duplicate_of,
  // since deleting the original would break those FK references.
  db.prepare(`UPDATE transactions SET near_duplicate_of = NULL WHERE near_duplicate_of = ?`).run(originalId);
  deleteTransaction(originalId);
  db.prepare(`UPDATE transactions SET near_duplicate_of = NULL, updated_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);
  deleted = originalId;
}
```

**`keep_original` branch (lines ~271-274) — before:**
```js
} else if (action === 'keep_original') {
  // Delete this transaction (and its journal entries).
  const myEntries = db.prepare(
    `SELECT id FROM journal_entries WHERE source = 'transaction_import' AND source_id = ?`
  ).all(req.params.id);
  for (const e of myEntries) {
    db.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(e.id);
  }
  db.prepare(`DELETE FROM transactions WHERE id = ?`).run(req.params.id);
  deleted = req.params.id;
}
```

**After:**
```js
} else if (action === 'keep_original') {
  // Delete this transaction. F1: cascade via FK — no manual journal_entries cleanup needed.
  deleteTransaction(req.params.id);
  deleted = req.params.id;
}
```

**Smoke tests:**

`keep_this`:
```
PRE:  orig=1  ndup=1  je=1  jl=2
POST /api/v1/books/transactions/<NDUP>/resolve-duplicate {"action":"keep_this"}
Response: {"data":{"action":"keep_this","deleted":"<ORIG>","cleared":false}}
POST: orig=0  ndup=1  je=0  jl=0
```

`keep_original`:
```
PRE:  orig=1  ndup=1  je_for_ndup=1  jl_for_ndup_je=2
POST /api/v1/books/transactions/<NDUP>/resolve-duplicate {"action":"keep_original"}
Response: {"data":{"action":"keep_original","deleted":"<NDUP>","cleared":false}}
POST: orig=1  ndup=0  je_for_ndup=0  jl_for_ndup_je=0
```

**Cascade verified:** in both cases, journal_entries and journal_lines for the deleted transaction are 0. The FK CASCADE (added in F1) does the heavy lifting; the helper is the discoverable entry point.

### 🟡 Fix 3: E1-S2 — `books_balance` sign flip for asset accounts

**File:** `server/routes/books/reconcile.js` — `computeBooksBalance()` and the POST `/reconcile` caller

**Function (lines ~53-78) — before:**
```js
function computeBooksBalance(accountId, periodEnd) {
  const row = db.prepare(`...`).get(accountId, periodEnd);
  return money((row.credits || 0) - (row.debits || 0));
}
```

**After:**
```js
function computeBooksBalance(accountId, periodEnd, accountType) {
  const row = db.prepare(`...`).get(accountId, periodEnd);
  const credits = row.credits || 0;
  const debits  = row.debits  || 0;
  return money(accountType === 'asset' ? debits - credits : credits - debits);
}
```

**Caller (POST `/reconcile`, lines ~219-224) — before:**
```js
const booksBalance = computeBooksBalance(account_id, period_end);
```

**After:**
```js
const booksBalance = computeBooksBalance(account_id, period_end, account.account_type);
```

> **Note on PATCH:** PATCH does not recompute books_balance from journal_lines — it only updates `diff = books_balance - statement_balance` and `status`. So the PATCH arithmetic is correct as-is once `books_balance` is properly signed at create-time. No change needed in PATCH.

**Smoke test:**

Asset account (1000), no prior activity + synthetic deposit ($500 debit):
```
POST /reconcile {"account_id":"<1000>","period_start":"2026-01-01","period_end":"2026-12-31"}
→ books_balance: 500   ✓ (debit-normal: debits - credits = 500 - 0 = 500)

PATCH /reconcile/<id> {"statement_balance": 500}
→ diff: 0   ✓ (was previously -500 under the old sign, blocking reconciliation entirely)

PATCH /reconcile/<id> {"status": "reconciled"}
→ status: reconciled, reconciled_at: 2026-07-02T20:12:01.742Z   ✓
```

Liability account (2000), unaffected by the change:
```
POST /reconcile (full year 2026)
→ books_balance: 181.92   ✓ (credit-normal: credits - debits = 181.92 - 0 = 181.92)
```

### 🟡 Fix 4: E1-S1 — Lock reconciled recons against clear/unclear

**File:** `server/routes/books/reconcile.js` — both `/clear` and `/clear/:transaction_id` endpoints

**`POST /:recon_id/clear` (added after `if (!recon) ...`):**
```js
// Per E1-S1: a reconciled period is closed. Lock out clear/unclear mutations
// so the audit record at the moment of sign-off stays consistent. Caller can
// reopen by PATCHing status back to 'investigating'.
if (recon.status === 'reconciled') {
  return res.status(409).json({
    error: 'Cannot modify clears on a reconciled period. Set status to investigating first.',
    code: 'RECON_LOCKED',
  });
}
```

**`DELETE /:recon_id/clear/:transaction_id` (added after `if (!recon) ...`):** identical block.

**Smoke tests:**

Reconciled recon (status='reconciled'):
```
POST /reconcile/<RECON>/clear {"transaction_id":"<TXN>"}
→ 409 {"error":"Cannot modify clears on a reconciled period. Set status to investigating first.","code":"RECON_LOCKED"}   ✓

DELETE /reconcile/<RECON>/clear/<TXN>
→ 409 {"error":"Cannot modify clears on a reconciled period. Set status to investigating first.","code":"RECON_LOCKED"}   ✓
```

Draft recon (status='draft') — regression check, lock must NOT fire:
```
POST /reconcile/<DRAFT>/clear {"transaction_id":"<TXN>"}
→ 200, cleared_count: 1   ✓

DELETE /reconcile/<DRAFT>/clear/<TXN>
→ 200, cleared_count: 0   ✓
```

### 🟡 Fix 5: D-S1 — Trial balance year-scope comment

**File:** `server/routes/books/reports.js` — `buildTrialBalanceCsv()`, lines ~209-223

**Before:**
```js
function buildTrialBalanceCsv(year) {
  // Trial balance = sum of debits and credits per account that has any
  // journal_lines in the year. Sum of all debits == sum of all credits
  // (it's a trial balance invariant — verified in smoke test).
  const rows = db.prepare(`
```

**After:**
```js
function buildTrialBalanceCsv(year) {
  // Trial balance = sum of debits and credits per account that has any
  // journal_lines in the year. Sum of all debits == sum of all credits
  // (it's a trial balance invariant — verified in smoke test).
  //
  // SCOPE NOTE (per Wren finding D-S1): this is a YEAR-ACTIVITY trial balance,
  // not a CUMULATIVE balance. It sums debits/credits only for journal entries
  // whose txn_date falls within the year. It does NOT include opening balances
  // for asset/liability/equity accounts, so a bank account with prior-year
  // history will show only in-year activity here — not the running balance
  // a bank-statement reconciler would expect. If/when a true balance sheet
  // is built (Phase H), the date filter below needs to change (or join against
  // an opening_balances table) to include prior-year activity.
  const rows = db.prepare(`
```

Pure doc change, no behavior change. The grep-equivalent of the comment is present in the live file.

---

## 3. No-regression results

| Behavior | Check | Result |
|---|---|---|
| **VB-CAT-02** | debits == credits invariant | ✅ 181.92 = 181.92 (10 journal_lines) |
| **VB-REP-01** | AR aging endpoint shape | ✅ `{ data, as_of, totals }`, 4 customers, total $429, 90+ $429 |
| **VB-REP-02** | AR aging `?as_of=` honored | ✅ `?as_of=2025-02-15` → all $429 in 1-30 bucket |
| **VB-REP-04** | Schedule C ZIP | ✅ 200, `Content-Type: application/zip`, 3 CSVs |
| **VB-REC-01** | Reconciliation list | ✅ 8 accounts (5 asset + 3 liability) |
| **VB-DED-07** | F1 FK cascade intact | ✅ smoke test F1-B1 verified cascade fires |
| **All Books pages** | `/books/{dashboard,invoices,customers,import,categorize,reconcile,reports}` return 200 | ✅ 7/7 |

**Final DB state** (matches pre-fix-pass baseline):
```
transactions:     11
journal_entries:   5
journal_lines:    10
reconciliations:   0
sum of debits:   181.92
sum of credits:  181.92
invariant (debits == credits): True
```

---

## 4. Live health (post-restart)

```bash
$ launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager
$ curl -s http://localhost:3001/api/v1/books/health
{"status":"ok","phase":"E.1","accounts":29,"customers":5,"invoices":5,"transactions":11,"vendor_rules":1,"source_mappings":2,"reconciliations":0,"timestamp":"2026-07-02T20:13:35.608Z"}
```

Service is running, all routes mounted, FK migration is intact (idempotent re-runs are no-ops), helper is wired.

---

## 5. Visual confirmation

Per Hard Rule #6 (visual confirmation for UI changes) and brief item §4. The Books app is **dark-only by design** (per `BooksShell.jsx` line 43: `const dm = true;`); light/dark comparison is N/A for this app.

| View | Screenshot | Result |
|---|---|---|
| Reports page (D-B1 fix verification) | `docs/books/fix-screenshots/ar-aging-after-final.png` | ✅ AR Aging tab renders, 4 customers + totals row, no crash |
| Reconcile list page (E1-S1/E1-S2 — page still renders) | `docs/books/fix-screenshots/reconcile-list-after.png` | ✅ 8-account list, no crash |

Headless Chrome dump-dom confirmed Reports page DOM contains:
- Top nav with all 9 buttons
- "AR Aging" tab as selected (indigo highlight)
- 4 `<tr>` rows with customer names + 90+ amounts ($200, $99, $80, $50)
- `<tfoot>` row with $429.00 totals
- "Bucket: Current (not yet due) · 1–30 (1–30 days past) · 31–60 · 61–90 · 90+" footer text

No `TypeError`, no `Cannot read properties`, no React error boundary message in the DOM.

---

## 6. Files changed (summary)

```
NEW     server/services/journalHelpers.js                          23 lines
MOD     client/src/books/api.js                                    +18 / -1   (arAging reimplemented)
MOD     server/routes/books/transactions.js                        +3 / -10   (import + 2 delete-site swaps)
MOD     server/routes/books/reconcile.js                           +22 / -5   (E1-S1 lock + E1-S2 sign)
MOD     server/routes/books/reports.js                             +10 / -0   (D-S1 comment block)
MOD     client/dist/                                               (rebuilt; vite, ~700ms)
```

Schema: **untouched.** No new tables, no new columns, no migrations. F1 FK is intact; E.1 schema is intact.

---

## 7. Per-brief verification checklist

| Brief item | Status |
|---|---|
| D-B1: `arAging` returns full JSON, no auto-unwrap | ✅ done |
| F1-B1: `journalHelpers.js` deployed, both delete sites swapped | ✅ done |
| E1-S2: `account_type` threaded to `computeBooksBalance` | ✅ done |
| E1-S1: 409 RECON_LOCKED on both /clear endpoints | ✅ done |
| D-S1: comment added to `buildTrialBalanceCsv` | ✅ done |
| No new tables / columns / migrations | ✅ confirmed |
| Categorization.jsx (XC-1) untouched | ✅ confirmed |
| D-NIT1 / E1-NIT1 untouched | ✅ confirmed |
| `deleteInvoice()` not added (out of scope) | ✅ confirmed |
| No refactor of unrelated routes | ✅ confirmed |
| Visual confirmation in dark mode | ✅ confirmed (dark-only app) |
| Backup before any touch | ✅ `tasks-pre-d-f1-e1-fixpass-1783022728.db*` |

---

## 8. Issues encountered

**One path bug in the brief:** Fix 2's `journalHelpers.js` import path was `../../db.js` in the brief, but the correct path from `server/services/` to `server/db.js` is `../db.js`. The first service restart failed with `ERR_MODULE_NOT_FOUND`; I corrected the path in one edit and the second restart came up clean. **No rollback needed** — the fix was confined to the new file. Flagged in §2 Fix 2 for future briefs.

---

## 9. Final verdict

**✅ SHIP.**

All 5 fixes are live, all smoke tests pass, all regression checks pass, schema untouched, backup intact, service healthy at `phase: "E.1"`. AR Aging no longer crashes the Books app; reconciliation now produces the correct sign for asset accounts; reconciled recons are locked; `deleteTransaction()` helper is the single discoverable delete path.

Cinder 🔥 · 2026-07-02 14:14 MDT · **VERDICT: SHIP**
