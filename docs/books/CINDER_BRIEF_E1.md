# Cinder Brief — Phase E.1: Account Reconciliation

**Goal:** Ship per-account monthly reconciliation. User picks an account + period, pastes the bank statement balance, sees which transactions are cleared/uncleared, approves. Catches missed imports and wrong entries that dedupe can't. Prerequisite for the Phase F dashboard numbers being trustworthy.

**Read first:**
1. This brief (you're here).
2. `~/clawd/projects/accounting-app/qa/templates/CINDER_BRIEF_TEMPLATE.md` — 5 Hard Rules. Apply all of them.
3. `~/clawd/projects/accounting-app/qa/QA.md` — 62 active behaviors. Don't break any.
4. `~/clawd/projects/accounting-app/ACCOUNTING-v1.md` §13 (Account Reconciliation, lines 712-812) — canonical spec.
5. `~/clawd/projects/task-manager/server/routes/books/reports.js` — most recent route file, match its style.

**Authoritative code paths:**
- Live service: `http://localhost:3001` (phase D). DB: `~/clawd/projects/task-manager/data/tasks.db`.
- Mount point pattern: `server/index.js` lines 61-70 — all Books routes follow `app.use('/api/v1/books/<name>', router)`.
- Migration pattern: `server/db.js` — detect via `sqlite_master` SQL parse + `PRAGMA table_info`, wrap rebuilds with `foreign_keys=OFF/ON`, idempotent, atomic. Follow the categories and F1 patterns exactly.

**Live state (2026-07-01):**
- 8 asset/liability accounts eligible for reconciliation: codes 1000/1010/1020/1100/1200 (asset) + 2000/2100/2200 (liability). All active.
- `transactions.cleared_at` does NOT exist yet — this migration adds it.
- `reconciliations` and `reconciliation_clears` tables do NOT exist yet — this migration adds them.
- 11 transactions in DB, all uncleared (no `cleared_at` column yet).

---

## Scope

**Build:**
- ✅ DB migration: 2 new tables + 1 new column
- ✅ `server/routes/books/reconcile.js` — new route file
- ✅ `client/src/books/Reconcile.jsx` — new UI (list page + detail view)
- ✅ Wire into `server/index.js` and `client/src/books/BooksShell.jsx`

**Don't build:**
- ❌ Statement PDF parsing (paste-the-balance is v1)
- ❌ Multi-period view (one month at a time)
- ❌ Reconciliation for income/expense accounts (asset/liability only)
- ❌ Inline manual transaction creation (flag it as a follow-up if spec mentions it — don't build)
- ❌ Split transactions

---

## Migration spec

**Backup first (Hard Rule #3):**
```bash
cp ~/clawd/projects/task-manager/data/tasks.db \
   ~/clawd/projects/task-manager/data/backups/tasks-pre-phaseE1-$(date +%s).db
```

**Three schema changes — all in `server/db.js`, all idempotent:**

### 1. `transactions.cleared_at` column (ALTER TABLE, idempotent)
```js
{
  const cols = db.prepare('PRAGMA table_info(transactions)').all().map(c => c.name);
  if (!cols.includes('cleared_at')) {
    safeExec('ALTER TABLE transactions ADD COLUMN cleared_at TEXT');
  }
}
safeExec('CREATE INDEX IF NOT EXISTS idx_transactions_cleared ON transactions(cleared_at)');
```
`null` = uncleared. Timestamp string = cleared (set by reconciliation).

### 2. `reconciliations` table (CREATE IF NOT EXISTS)
```sql
CREATE TABLE IF NOT EXISTS reconciliations (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  account_id        TEXT NOT NULL REFERENCES accounts(id),
  period_start      TEXT NOT NULL,
  period_end        TEXT NOT NULL,
  statement_balance REAL,
  books_balance     REAL NOT NULL,
  diff              REAL,
  cleared_count     INTEGER,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'reconciled', 'investigating')),
  notes             TEXT,
  reconciled_at     TEXT,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);
```
Indexes: `account_id`, `(period_start, period_end)`.

### 3. `reconciliation_clears` table (CREATE IF NOT EXISTS)
```sql
CREATE TABLE IF NOT EXISTS reconciliation_clears (
  id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  reconciliation_id  TEXT NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
  transaction_id     TEXT NOT NULL REFERENCES transactions(id),
  cleared_at         TEXT DEFAULT (datetime('now')),
  UNIQUE(reconciliation_id, transaction_id)
);
```
Indexes: `reconciliation_id`, `transaction_id`.

**Important — no need for DROP/CREATE/RENAME here.** All three are new additions, not rebuilds of existing tables. `ALTER TABLE ADD COLUMN` for `cleared_at`, `CREATE TABLE IF NOT EXISTS` for the two new tables. The F1 FK-disable trick is only needed when rebuilding an existing table — not applicable here.

---

## API spec

New route file: `server/routes/books/reconcile.js`. Mount at `/api/v1/books/reconcile`.

### `GET /api/v1/books/reconcile`
List all asset/liability accounts with their last reconciliation status.

Response:
```json
{
  "data": [
    {
      "account_id": "...",
      "account_code": "1000",
      "account_name": "Business Checking",
      "account_type": "asset",
      "last_reconciled_at": "2026-06-30T00:00:00.000Z",
      "last_reconciled_period": "2026-06",
      "last_status": "reconciled"
    }
  ]
}
```
`last_reconciled_at` / `last_reconciled_period` / `last_status` are null for accounts never reconciled.

### `POST /api/v1/books/reconcile`
Create or retrieve the draft reconciliation for a given account + period.

Body: `{ account_id, period_start, period_end }` (ISO date strings, `period_start` must be 1st of month).

If a draft already exists for this account + period, return it (idempotent). Otherwise create one.

Compute `books_balance` on creation: sum of all `journal_lines.credit - journal_lines.debit` for the account across all time up to and including `period_end`. (For asset accounts, normal balance is debit. For liability, credit. But for simplicity, just return raw sum — let the UI show it as signed.)

Response: the `reconciliations` row + the list of transactions in the period that are not yet cleared (the "to review" list).

### `GET /api/v1/books/reconcile/:recon_id`
Return the full reconciliation detail: the `reconciliations` row + uncleared txns + cleared txns with running balance.

Uncleared: `transactions WHERE account_id = ? AND txn_date BETWEEN period_start AND period_end AND cleared_at IS NULL` (or not in `reconciliation_clears` for this recon).

Cleared: txns in `reconciliation_clears` for this recon, with a running balance column computed in JS (not SQL, simpler).

### `PATCH /api/v1/books/reconcile/:recon_id`
Update the reconciliation: `statement_balance`, `notes`, `status`.

When `statement_balance` is provided, recompute `diff = books_balance - statement_balance`. If `diff == 0` and caller passes `status: 'reconciled'`, stamp `reconciled_at`.

Update `cleared_count` to the current count of rows in `reconciliation_clears` for this recon.

### `POST /api/v1/books/reconcile/:recon_id/clear`
Mark a transaction as cleared in this reconciliation.

Body: `{ transaction_id }`. Inserts into `reconciliation_clears`. Also sets `transactions.cleared_at = datetime('now')`.

Returns updated running balance and new diff.

### `DELETE /api/v1/books/reconcile/:recon_id/clear/:transaction_id`
Un-clear a transaction. Removes from `reconciliation_clears`. Clears `transactions.cleared_at = NULL`.

Returns updated running balance and new diff.

---

## UI spec

**`client/src/books/Reconcile.jsx`** — two views, one component with conditional rendering:

### List view (`/books/reconcile`)
Table of asset/liability accounts:
- Columns: Account Code | Name | Type | Last Reconciled | Status | Action
- "Reconcile" button per row → navigates to `/books/reconcile/:account_id?period=YYYY-MM`
- Period defaults to previous month on button click (compute in JS: if today is July 1, default period is June)

### Detail view (`/books/reconcile/:account_id`)
Top bar:
- Period picker (month + year, defaults to previous month)
- Statement Balance input (number, paste from bank statement)
- Books Balance (read-only, from API)
- Diff display: `diff = books_balance - statement_balance`. Green if 0, red if not.
- "Reconcile" button (enabled only when diff == 0); "Save Draft" button always available.

Two-column layout:
- **Left: Uncleared transactions** — list of txns in the period not yet cleared. Each row: date | vendor | amount | ☐ checkbox to mark cleared. Clicking checkbox calls `POST /clear`.
- **Right: Cleared transactions** — list of txns marked cleared in this recon. Each row: date | vendor | amount | running balance | ☒ checkbox to un-clear. Running balance = cumulative sum as you go down the cleared list.

Empty states: "No transactions in this period" for each column when applicable.

Match the existing Books UI style (look at `Reports.jsx` for the two-tab + header pattern, and `Categorize.jsx` for the two-column list pattern).

---

## Verification spec

**Backup first** (see above). Then:

1. **Schema check:**
   ```bash
   sqlite3 ~/clawd/projects/task-manager/data/tasks.db ".schema reconciliations"
   sqlite3 ~/clawd/projects/task-manager/data/tasks.db ".schema reconciliation_clears"
   sqlite3 ~/clawd/projects/task-manager/data/tasks.db "PRAGMA table_info('transactions');" | grep cleared
   ```

2. **List accounts:**
   ```bash
   curl -s http://localhost:3001/api/v1/books/reconcile | python3 -m json.tool
   ```
   Expected: 8 accounts (5 asset + 3 liability), all with `last_reconciled_at: null`.

3. **Create draft reconciliation:**
   ```bash
   # Use Business Credit Card (account code 2000 — has existing journal entries)
   ACCT=$(sqlite3 ~/clawd/projects/task-manager/data/tasks.db "SELECT id FROM accounts WHERE code='2000';")
   curl -s -X POST http://localhost:3001/api/v1/books/reconcile \
     -H "Content-Type: application/json" \
     -d "{\"account_id\":\"$ACCT\",\"period_start\":\"2026-01-01\",\"period_end\":\"2026-01-31\"}" \
     | python3 -m json.tool
   ```
   Expected: reconciliation row with `status: 'draft'`, `books_balance` computed, `diff: null` (no statement_balance yet), list of uncleared txns for the period.

4. **Mark a transaction cleared:**
   ```bash
   RECON_ID=<from previous response>
   TXN_ID=<from uncleared list>
   curl -s -X POST http://localhost:3001/api/v1/books/reconcile/$RECON_ID/clear \
     -H "Content-Type: application/json" \
     -d "{\"transaction_id\":\"$TXN_ID\"}" | python3 -m json.tool
   ```
   Expected: transaction moves to cleared list, `cleared_at` on the transaction set, running balance updated.

5. **Paste statement balance + reconcile:**
   ```bash
   curl -s -X PATCH http://localhost:3001/api/v1/books/reconcile/$RECON_ID \
     -H "Content-Type: application/json" \
     -d "{\"statement_balance\": <books_balance from step 3>}" | python3 -m json.tool
   ```
   Expected: `diff: 0.0` (if statement_balance == books_balance). Then:
   ```bash
   curl -s -X PATCH http://localhost:3001/api/v1/books/reconcile/$RECON_ID \
     -H "Content-Type: application/json" \
     -d "{\"status\": \"reconciled\"}" | python3 -m json.tool
   ```
   Expected: `status: 'reconciled'`, `reconciled_at` stamped.

6. **Un-clear and verify:**
   ```bash
   curl -s -X DELETE http://localhost:3001/api/v1/books/reconcile/$RECON_ID/clear/$TXN_ID
   sqlite3 ~/clawd/projects/task-manager/data/tasks.db \
     "SELECT id, cleared_at FROM transactions WHERE id='$TXN_ID';"
   ```
   Expected: `cleared_at` is NULL on the transaction. Running balance updated.

7. **Health check:**
   ```bash
   curl -s http://localhost:3001/api/v1/books/health
   ```
   Expected: `phase: "E.1"` (update the health endpoint's phase field in `server/index.js` or wherever it's defined — match the pattern from phase D).

8. **No-regression: AR aging still works:**
   ```bash
   curl -s http://localhost:3001/api/v1/books/reports/ar-aging | python3 -m json.tool
   ```
   Expected: same 4 customers, same buckets as Phase D verified.

---

## Test coverage (required in your report)

End `CINDER_REPORT_E1.md` with:

```markdown
## Test coverage

### Behaviors added
- **VB-REC-01** — Reconciliation list shows all asset/liability accounts with last-reconciled date.
- **VB-REC-02** — Creating a draft reconciliation for an account + period computes books_balance from journal_lines.
- **VB-REC-03** — Marking a transaction cleared inserts a reconciliation_clears row and sets transactions.cleared_at.
- **VB-REC-04** — Un-clearing a transaction removes the reconciliation_clears row and nulls transactions.cleared_at.
- **VB-REC-05** — Pasting a statement_balance computes diff = books_balance - statement_balance.
- **VB-REC-06** — diff == 0 allows status → 'reconciled'; diff != 0 blocks it (or at least warns).
- **VB-REC-07** — Creating the same draft twice (same account + period) is idempotent — returns the existing draft.
- **VB-REC-08** — Reconciliation list UI renders account table with last-reconciled status.
- **VB-REC-09** — Reconciliation detail UI shows uncleared txns on the left, cleared with running balance on the right.
- **VB-REC-10** — Period picker defaults to previous month.
- **VB-REC-11** — Health endpoint reports phase: "E.1" after mount.

### Behaviors verified (re-tested post-E.1)
- **VB-REP-01** — AR aging still works after schema migration.
- **VB-DED-07** — deleteTransaction cascade still intact (cleared_at added via ALTER TABLE, not rebuild).
```

---

## Deliverable

`~/clawd/projects/accounting-app/CINDER_REPORT_E1.md` — TL;DR at top, backup trail, schema diffs, build details, all smoke test transcripts, test coverage section, restart command, health check.

Use `minimax/MiniMax-M3`. Estimated time: 60-80 min (this is bigger than D — new tables, new UI, more endpoints). Take the backup before anything. If you hit anything that requires a change outside this scope, STOP and surface.

Push completion event when done.
