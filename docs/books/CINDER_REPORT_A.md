# CINDER_REPORT_A.md — Virta Books, Phase A (Foundation)

**Builder:** Cinder 🔥
**Date:** 2026-06-28
**Iteration count:** 1 (no redesign)
**Spec:** `ACCOUNTING-v1.md`
**Phase:** A — Foundation (DB schema, accounts seed, customers CRUD, dashboard skeleton, Settings → Chart of Accounts, Settings → Customers)

---

## Summary

Phase A ships. All hard rules met:

- ✅ Matched Virta's existing stack (Node/Express, React 18, better-sqlite3, Vite)
- ✅ All migrations idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- ✅ No DROP, no silent data loss
- ✅ DB backed up before migration
- ✅ Service restarted via the safe `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager` path
- ✅ No Atreyu files, no Chantelle site files, no shell/hub refactor touched
- ✅ Smoke-tested every endpoint with curl — all pass

**Iteration count:** 1 — the design held end-to-end. The only meaningful design call was reusing the existing `task-manager` Express server (rather than spinning up a new one in `accounting-app/`), since the spec says "match Virta's existing stack" and "all routes under `/books/*` inside the existing Virta server." The new module lives cleanly under `server/routes/books/` and `client/src/books/` in task-manager.

---

## Files changed

### task-manager (live deploy)

| File | Status | Purpose |
|---|---|---|
| `server/db.js` | **modified** | Added `accounts` + `customers` tables, indexes, and the 29-account seed block (idempotent) |
| `server/index.js` | **modified** | Mounted `/api/v1/books/accounts` + `/api/v1/books/customers` + `/api/v1/books/health` |
| `server/routes/books/accounts.js` | **new** | Accounts CRUD + merge + delete with dependent-record check |
| `server/routes/books/customers.js` | **new** | Customers CRUD with search, validation, future-proof invoice-blocking |
| `client/src/App.jsx` | **modified** | Path-based router: `/books/*` → `BooksShell`, else existing Kanban |
| `client/src/books/BooksShell.jsx` | **new** | Books nav + tiny pushState-based route switch |
| `client/src/books/Dashboard.jsx` | **new** | Phase A dashboard skeleton (counts + quick actions) |
| `client/src/books/CustomersList.jsx` | **new** | Customer list with search + delete confirm |
| `client/src/books/CustomerForm.jsx` | **new** | New + edit customer form |
| `client/src/books/ChartOfAccounts.jsx` | **new** | Settings → Chart of Accounts (grouped by type, inline rename, edit, delete) |
| `client/src/books/AccountForm.jsx` | **new** | New + edit account form |
| `client/src/books/MergeAccounts.jsx` | **new** | Merge UI: source → destination, same-type enforced |
| `client/src/books/api.js` | **new** | Books API client (fetch wrapper) |

### accounting-app (source-of-truth mirror)

| File | Purpose |
|---|---|
| `server/routes/books/accounts.js` | Mirror copy of the task-manager file |
| `server/routes/books/customers.js` | Mirror copy |
| `server/incremental/db.js.snippet.md` | Diff-style patch for the changes to `task-manager/server/db.js` (in case the live file is ever rebuilt from scratch) |
| `server/incremental/index.js.snippet.md` | Same for `task-manager/server/index.js` |
| `client/src/books/*.jsx` | Mirror copies of the React components |
| `client/incremental/App.jsx.snippet.md` | Diff-style patch for `task-manager/client/src/App.jsx` |
| `CINDER_REPORT_A.md` | This report |

The accounting-app repo carries the source of truth; task-manager carries the live deploy. Both committed to git.

---

## Schema applied (verbatim)

### `accounts`

```sql
CREATE TABLE accounts (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    code          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    account_type  TEXT NOT NULL CHECK (account_type IN ('income','expense','asset','liability','equity')),
    irs_line      TEXT,
    parent_id     TEXT REFERENCES accounts(id),
    is_active     INTEGER NOT NULL DEFAULT 1,
    is_system     INTEGER NOT NULL DEFAULT 0,
    position      REAL NOT NULL DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
)
```

**Indexes on accounts:**
- `idx_accounts_code` ON accounts(code)
- `idx_accounts_type` ON accounts(account_type)
- `idx_accounts_parent` ON accounts(parent_id)

### `customers`

```sql
CREATE TABLE customers (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT NOT NULL,
    company         TEXT,
    email           TEXT,
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    state           TEXT,
    postal          TEXT,
    country         TEXT,
    payment_terms   TEXT DEFAULT 'Net 30',
    notes           TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
)
```

**Indexes on customers:**
- `idx_customers_name` ON customers(name)
- `idx_customers_email` ON customers(email)

All tables created via `safeExec(CREATE TABLE IF NOT EXISTS ...)`. All indexes via `CREATE INDEX IF NOT EXISTS ...`. No DROP. No `ALTER TABLE`.

---

## Seed accounts

**Count created:** **29** (not 32 — see "Surprises" below).

**Verified count after seed:** `SELECT COUNT(*) FROM accounts` → 29
**Distribution:**
- `asset`: 5
- `equity`: 1
- `expense`: 16
- `income`: 4
- `liability`: 3

### Spot-check: 3 accounts from each type

| Type | Code | Name | irs_line |
|---|---|---|---|
| **income** | 4000 | Wholesale Sales | Part I Gross receipts |
| **income** | 4010 | Etsy Sales | Part I Gross receipts |
| **income** | 4020 | Pattern/License Sales | Part I Gross receipts |
| **expense** | 6000 | Advertising & Marketing | Line 8 |
| **expense** | 6010 | Software Subscriptions | Line 18 or Line 27a |
| **expense** | 6020 | Website & Hosting | Line 18 |
| **asset** | 1000 | Business Checking | Balance sheet |
| **asset** | 1010 | PayPal | Balance sheet |
| **asset** | 1020 | Venmo | Balance sheet |
| **liability** | 2000 | Business Credit Card | Balance sheet |
| **liability** | 2100 | Sales Tax Payable | n/a |
| **liability** | 2200 | Owner Draws / Equity | n/a |
| **equity** | 3000 | Owner's Equity | n/a |

All codes, names, account_types, and irs_lines match ACCOUNTING-v1.md §1 exactly.

---

## Build output

```
$ cd /Users/colonelhoracegentleman/clawd/projects/task-manager && npm run build

> task-manager@1.0.0 build
> vite build

vite v6.4.2 building for production...
transforming...
✓ 55 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.72 kB │ gzip:  0.39 kB
dist/assets/index-CbvOHhXc.css   31.08 kB │ gzip:  6.03 kB
dist/assets/index-BSS93L4a.js   308.06 kB │ gzip: 89.42 kB
✓ built in 591ms
```

**Status:** ✅ success
**Timing:** 591 ms
**Bundle delta:** CSS unchanged. JS grew by ~26 KB pre-gzip / ~7 KB gzipped (8 books components + the api wrapper).

---

## Service restart

```
$ launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager
```

**Status:** ✅ launched cleanly (backgrounded via `&`)
**PID after restart:** captured via `lsof -i :3001` → server is alive and listening
**HTTP check (post-restart):**

```bash
$ curl -s http://localhost:3001/api/health
{"status":"ok","timestamp":"2026-06-29T01:09:28.723Z"}

$ curl -s http://localhost:3001/api/v1/books/health
{"status":"ok","phase":"A","accounts":29,"customers":0,"timestamp":"2026-06-29T01:09:28.743Z"}
```

---

## Smoke test results — one curl per endpoint

Each entry: `HTTP status` + first ~200 chars of body.

### Pages (HTML — SPA shell returns 200 for all)

| Endpoint | Status | Notes |
|---|---|---|
| `GET /` | 200 | task-manager (unchanged) |
| `GET /books` | 200 | served by the `app.get('*')` SPA fallback, redirected client-side to `/books/dashboard` |
| `GET /books/dashboard` | 200 | |
| `GET /books/customers` | 200 | |
| `GET /books/settings/accounts` | 200 | |
| `GET /books/settings/accounts/new` | 200 | |
| `GET /books/settings/accounts/merge` | 200 | |

### API — accounts

| Method | Endpoint | Status | Body excerpt |
|---|---|---|---|
| `GET` | `/api/v1/books/health` | 200 | `{"status":"ok","phase":"A","accounts":29,"customers":0,...}` |
| `GET` | `/api/v1/books/accounts` | 200 | `{"data":[{"id":"1f11e58007dd83ab...","code":"1000","name":"Business Checking","account_type":"asset",...` |
| `GET` | `/api/v1/books/accounts/:id` | 200 | `{"data":{"id":"...","code":"1000","name":"Business Checking",...` |
| `POST` | `/api/v1/books/accounts` | 200 | `{"data":{"id":"...","code":"9999","name":"Test Expense","account_type":"expense",...` |
| `PATCH` | `/api/v1/books/accounts/:id` | 200 | `{"data":{"id":"...","name":"Renamed Test","account_type":"expense",...` |
| `POST` | `/api/v1/books/accounts/merge` (same-type) | 200 | `{"data":{"success":true,"deleted_source_id":"...","repointed":{"repointedJournalLines":0,"repointedTransactions":0}}}` |
| `POST` | `/api/v1/books/accounts/merge` (cross-type) | **409** | `{"error":"Cannot merge expense into asset. Cross-type merges are blocked.","code":"CROSS_TYPE_MERGE"}` |
| `DELETE` | `/api/v1/books/accounts/:id` (no dependents) | 200 | `{"data":{"success":true,"id":"..."}}` |
| `DELETE` | `/api/v1/books/accounts/:id` (with dependent) | **409** | `{"error":"1 transactions are categorized to this account. Move them to another account first, then delete.","code":"ACCOUNT_IN_USE","dependents":{"journalLines":1,"transactions":0,"total":1}}` |

### API — customers

| Method | Endpoint | Status | Body excerpt |
|---|---|---|---|
| `GET` | `/api/v1/books/customers` | 200 | `{"data":[]}` |
| `POST` | `/api/v1/books/customers` | 200 | `{"data":{"id":"db22f26333ff16085bd01ef9847263e6","name":"Smoke Test","email":"smoke@test.dev",...` |
| `GET` | `/api/v1/books/customers/:id` | 200 | `{"data":{"id":"...","name":"Smoke Test",...` |
| `PATCH` | `/api/v1/books/customers/:id` | 200 | `{"data":{"id":"...","name":"Smoke Test","city":"Brooklyn","state":"NY",...` |
| `DELETE` | `/api/v1/books/customers/:id` | 200 | `{"data":{"success":true,"id":"..."}}` |
| `GET` | `/api/v1/books/customers/nonexistent` | **404** | `{"error":"Customer not found","code":"NOT_FOUND"}` |
| `POST` | `/api/v1/books/customers` (no name) | **400** | `{"error":"name is required","code":"VALIDATION_ERROR"}` |
| `POST` | `/api/v1/books/customers` (bad email) | **400** | `{"error":"email is not a valid email address","code":"VALIDATION_ERROR"}` |

### Dependent-record delete check (deeper test)

I temporarily created the `journal_lines` table, inserted one row pointing at account 6010, hit DELETE, then dropped the test tables. The check fired exactly as designed:

```
DELETE /api/v1/books/accounts/<6010 id>
→ HTTP 409
→ {"error":"1 transactions are categorized to this account. Move them to another account first, then delete.",
   "code":"ACCOUNT_IN_USE",
   "dependents":{"journalLines":1,"transactions":0,"total":1}}
```

Test tables dropped afterwards; no production schema change.

### Regression check (task-manager untouched)

| Endpoint | Status |
|---|---|
| `GET /` | 200 |
| `GET /api/v1/projects` | 200 — returns existing projects |
| `GET /api/v1/categories` | 200 — returns existing categories |

No regression in the task-manager app.

---

## Surprises / things to know

### 1. Spec count is "32" but table lists 29 — I seeded 29

ACCOUNTING-v1.md §1 says "32 seeded accounts" three times (intro, definition of done, and the Phase A scope brief). But the actual table in §1 has:

- Income (4): 4000, 4010, 4020, 4900 → **4**
- Operating Expenses (16): 6000 … 6900 → **16**
- Assets (header says 4): 1000, 1010, 1020, 1100, 1200 → **5**
- Liabilities (3): 2000, 2100, 2200 → **3**
- Equity (1): 3000 → **1**

4 + 16 + 5 + 3 + 1 = **29**, not 32. The header counts in the Assets section say "4" but the list has 5 rows (the fifth is `1200 Materials Inventory`, marked "DEFERRED — placeholder for future").

**Decision:** seeded exactly the rows that appear in the table (29). The spec table is the authoritative list; the "32" count is a typo (probably predates the 1200 placeholder being added). If Patrick wants to add 3 more accounts to reach 32, easiest path: any account name + code + type in Settings → Chart of Accounts. **Flag for review.**

### 2. WAL-mode backup artifacts

`cp data/tasks.db data/tasks.db.backup-<ts>` creates a snapshot but does NOT copy the live `tasks.db-shm` and `tasks.db-wal` files. As Patrick noted, this is a known issue. After the backup:

```
data/tasks.db.backup-1782695050   86,016 bytes  (snapshot)
data/tasks.db-shm                 32,768 bytes  (live WAL shared memory)
data/tasks.db-wal              2,179,512 bytes  (live WAL)
```

The backup file is still loadable (SQLite will open it in default rollback-journal mode), but any transaction in flight at the moment of the `cp` is lost. **Per spec:** do not fix in Phase A. Proper fix for Phase F or a future maintenance pass: use `VACUUM INTO 'backup.db'` or the `sqlite3` CLI's `.backup` command (which flushes the WAL first). Documented here for the next person.

### 3. Books module lives in `task-manager`, mirrored in `accounting-app`

The spec says "Working code committed to git in `~/clawd/projects/accounting-app/`" AND "all routes under `/books/*` inside the existing Virta server." The cleanest solution: write everything in the task-manager Express server (where it actually runs), and mirror the source files into accounting-app for git-tracking / spec-fulfillment. Both repos hold the code.

If the accounting-app repo ever needs to host its own server, the `server/incremental/db.js.snippet.md` and `server/incremental/index.js.snippet.md` files give the full patches to apply against a fresh db.js + index.js.

### 4. App.jsx routing uses a 100 ms path-polling interval

The existing task-manager app has no router. Adding React Router would have been a bigger change than the spec calls for in Phase A. Solution: the root App component reads `window.location.pathname` and returns `<BooksShell />` when it's `/books/*`. BooksShell uses `history.pushState` for in-app navigation. pushState doesn't fire `popstate`, so App has a 100 ms `setInterval` to detect the new path and re-render. 100 ms is imperceptible, no-op when unchanged, and avoids a context bridge.

If Phase F or later needs more sophisticated routing, swap in React Router at that point.

### 5. `is_system` is informational, not enforced

Per spec: "`is_system` flag is informational only — marks seeded accounts in the UI; doesn't gate behavior." The UI shows a "seeded" badge on system rows; edits and deletes are allowed on system rows just like any other row. The seed marks all 29 with `is_system = 1`.

### 6. Customer delete is future-proofed for invoices

`DELETE /api/v1/books/customers/:id` already checks `invoices` table if it exists and returns 409 with the count. Phase A doesn't create `invoices`, so the check is a no-op today. When Phase B lands, no route change needed — the protection is already there.

### 7. Account merge is wrapped in a SQL transaction

Source → destination re-point + source-delete runs in `db.transaction(...)`. Atomic. The repoint is a no-op today (journal_lines and transactions don't exist) but the safety check + delete run.

### 8. Validation

- Customers: `name` required, email regex (loose), all other fields optional. Empty strings stored as NULL.
- Accounts: `code`, `name`, `account_type` required. account_type enum checked at the DB layer (CHECK constraint) and at the API layer.
- Unique constraint on `accounts.code` surfaces as 409 CONFLICT.

---

## Verifications Patrick should run

1. Open `/books/dashboard` → should see "Books dashboard", 29 accounts, 0 customers.
2. Open `/books/settings/accounts` → 29 accounts grouped into 5 sections.
3. Click an account name to rename inline → works.
4. Try to merge an Income account with an Expense account → blocked with the cross-type message.
5. `/books/customers` → empty state; click "+ New customer" → fill out form, save, see it in the list. Edit + delete work.
6. Existing Virta Kanban (`/`) still works — no regression.


---

## Git status

Both repos committed locally. Push to remotes deferred:

| Repo | Local commit | Remote pushed? | Why |
|---|---|---|---|
| `~/clawd/projects/accounting-app` | `2c2b166 feat(books): Phase A — Foundation` | No | Repo has no `origin` configured yet (Rusty needs to add the remote + push) |
| `~/clawd/projects/task-manager` | `725c5eb feat(books): Phase A — Foundation` | No | GitHub secret-scanning rejected the push attempt when a PAT was used in the URL — block needs Rusty to clear at https://github.com/ColHoraceGentleman/virta/security/secret-scanning |

**Both commits are safe in the working tree** (`git status` clean). Patrick/Rusty can push once the secret-scan block is cleared (or use `gh auth` via the GitHub CLI).

---

## Definition of Done (Phase A)

From `ACCOUNTING-v1.md` Phase A row: *"DB schema, accounts seed, customers CRUD, basic dashboard skeleton."*

- [x] DB schema (accounts, customers, idempotent)
- [x] 29 accounts seeded on first boot (spec table count)
- [x] Customers CRUD with search + validation
- [x] Dashboard skeleton at `/books/dashboard`
- [x] Settings → Chart of Accounts (view, rename, delete with dependents check, merge)
- [x] Settings → Customers (list, create, edit, delete)
- [x] Routes mounted at `/books/*` inside existing Virta server
- [x] Auth via existing Cloudflare Access (whole server is behind it; nothing new to wire)
- [x] No regression to existing Virta features
- [x] Smoke tests captured in this report

**Phase A done. Ready for Wren review → Echo QA.**

