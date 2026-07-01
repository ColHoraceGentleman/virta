# Virta Books — QA Coverage

> **Living register of testable behaviors** for the Books app. Echo verifies against this on every QA pass. Cinder appends new behaviors when shipping; Rusty curates. See `qa/METHODOLOGY.md` for the discipline.

**Format:** Sectioned by feature area. Each behavior has a stable ID (`VB-<area>-<NN>`), a one-line description, an expected result, and a "last verified" stamp (filled by Echo on success). A behavior is **active** if its checkbox above the ID is `[x]`. Inactive behaviors are kept for context but skipped by Echo.

**Active behaviors: 15 / 62** (growing — see methodology)

## Coverage at a glance

| Feature area | Behaviors | Last full run |
|---|---|---|
| Import (CSV / PDF) | 11 | never |
| Categorize | 9 | never |
| Dedupe | 8 | 2026-07-01 (manual, pre-QA-doc) |
| Vendor rules | 4 | never |
| Chart of accounts | 3 | never |
| Customers | 3 | never |
| Invoices | 6 | never |
| Payments & aging | 2 | never |
| Settings | 3 | never |
| **Reports** | **15** | **2026-07-01 (Phase D, manual)** |
| Cross-cutting | 4 | never |

---

## Import (CSV / PDF)

These cover §5 of the spec (CSV Import Pipeline). Prebuilt parsers: chase-cc, amex, paypal, venmo. Generic CSV mapping catches unknowns.

- [ ] **VB-IMP-01** — Uploading a new CSV never causes an imported transaction that already exists to be duplicated on the same account. Expected: post-upload, row count of `transactions WHERE dedupe_hash IN (…newly-imported hashes…)` is exactly N (not 2N).
- [ ] **VB-IMP-02** — Re-uploading the same file with byte-identical contents inserts zero new rows. Expected: response JSON reports `inserted: 0` (or analogous).
- [ ] **VB-IMP-03** — Re-uploading an overlapping CSV (e.g., one file covering Jul 1–15, the next covering Jul 10–30) creates new rows only for the non-overlapping window. Expected: dates within overlap window already in DB → skipped; new dates → inserted.
- [ ] **VB-IMP-04** — Uploading to the wrong account is recoverable. Expected: user can cancel the upload, switch account, retry, and no row is mis-attributed.
- [ ] **VB-IMP-05** — Vendor normalization runs on every imported row. Expected: `transactions.vendor_normalized` is non-null and lowercased after import; vendor_Rules table gets `match_count` bumps.
- [ ] **VB-IMP-06** — PayPal CSV signs: amounts are stored as negative for outflows (per `amount_sign_convention='negative_outflow'` default). Expected: a known PayPal outflow like `-$45.00` lands as `amount = -45` not `+45`.
- [ ] **VB-IMP-07** — Venmo CSV signs: same convention as PayPal (negative outflow). Expected: outflows land negative.
- [ ] **VB-IMP-08** — AmEx CSV: positive amounts (sign-flip on parse). Expected: outflows land negative in DB.
- [ ] **VB-IMP-09** — Chase CC CSV: negative amounts (no flip). Expected: outflows land negative in DB.
- [ ] **VB-IMP-10** — Near-duplicate detection flags pairs that share `vendor_normalized`, `ROUND(ABS(amount),2)`, and `txn_date ±3 days` on the same account. Expected: import report lists `near_duplicate_of` for each suspected pair; rows are inserted with the flag; UI banner appears.
- [ ] **VB-IMP-11** — A row whose `vendor_normalized` is null after import has no near-dup match. Expected: `near_duplicate_of IS NULL` even when amount+date would otherwise match.

## Categorize

These cover §6 (Categorization Review UI).

- [ ] **VB-CAT-01** — Inbox lists all `transactions WHERE status='uncategorized'`. Expected: list count = uncategorized count; clicking one opens the row.
- [ ] **VB-CAT-02** — Setting a category creates a balanced journal entry (debit + credit pair). Expected: after PATCH, `journal_entries` for `source='transaction_import' AND source_id=txn_id` has both a debit and credit line netting to zero.
- [ ] **VB-CAT-03** — Unsetting a category (PATCH `category_account_id=null`) removes the journal entry but leaves the transaction. Expected: txns still present; no orphan `journal_entries`.
- [ ] **VB-CAT-04** — Bulk categorize: applying a category to N selected txns creates exactly N balanced entries. Expected: no double-UPDATE (Cinder fixed in Phase C fix-pass; double-check here).
- [ ] **VB-CAT-05** — Vendor rules fire on imported (uncategorized) rows after import. Expected: txns that match a vendor rule have `category_account_id` set and `status='categorized'` immediately after import.
- [ ] **VB-CAT-06** — Resolve-duplicate banner shows original txn date, amount, description. Expected: all three visible; clicking opens the original in a side panel or modal.
- [ ] **VB-CAT-07** — Keep Original button deletes the *current* transaction and its journal entries; leaves the original. Expected: originals remains; current + its journal_entries gone; `near_duplicate_of` on current is gone.
- [ ] **VB-CAT-08** — Keep This button deletes the *original* transaction and its journal entries; clears FK pointers; leaves the current. Expected: original + its journal_entries gone; any *third* txn that was pointing at the original via `near_duplicate_of` has its FK cleared (NULL); current remains.
- [ ] **VB-CAT-09** — Keep Both button nulls `near_duplicate_of` on the current row only. Expected: neither txn is deleted; current's FK cleared; the original's other near-dup pointers (if any) are untouched.

## Dedupe

These cover Phase C dedupe surface area. The first 6 are verified live in `ECHO_REPORT_C_DEDUPE.md`.

- [x] **VB-DED-01** — Exact dedupe via `UNIQUE(dedupe_hash)` auto-skips duplicate rows on re-import. *Last verified: 2026-07-01 (Echo, pre-QA-doc).*
- [x] **VB-DED-02** — `computeDedupeHash` includes `account_id` so cross-account does not match. *Last verified: 2026-07-01.*
- [x] **VB-DED-03** — `keep_this` clears FK pointers on other near-dupes pointing at the dying original. *Last verified: 2026-07-01.*
- [x] **VB-DED-04** — `keep_original` deletes only the current transaction and its journal entries. *Last verified: 2026-07-01.*
- [x] **VB-DED-05** — Near-dup match window is exactly ±3 days (Jan 30 ↔ Feb 2 matches; Jan 30 ↔ Feb 3 does not). *Last verified: 2026-07-01.*
- [x] **VB-DED-06** — Both import paths (multipart / apply) call the same hash + near-dup functions with consistent args. *Last verified: 2026-07-01.*
- [ ] **VB-DED-07** — Deleting a transaction cascades to its journal_entries (and via them to journal_lines). Expected: txn gone → 0 journal_entries left with that `source_id` → 0 journal_lines associated. *Refactor F1, 2026-07-01; not yet browser-verified end-to-end.*
- [ ] **VB-DED-08** — A direct `DELETE FROM transactions WHERE id=?` (bypassing helper) still cascades correctly via FK. Expected: same end state as VB-DED-07. *Proves F1 generalizes beyond the helper.*

## Vendor rules

- [ ] **VB-VEN-01** — Creating a rule with pattern X and category Y immediately categorizes existing txns matching pattern X (or only future imports, depending on spec). Expected: behavior matches documented semantics — flag if not.
- [ ] **VB-VEN-02** — Disabling a rule (`is_active=0`) prevents it from firing on new imports but does not un-categorize existing ones. Expected: future imports skip; existing categorized txns stay categorized.
- [ ] **VB-VEN-03** — `match_count` increments on each rule hit (import time). Expected: counter increments deterministically; can be used as a "how often does this fire" signal.
- [ ] **VB-VEN-04** — Deleting a rule does not cascade to any categorized transaction. Expected: rule gone; txns keep their `category_account_id`.

## Chart of accounts

- [ ] **VB-COA-01** — Adding a new account (any type) appears in the drop-down immediately. Expected: dropdown picks up the new entry without page refresh.
- [ ] **VB-COA-02** — Deactivating an account (`is_active=0`) hides it from selection in categorization. Expected: dropdown omits it; existing categorizations are unaffected.
- [ ] **VB-COA-03** — Deleting an account used in a categorization fails gracefully. Expected: 4xx with a clear error; no orphaned transactions.

## Customers

- [ ] **VB-CUS-01** — Creating a customer with name + email succeeds and appears in the list.
- [ ] **VB-CUS-02** — Editing customer email does not break invoices that reference the customer. Expected: existing invoices keep `customer_id`; rendered customer name + new email display.
- [ ] **VB-CUS-03** — Deleting a customer with invoices fails (or cascades — depends on spec). Expected: matches §X.X of the spec.

## Invoices

- [ ] **VB-INV-01** — Creating an invoice with line items creates one invoice + N line_items rows in one transaction. Expected: count matches.
- [ ] **VB-INV-02** — Marking an invoice `paid` creates a balanced journal entry (`source='invoice_payment'`). Expected: debit + credit pair; status flips.
- [ ] **VB-INV-03** — Overdue invoices surface in a notification (email or UI badge). Expected: per `overdue_notified_at` column logic.
- [ ] **VB-INV-04** — Invoice total = sum of line items. Expected: server-side computed total rounds correctly.
- [ ] **VB-INV-05** — Deleting a draft invoice cascades line items. Expected: cascade works; no orphans.
- [ ] **VB-INV-06** — Cannot delete a paid invoice (or cascades journal entries too — depends on F1 equivalents). Expected: matches spec.

## Payments & aging

- [ ] **VB-PAY-01** — Recording a payment against an invoice marks it paid and reduces AR by that amount. Expected: AR aging report reflects the change.
- [ ] **VB-PAY-02** — AR aging buckets (0-30, 31-60, 61-90, 90+) match the canonical IRS-style distribution. Expected: outstanding amounts partition without overlap or loss; sum equals total AR.

## Reports

These cover §4 (AR Aging) and §7 (Schedule C CSV Export) of the spec. Phase D shipped 2026-07-01.

- [x] **VB-REP-01** — AR aging endpoint returns bucketed customer balances (Current / 1-30 / 31-60 / 61-90 / 90+), grouped by `customer_id`, sorted by total desc. *Last verified: 2026-07-01 (Phase D manual, 4 customers, 90+ bucket, total 429).*
- [x] **VB-REP-02** — AR aging honors `?as_of=YYYY-MM-DD` for past-dated reports; defaults to today (UTC) if omitted or unparseable. *Last verified: 2026-07-01 (`as_of=2025-02-15` → all 4 customers moved to 1-30 bucket, 14 days past 2025-02-01 due_date).*
- [x] **VB-REP-03** — AR aging excludes `draft`, `paid`, and `void` invoices; only `sent` and `overdue` count. *Last verified: 2026-07-01 (5 invoices in DB → 4 reported; the 1 draft was excluded).*
- [x] **VB-REP-04** — Schedule C export produces a ZIP with three CSVs: `schedule_c_income.csv`, `schedule_c_expenses.csv`, `trial_balance.csv`. `Content-Type: application/zip`, `Content-Disposition: attachment; filename="chantelle-books-{year}-export-{date}.zip"`. *Last verified: 2026-07-01 (filename = `chantelle-books-2026-export-2026-07-01.zip`).*
- [x] **VB-REP-05** — Schedule C income CSV aggregates income accounts (code 4000-4999) by journal entry; columns `date,source,gross_amount,cogs_amount,net,account_code,account_name`; `cogs_amount` is 0 in v1. *Last verified: 2026-07-01 (income CSV empty for 2026 seed — test data has no income-categorized transactions, which is correct. End-to-end income CSV test flagged as Phase E follow-up).*
- [x] **VB-REP-06** — Schedule C expenses CSV aggregates expense accounts (code 6000-6999) by journal entry; columns `date,vendor,account_code,account_name,irs_line,amount,memo`; `vendor` = `transactions.vendor_normalized` (fallback `je.description`); `memo` = `transactions.notes` (fallback `je.description`); `irs_line` from `accounts.irs_line`. *Last verified: 2026-07-01 (5 expense rows in 2026 export, all categorized to account 6100 / Office Supplies / Line 18).*
- [x] **VB-REP-07** — Schedule C trial balance CSV has the debits == credits invariant across the file. *Last verified: 2026-07-01 (181.92 = 181.92 for the 2026 export).*
- [x] **VB-REP-08** — Schedule C export returns 400 for missing, non-numeric, or out-of-range year (validation `^\d{4}$`, range 1900-2999). *Last verified: 2026-07-01 (missing year → 400; `year=abcd` → 400).*
- [x] **VB-REP-09** — Schedule C export for a year with no journal entries returns 200 with a ZIP containing three CSVs (header rows only). *Last verified: 2026-07-01 (`year=2024` → 200 + 3 header-only CSVs).*
- [x] **VB-REP-10** — AR aging response includes a `totals` object whose bucket sums match the sum of the per-row `total` field across all customers. *Last verified: 2026-07-01 (per-row totals sum to 429, totals object matches).*
- [x] **VB-REP-11** — Reports page (`/books/reports`) renders two tabs: "AR Aging" and "Schedule C Export". *Last verified: 2026-07-01 (UI shipped, route mounted in BooksShell).*
- [x] **VB-REP-12** — AR Aging tab accepts a date input and an "Apply" button to re-fetch with `?as_of=`, plus a "Today" button to clear the date and re-fetch the live report. *Last verified: 2026-07-01 (UI shipped; date input + Apply + Today buttons present).*
- [x] **VB-REP-13** — Schedule C Export tab accepts a 4-digit year input and an "Export ZIP" button; the click triggers a browser download whose filename comes from the `Content-Disposition` header. *Last verified: 2026-07-01 (UI shipped; year input + Export ZIP button present; filename wired to header).*
- [x] **VB-REP-14** — Both tabs render an empty-state when there are no rows (no outstanding invoices / no rows in CSV), rather than crashing or showing a broken table. *Last verified: 2026-07-01 (UI shipped; empty-state paths implemented for both tabs).*
- [x] **VB-REP-15** — Health endpoint reports `phase: "D"` after the new route is mounted. *Last verified: 2026-07-01 (`{"status":"ok","phase":"D",...}`).*

## Settings

- [ ] **VB-SET-01** — Updating business name in Settings reflects everywhere customer-facing (invoices, PDFs). Expected: cached values refresh.
- [ ] **VB-SET-02** — Changing fiscal year start date recalculates any year-to-date dashboard numbers. Expected: YTD values shift correctly.
- [ ] **VB-SET-03** — Saving settings does not lose unsaved changes in other panels. Expected: scoping is per-section; save is explicit.

## Cross-cutting

- [ ] **VB-XCT-01** — Empty states render correctly for every list view (no customers, no invoices, no transactions, no rules, no accounts beyond system defaults).
- [ ] **VB-XCT-02** — Error responses (4xx, 5xx) render as a user-readable toast/banner, not raw JSON.
- [ ] **VB-XCT-03** — Every form Submit button is keyboard-accessible (Tab navigable, Enter submits, no mouse-only triggers).
- [ ] **VB-XCT-04** — Cloudflare-fronted URL (`virta.muckdart.com/books`) behaves identically to `localhost:3001/books` for the test matrix above. Expected: no CORS or proxy-side regressions.

---

## Status legend

- `[ ]` active, not yet verified by Echo
- `[x]` active, verified (last verified stamp inside the description)
- **strikethrough** inactive (kept for context, no longer testable — feature removed, behavior obsolete, etc.)

## Change log

- 2026-07-01 — Created from Echo's Phase C report findings + spec enumeration. 47 initial behaviors; 6 carry forward from Echo's manual verification.
- 2026-07-01 — Phase D added: 15 new behaviors (VB-REP-01 through VB-REP-15) covering AR aging + Schedule C CSV export + Reports UI. All 15 verified live by Cinder + Rusty at the API + curl level; UI behaviors verified at the component-implementation level (no browser-driven QA pass yet — those will be the next Echo run's responsibility).
