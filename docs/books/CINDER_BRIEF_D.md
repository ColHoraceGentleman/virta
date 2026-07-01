# Cinder Brief — Phase D: Reports

**Goal:** Ship read-only financial reports for Virta Books: AR aging (JSON) and Schedule C export (ZIP of 3 CSVs). Pure SQL queries against existing journal entries + invoices + accounts. No new tables, no schema changes.

**Read first:**
1. This brief (you're here).
2. `~/clawd/projects/accounting-app/qa/templates/CINDER_BRIEF_TEMPLATE.md` — the **5 Hard Rules** apply; especially #1 (STOP on data loss) and #5 (atomic transactions, where applicable).
3. `~/clawd/projects/accounting-app/qa/QA.md` — full behavior list. Don't break any of these.
4. `~/clawd/projects/accounting-app/ACCOUNTING-v1.md` §4 (AR Aging) and §7 (Schedule C CSV Export) — canonical spec.
5. `~/clawd/projects/accounting-app/CINDER_FIXES_C.md` and `~/clawd/projects/accounting-app/CINDER_REPORT_F1.md` — recent context (F1 just shipped; `journal_entries` source_id is now FK-cascaded).

**Authoritative code paths:**
- Spec sections to implement: §4 AR Aging (lines ~318-328), §7 Schedule C CSV Export (lines ~547-583).
- Existing routes: `~/clawd/projects/task-manager/server/routes/books/` (see `transactions.js`, `imports.js` for style/pattern conventions).
- Live service: `http://localhost:3001` (currently phase C). DB: `~/clawd/projects/task-manager/data/tasks.db`.
- Live fronted URL: `https://virta.muckdart.com/books`

**Live state right now (verified 2026-07-01 16:28 MDT):**
- Service phase: C. Counts: 29 accounts, 5 customers, 5 invoices (1 draft + 4 overdue), 11 txns, 0 near-dups, 1 vendor rule, 2 source mappings, 5 journal entries (10 journal_lines).
- 4 of 5 invoices are `overdue` (test data from prior phases). That's the dataset AR aging will work against.
- Schema reminder: `invoices` has `issue_date`, `due_date`, `status` (CHECK: draft/sent/paid/overdue/void), `total`, `subtotal`, `tax`. No `amount_paid` column yet (Phase B kept paid-at-fully-binary, not partial). AR aging therefore computes outstanding = `total` for non-paid/non-void/non-draft.

---

## Scope and what NOT to touch

**Be specific:**
- ✅ Add `GET /api/v1/books/reports/ar-aging` — JSON.
- ✅ Add `GET /api/v1/books/reports/schedule-c?year=YYYY` — returns ZIP file (`Content-Type: application/zip`).
- ✅ Optional but recommended: a minimal `client/src/books/Reports.jsx` with two tabs (AR Aging + Schedule C Export) and the year picker. If you skip the UI, at minimum the endpoints work via curl — but Echo will need a real page to test against. **Recommended: ship the UI.** Match the existing Books shell style.
- ✅ Add tests to QA.md via the Test coverage section at the end of your report (required by CINDER_BRIEF_TEMPLATE).

**Be explicit:**
- ❌ Don't touch the schema. No new tables, no new columns, no new migrations. (Phase D is read-only by design.)
- ❌ Don't modify F1's `deleteTransaction` helper or the journal_entries FK. They're settled.
- ❌ Don't add a separate `trial-balance` endpoint. The trial balance is a CSV *inside* the Schedule C ZIP, not a standalone route.
- ❌ Don't refactor unrelated routes (transactions.js, imports.js, accounts.js, customers.js, etc.).
- ❌ Don't add the asset register or profitability dashboard — those are Phase F.

---

## AR Aging endpoint — `GET /api/v1/books/reports/ar-aging`

**Spec reference:** §4 (lines 318-328).

**Query semantics:**
- Source: `invoices` table.
- Filter: `status IN ('sent', 'overdue')` (draft and paid are excluded; void excluded).
- Aging: bucket by `days_past_due = (today - due_date)` in days. Buckets:
  - `current` — `days_past_due <= 0` (not yet due)
  - `days_30` — `1 <= days_past_due <= 30`
  - `days_60` — `31 <= days_past_due <= 60`
  - `days_90` — `61 <= days_past_due <= 90`
  - `days_90_plus` — `days_past_due >= 91`
- For v1, **outstanding amount = `total`** (no `amount_paid` column; full paid invoices are excluded by status filter anyway). Note this assumption in your report — Phase B's design has a comment indicating this.
- Group by `customer_id`, sum amounts per bucket per customer.

**Output format (matches spec exactly):**
```json
{
  "data": [
    {
      "customer_id": "...",
      "customer_name": "...",
      "current": 0,
      "days_30": 200.00,
      "days_60": 50.00,
      "days_90": 0,
      "days_90_plus": 179.00,
      "total": 429.00
    }
  ],
  "as_of": "2026-07-01",
  "totals": { "current": ..., "days_30": ..., "days_60": ..., "days_90": ..., "days_90_plus": ..., "total": ... }
}
```

Default sort: by `total` desc. `as_of` is today's date (server-side).

**Optional query params:** `?as_of=YYYY-MM-DD` (test mode — compute aging as of that date, not today). Defaults to today. Document this in your report.

**UI (recommended):** `client/src/books/Reports.jsx` with a "AR Aging" tab. Table with columns: Customer | Current | 1-30 | 31-60 | 61-90 | 90+ | Total. Sort by Total desc. Click row → drill-down to invoice list (just navigate to a filtered invoices view filtered by customer; the invoices list already exists in some form, you don't need to build a new one).

---

## Schedule C export endpoint — `GET /api/v1/books/reports/schedule-c?year=YYYY`

**Spec reference:** §7 (lines 547-583).

**Query semantics:**
- Source: `journal_entries` + `journal_lines` + `accounts` (joined).
- For year YYYY: filter `journal_entries.txn_date` between `${YYYY}-01-01` and `${YYYY}-12-31` inclusive.
- Income accounts (account code 4000-4999) → `schedule_c_income.csv`
- Expense accounts (6000-6999) → `schedule_c_expenses.csv`
- Asset/Liability/Equity accounts (1000-3999, 5000-5999) → `trial_balance.csv` only (not in income/expenses)

**Three CSV files inside the ZIP:**

1. `schedule_c_income.csv`:
   ```
   date,source,gross_amount,cogs_amount,net,account_code,account_name
   2026-01-15,Etsy,1245.00,0,1245.00,4010,Etsy Sales
   ```
   - `date` = journal_entry.txn_date
   - `source` = description of the journal entry (or the linked transaction's vendor, if available)
   - `gross_amount` = sum of credits to the income account (since income has credit normal balance)
   - `cogs_amount` = 0 (no COGS in v1; explicit zero column for spec compliance)
   - `net` = `gross_amount - cogs_amount` (== `gross_amount` for v1)
   - `account_code` = the account code
   - `account_name` = the account name

2. `schedule_c_expenses.csv`:
   ```
   date,vendor,account_code,account_name,irs_line,amount,memo
   2026-01-03,Joann,6100,Office Supplies,Line 18,50.00,fabric
   ```
   - `date` = journal_entry.txn_date
   - `vendor` = linked transaction's `vendor_normalized` (or `description` if null)
   - `account_code`, `account_name` from accounts
   - `irs_line` = `accounts.irs_line` (e.g., "Line 18", "Line 22", "Line 24a", "Line 27a")
   - `amount` = sum of debits to the expense account
   - `memo` = transaction notes if present, else journal_entry.description

3. `trial_balance.csv`:
   ```
   account_code,account_name,debits,credits
   1000,Business Checking,15000.00,12500.00
   4010,Etsy Sales,0,1245.00
   ```
   - One row per account that has any journal_lines in the year
   - `debits` = sum of `journal_lines.debit` for that account in the year
   - `credits` = sum of `journal_lines.credit` for that account in the year
   - Sum of all debits across the file should equal sum of all credits (it's a trial balance — that's the invariant; verify in smoke test)

**Filename:** `chantelle-books-{year}-export-{YYYY-MM-DD}.zip` where `{YYYY-MM-DD}` is the export date (not the year being exported).

**Response headers:** `Content-Type: application/zip`, `Content-Disposition: attachment; filename="chantelle-books-{year}-export-{YYYY-MM-DD}.zip"`.

**Error handling:**
- `400` if `?year=` is missing or not a valid 4-digit year.
- `404` if year is valid but no journal entries exist (empty ZIP? or 404? — your call, document the choice). I'd lean 200 with an empty ZIP + a notice row in each CSV (just the headers) so the user gets a downloadable artifact.
- `500` if ZIP generation fails (rare; log and surface the error).

**UI (recommended):** second tab in `Reports.jsx`. Year picker (default current year), "Export" button. Triggers the download.

---

## Implementation guidance

**Where to put the routes:**
- `server/routes/books/reports.js` (new file). Exports the router, mounted in `server/index.js` at `/api/v1/books/reports`. Match the style of existing route files (look at `accounts.js` or `customers.js` for the import-and-mount pattern).

**Where to put the UI:**
- `client/src/books/Reports.jsx` (new file). Add a route/tab in `BooksShell.jsx` (look at how the existing "Settings" tab gets wired in — same pattern).

**Build artifacts:** After the route file lands, the `client/src/books/BooksShell.jsx` change should trigger the existing `npm run build` in `client/` (or whatever the existing pattern is — look at how Phase C/F1 builds were deployed; `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager` for restart). Same deploy as F1.

**ZIP generation:** Use Node's built-in `zlib` and the `archiver` npm package (check if it's already in `package.json`; if not, add it as a dep). Or use a streaming approach with raw `zlib.gzip` if you want to avoid a new dep. Either is fine.

**No partial payments in v1:** Document this in the report. The 4 overdue invoices from Phase B test data are all unpaid in full; AR aging sums their `total`. When Phase B gets partial-payment support (future phase), AR aging should subtract `SUM(payments.amount)` per invoice.

**Date arithmetic:** Use SQLite's `JULIANDAY(date) - JULIANDAY('now')` for days-past-due. Watch out for time zones — use UTC dates only. If you need today's date in SQLite, use `date('now')` (returns UTC date string in ISO format). Test edge cases around midnight.

---

## Verification spec (required by CINDER_BRIEF_TEMPLATE)

**Smoke tests (do these and capture output):**

1. **AR aging — current data:**
   ```bash
   curl -s http://localhost:3001/api/v1/books/reports/ar-aging | python3 -m json.tool
   ```
   Expected: 1 customer (or however many exist with overdue invoices), buckets populated, totals consistent (`current + days_30 + days_60 + days_90 + days_90_plus == total`).

2. **AR aging — as-of in the past:**
   ```bash
   curl -s "http://localhost:3001/api/v1/books/reports/ar-aging?as_of=2025-02-15" | python3 -m json.tool
   ```
   Expected: with the 4 overdue invoices having `due_date=2025-02-01`, the 2025-02-15 as-of should put them in the `days_30` bucket (14 days past due).

3. **Schedule C export — current year (no data):**
   ```bash
   curl -s -o /tmp/sb.zip http://localhost:3001/api/v1/books/reports/schedule-c?year=2026
   unzip -l /tmp/sb.zip
   ```
   Expected: ZIP contains 3 CSV files, each with just a header row (no journal entries for 2026 yet).

4. **Schedule C export — year with data:**
   The seeded journal entries are from January 2026. Use year=2026:
   ```bash
   curl -s -o /tmp/sb.zip "http://localhost:3001/api/v1/books/reports/schedule-c?year=2026"
   unzip -p /tmp/sb.zip schedule_c_income.csv
   unzip -p /tmp/sb.zip schedule_c_expenses.csv
   unzip -p /tmp/sb.zip trial_balance.csv
   ```
   Expected: Each CSV has at least one data row from the test journal entries. Trial balance debits == credits (the invariant).

5. **Error handling:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/v1/books/reports/schedule-c
   ```
   Expected: 400 (year is required).
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001/api/v1/books/reports/schedule-c?year=abcd"
   ```
   Expected: 400 (invalid year).

**No-regression checks (re-run from QA.md):**
- Pick at least one behavior from `qa/QA.md` that's *adjacent* to your changes (probably `VB-CAT-02` — categorization creates journal entries) and verify the journal entries you exported still match.

**Live health:** `curl -s http://localhost:3001/api/v1/books/health` should return OK after restart.

---

## Test coverage section (REQUIRED in your report)

End your `CINDER_REPORT_D.md` with:

```markdown
## Test coverage

### Behaviors added (new in this phase)
- **VB-REP-01** — AR aging endpoint returns bucketed customer balances.
- **VB-REP-02** — AR aging honors `?as_of=` for past-dated reports.
- **VB-REP-03** — AR aging excludes draft / paid / void invoices.
- **VB-REP-04** — Schedule C export produces a ZIP with 3 CSVs.
- **VB-REP-05** — Schedule C income CSV aggregates income accounts (4000-4999) by journal entry.
- **VB-REP-06** — Schedule C expenses CSV aggregates expense accounts (6000-6999) with `irs_line` from accounts.
- **VB-REP-07** — Schedule C trial balance CSV debits == credits invariant.
- **VB-REP-08** — Schedule C export returns 400 for missing or invalid year.
- **VB-REP-09** — Empty-year Schedule C export returns ZIP with header-only CSVs (not 404).
- **VB-REP-10** — AR aging totals row sums all buckets correctly.
```

If you also built the UI, add 3-5 more behaviors like:
- **VB-REP-11** — Reports page shows AR aging tab and Schedule C tab.
- **VB-REP-12** — AR aging table is sortable.
- **VB-REP-13** — Schedule C export triggers a browser download with the correct filename.

### Behaviors verified (you re-tested these and they still pass)
- **VB-CAT-02** — categorization creates balanced journal entries (re-tested via trial_balance.csv invariant).

If you find behaviors that should be added but discovered gaps, list those under a separate heading.

---

## Deliverable

`~/clawd/projects/accounting-app/CINDER_REPORT_D.md` with TL;DR, smoke test transcripts, test coverage section, deploy command, and a final verdict line. Use the CINDER_BRIEF_TEMPLATE's "Deliverable" structure.

## Constraints

- Read-only against the schema. If you need a new column or table, STOP and surface.
- Use `minimax/MiniMax-M3` (your default).
- Estimated time: 45-60 min for the endpoints + UI. If you skip the UI, 25-35 min. Stay focused.
- Take a DB backup before any change, even though Phase D shouldn't need one: `cp ~/clawd/projects/task-manager/data/tasks.db ~/clawd/projects/task-manager/data/backups/tasks-pre-phaseD-$(date +%s).db` (defensive — Hard Rule #3).

Push completion event to me when done. Escalate on BLOCKER.
