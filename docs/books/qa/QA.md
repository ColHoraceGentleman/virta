# Virta Books — QA Coverage

> **Living register of testable behaviors** for the Books app. Echo verifies against this on every QA pass. Cinder appends new behaviors when shipping; Rusty curates. See `qa/METHODOLOGY.md` for the discipline.

**Format:** Sectioned by feature area. Each behavior has a stable ID (`VB-<area>-<NN>`), a one-line description, an expected result, and a "last verified" stamp (filled by Echo on success). A behavior is **active** if its checkbox above the ID is `[x]`. Inactive behaviors are kept for context but skipped by Echo.

**Active behaviors: 113 / 113** (73 verified 2026-07-02 — see ECHO_REPORT_D_F1_E1.md; 40 awaiting verification for E.2)

## Coverage at a glance

| Feature area | Behaviors | Last full run |
|---|---|---|
| Import (CSV / PDF) | 11 | 2026-07-02 (D+F1+E.1 backfill) |
| Categorize | 9 | 2026-07-02 (D+F1+E.1 backfill, 1 NEEDS-DECISION) |
| Dedupe | 8 | 2026-07-02 (D+F1+E.1 backfill) |
| Vendor rules | 4 | 2026-07-02 (D+F1+E.1 backfill) |
| Chart of accounts | 3 | 2026-07-02 (D+F1+E.1 backfill, 1 NEEDS-DECISION) |
| Customers | 3 | 2026-07-02 (D+F1+E.1 backfill) |
| Invoices | 6 | 2026-07-02 (D+F1+E.1 backfill, 1 FAIL) |
| Payments & aging | 2 | 2026-07-02 (D+F1+E.1 backfill) |
| Settings | 3 | 2026-07-02 (D+F1+E.1 backfill, partial) |
| **Reports** | **15** | **2026-07-02 (D+F1+E.1 browser backfill)** |
| Reconciliation | 41 | 2026-07-02 (D+F1+E.1 backfill, 1 NEEDS-DECISION) |
| Transaction Editor | 10 | never (E.2 — awaiting verification) |
| Cross-cutting | 4 | 2026-07-02 (D+F1+E.1 backfill) |

---

## Import (CSV / PDF)

These cover §5 of the spec (CSV Import Pipeline). Prebuilt parsers: chase-cc, amex, paypal, venmo. Generic CSV mapping catches unknowns.

- [x] **VB-IMP-01** — Uploading a new CSV never causes an imported transaction that already exists to be duplicated on the same account. Expected: post-upload, row count of `transactions WHERE dedupe_hash IN (…newly-imported hashes…)` is exactly N (not 2N). *Last verified: 2026-07-02 (Echo, D+F1+E.1 backfill).*
- [x] **VB-IMP-02** — Re-uploading the same file with byte-identical contents inserts zero new rows. Expected: response JSON reports `inserted: 0` (or analogous). *Last verified: 2026-07-02 (re-import of test-chase.csv returned `inserted_count: 0, duplicates_skipped: 2`).*
- [x] **VB-IMP-03** — Re-uploading an overlapping CSV (e.g., one file covering Jul 1–15, the next covering Jul 10–30) creates new rows only for the non-overlapping window. Expected: dates within overlap window already in DB → skipped; new dates → inserted. *Last verified: 2026-07-02 (overlap import with 2026-06-02 dup → 1 inserted, 1 skipped).*
- [x] **VB-IMP-04** — Uploading to the wrong account is recoverable. Expected: user can cancel the upload, switch account, retry, and no row is mis-attributed. *Last verified: 2026-07-02 (account_id is per-request body parameter; switching requires only re-uploading with a different account_id).*
- [x] **VB-IMP-05** — Vendor normalization runs on every imported row. Expected: `transactions.vendor_normalized` is non-null and lowercased after import; vendor_Rules table gets `match_count` bumps. *Last verified: 2026-07-02 (all 11 transactions have non-null `vendor_normalized`).*
- [x] **VB-IMP-06** — PayPal CSV signs: amounts are stored as negative for outflows (per `amount_sign_convention='negative_outflow'` default). Expected: a known PayPal outflow like `-$45.00` lands as `amount = -45` not `+45`. *Last verified: 2026-07-02 (test PayPal CSV: -45 inflow lands as -45).*
- [x] **VB-IMP-07** — Venmo CSV signs: same convention as PayPal (negative outflow). Expected: outflows land negative. *Last verified: 2026-07-02 (code-confirmed; no Venmo test data).*
- [x] **VB-IMP-08** — AmEx CSV: positive amounts (sign-flip on parse). Expected: outflows land negative in DB. *Last verified: 2026-07-02 (code-confirmed; no AmEx test data).*
- [x] **VB-IMP-09** — Chase CC CSV: negative amounts (no flip). Expected: outflows land negative in DB. *Last verified: 2026-07-02 (all 8 Chase-CC txns in DB are negative for outflows).*
- [x] **VB-IMP-10** — Near-duplicate detection flags pairs that share `vendor_normalized`, `ROUND(ABS(amount),2)`, and `txn_date ±3 days` on the same account. Expected: import report lists `near_duplicate_of` for each suspected pair; rows are inserted with the flag; UI banner appears. *Last verified: 2026-07-02 (import on 2026-01-18 matching existing 2026-01-16 → `near_duplicate_of` set).*
- [x] **VB-IMP-11** — A row whose `vendor_normalized` is null after import has no near-dup match. Expected: `near_duplicate_of IS NULL` even when amount+date would otherwise match. *Last verified: 2026-07-02 (no null `vendor_normalized` rows in test data; code path exists in `findNearDuplicates`).*

## Categorize

These cover §6 (Categorization Review UI).

- [!] **VB-CAT-01** — Inbox lists all `transactions WHERE status='uncategorized'`. Expected: list count = uncategorized count; clicking one opens the row. *Last verified: 2026-07-02 (API confirms 5 uncategorized; **UI blocked by pre-existing /books/categorize crash — see NDC-1 in ECHO_REPORT_D_F1_E1.md**).*
- [x] **VB-CAT-02** — Setting a category creates a balanced journal entry (debit + credit pair). Expected: after PATCH, `journal_entries` for `source='transaction_import' AND source_id=txn_id` has both a debit and credit line netting to zero. *Last verified: 2026-07-02 (debit 150.00 / credit 150.00 on inflow test).*
- [ ] **VB-CAT-03** — Unsetting a category (PATCH `category_account_id=null`) removes the journal entry but leaves the transaction. Expected: txns still present; no orphan `journal_entries`. *Last verified: 2026-07-02 (**FAIL** — PATCH null leaves JE in place; see ECHO_REPORT_D_F1_E1.md §2.2).*
- [x] **VB-CAT-04** — Bulk categorize: applying a category to N selected txns creates exactly N balanced entries. Expected: no double-UPDATE (Cinder fixed in Phase C fix-pass; double-check here). *Last verified: 2026-07-02 (3 txns → 3 JEs, no doubles).*
- [x] **VB-CAT-05** — Vendor rules fire on imported (uncategorized) rows after import. Expected: txns that match a vendor rule have `category_account_id` set and `status='categorized'` immediately after import. *Last verified: 2026-07-02 (import of SQ *JOANN NEW TEST → status=categorized, category=6100).*
- [!] **VB-CAT-06** — Resolve-duplicate banner shows original txn date, amount, description. Expected: all three visible; clicking opens the original in a side panel or modal. *Last verified: 2026-07-02 (**UI blocked by /books/categorize crash — see NDC-1**; data layer correctly populates the near_duplicate_of relationship).*
- [x] **VB-CAT-07** — Keep Original button deletes the *current* transaction and its journal entries; leaves the original. Expected: originals remains; current + its journal_entries gone; `near_duplicate_of` on current is gone. *Last verified: 2026-07-02 (test pair: keep_original deleted current, left original; current's journal_entries cascaded).*
- [x] **VB-CAT-08** — Keep This button deletes the *original* transaction and its journal entries; clears FK pointers; leaves the current. Expected: original + its journal_entries gone; any *third* txn that was pointing at the original via `near_duplicate_of` has its FK cleared (NULL); current remains. *Last verified: 2026-07-02 (test pair: keep_this deleted original, left current; original's JE cascaded via deleteTransaction helper).*
- [x] **VB-CAT-09** — Keep Both button nulls `near_duplicate_of` on the current row only. Expected: neither txn is deleted; current's FK cleared; the original's other near-dup pointers (if any) are untouched. *Last verified: 2026-07-02 (test pair: keep_both nulled B.near_duplicate_of; both remain).*

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

## Reconciliation

These cover Phase E.1 (per-account monthly reconciliation). New tables: `reconciliations`, `reconciliation_clears`. New column: `transactions.cleared_at`.

- [ ] **VB-REC-01** — Reconciliation list shows all asset/liability accounts with last-reconciled date (green/amber/slate status pills). Expected: all 8 accounts render; pills reflect reconciled/never/in-progress state.
- [ ] **VB-REC-02** — Creating a draft reconciliation for an account + period computes `books_balance` from journal_lines for that account over that period, with sign convention: asset accounts use `debits - credits`, liability/equity/income/expense use `credits - debits`. Expected: `reconciliations` row created with correct `books_balance`; `status='draft'`. (Sign convention fixed by E.1 fix-pass 2026-07-02 E1-S2; pre-fix behavior was inverted for asset accounts.)
- [ ] **VB-REC-03** — Marking a transaction cleared inserts a `reconciliation_clears` row and sets `transactions.cleared_at`. Expected: both writes succeed atomically; cleared txn moves to right column in UI.
- [ ] **VB-REC-04** — Un-clearing a transaction removes the `reconciliation_clears` row and nulls `transactions.cleared_at`. Expected: both writes succeed atomically; txn moves back to uncleared column.
- [ ] **VB-REC-05** — Pasting a `statement_balance` computes `diff = books_balance - statement_balance`. Expected: `diff` stored on the reconciliation row; UI displays it.
- [ ] **VB-REC-06** — `diff == 0` allows status → `'reconciled'`; `diff != 0` blocks it (returns 400 `DIFF_NOT_ZERO`). Expected: reconciled status persists when diff is zero; 400 returned when non-zero.
- [ ] **VB-REC-07** — Creating the same draft twice (same account + period) is idempotent — returns the existing draft with `created: false`. Expected: no duplicate rows in `reconciliations`.
- [ ] **VB-REC-08** — Reconciliation list UI renders account table with last-reconciled status pills. Expected: page renders at `/books/reconcile`; account rows present; pill colors match state.
- [ ] **VB-REC-09** — Reconciliation detail UI shows uncleared txns on left, cleared txns with running balance on right. Expected: two-column layout; running balance updates as txns are cleared.
- [ ] **VB-REC-10** — Period picker defaults to previous month (via `previousMonth()` helper). Expected: on first open, period start/end default to prior calendar month.
- [ ] **VB-REC-11** — Health endpoint reports `phase: "E.1"` after mount. Expected: `GET /api/v1/books/health` → `{"phase":"E.1",...}`.
- [ ] **VB-REC-12** — Account list shows `last_reconciled_at` + `last_reconciled_balance` per account; no open-draft pill if account has no draft. Expected: every account row renders the last-reconciled timestamp and balance; accounts with no in-flight draft show no `Open draft` pill.
- [ ] **VB-REC-13** — POST `/reconcile` with `as_of_date` strictly greater than `last_reconciled_at` creates a new draft. Expected: a new `reconciliations` row with `status='draft'` is inserted; `created: true` returned.
- [ ] **VB-REC-14** — POST `/reconcile` with `as_of_date <= last_reconciled_at` returns 409 `RECON_DATE_NOT_FORWARD`. Expected: no draft created; existing latest recon is untouched.
- [ ] **VB-REC-15** — GET `/reconcile/:id` (default) returns only transactions with `txn_date <= as_of_date` that aren't covered by a prior `reconciled` recon. Expected: txn list excludes future-dated and already-cleared-by-prior-recon rows.
- [ ] **VB-REC-16** — GET `/reconcile/:id?include_past=1` adds transactions with `txn_date > as_of_date` for the same account; supports matching a past-as_of_date txn into the current recon. Expected: with the flag, future-dated same-account txns appear in the working list; without it, they don't.
- [ ] **VB-REC-17** — POST `/reconcile/:id/clear` for a txn that crosses the as_of_date boundary is allowed when `include_past=1`. Expected: the cross-boundary clear succeeds; without the flag, the same call returns 409.
- [ ] **VB-REC-18** — POST `/reconcile/:id/close` with `diff != 0` returns 409 `DIFF_NOT_ZERO`; recon remains in draft. Expected: status stays `draft`; `diff` and `cleared_count` unchanged.
- [ ] **VB-REC-19** — POST `/reconcile/:id/close` with `diff == 0` atomically: sets `status='reconciled'`, sets `accounts.last_reconciled_at` + `last_reconciled_balance`, sets `transactions.cleared_at` on the cleared set. Expected: all three writes succeed or none do; recon flips to `reconciled`; account gate advances.
- [ ] **VB-REC-20** — DELETE `/reconcile/:id` for a draft: cascades to clears, nulls `transactions.cleared_at` on all provisionally-cleared txns. Expected: draft row gone; `reconciliation_clears` rows for that draft gone; cleared_at on previously cleared txns back to NULL.
- [ ] **VB-REC-21** — DELETE `/reconcile/:id` for a `reconciled` recon: returns 404 (must rollback first). Expected: client must use the rollback path; direct delete is refused.
- [ ] **VB-REC-22** — POST `/reconcile/:id/rollback` on the latest reconciled recon for an account: DELETE the row, cascade clears, null `transactions.cleared_at` on the cleared set, revert `accounts.last_reconciled_at` + `last_reconciled_balance` to the prior recon's values (or NULL if first). Expected: gate walks backward exactly one step; if no prior recon, both columns go NULL.
- [ ] **VB-REC-23** — POST `/reconcile/:id/rollback` on a non-latest recon: returns 404 `ROLLBACK_NOT_LATEST`. Expected: only the most recent recon per account is rollable; older ones are refused.
- [ ] **VB-REC-24** — After a rollback, a new reconciliation can be opened for the same account with the *original* prior `as_of_date` as the new lower bound (proves the gate reverted correctly). Expected: `POST /reconcile` with the prior `as_of_date` is accepted again (would have been rejected before the rollback).
- [ ] **VB-REC-25** — Rollback does **not** delete `journal_entries` or `journal_lines` for the cleared transactions (categorization is independent of reconciliation). Expected: post-rollback, all journal entries and their lines for the previously-cleared txns are still present; only `cleared_at` was nulled.
- [ ] **VB-REC-26** — UI flow: account select → start reconciliation form; reconcile button disabled until `diff==0`. Expected: button is non-interactive while `diff != 0`; flips to enabled exactly when the user enters a `statement_balance` that zeroes the diff.
- [ ] **VB-REC-27** — UI flow: "Include past as_of_date" toggle changes the txn list per the contract. Expected: toggling the flag re-fetches the recon list with/without future-dated same-account txns; the working balance recalculates.
- [ ] **VB-REC-28** — UI flow: "Roll back previous reconciliation" button visible only when the account's latest recon is `reconciled` AND not stale; clicking it surfaces a confirmation modal; on confirm, the recon is rolled back atomically and the UI updates to show the prior recon summary. Expected: hidden otherwise; modal blocks accidental clicks; success state shows the previous recon's date + balance.
- [ ] **VB-REC-29** — Browser smoke: open account → see last recon summary (date + balance) → start new recon → walk through cancel-and-delete → confirm no orphan clears or `cleared_at` flags remain. Expected: end state matches the pre-recon state for that account — no `reconciliation_clears` rows from the deleted draft, no `cleared_at` non-nulls that shouldn't be there.
- [ ] **VB-REC-30** — Mutating a cleared transaction (PATCH amount): server returns 200 with `reconciliation_warnings: [...]`; the recon row is marked stale (`stale=1`, `stale_reason` JSON, `stale_at` set); `accounts.last_reconciled_at` is unchanged. Expected: mutation succeeds; recon is marked stale; gate does NOT move.
- [ ] **VB-REC-31** — Deleting a cleared transaction (`keep-this` / `keep-original` / direct delete): same as VB-REC-30 but `stale_reason.type = 'transaction_deleted'`. Expected: recon flips stale with the deleted-txn reason; gate unchanged.
- [ ] **VB-REC-32** — Recategorizing a cleared transaction: same as VB-REC-30 (conservative: any category change is a mutation). Expected: recon stale with a category-mutation reason; gate unchanged.
- [ ] **VB-REC-33** — Account list shows a red `⚠ stale` pill when any of the account's recons is stale. Expected: pill renders only for accounts with at least one stale recon; non-stale accounts show their normal pill.
- [ ] **VB-REC-34** — Opening a stale account's reconcile page shows the red "Beginning balance is out of balance" banner. Expected: banner visible on the account's recon page; not on the global reconcile list.
- [ ] **VB-REC-35** — The stale-account banner contains a "See what has changed" link; clicking it reveals a list of offending transactions with their original (reconciled-time) and current amounts shown side by side. Expected: each offending txn has both values visible side by side; the list is empty when there are no offenders (and the banner shows a different message).
- [ ] **VB-REC-36** — Editing a transaction description does NOT trigger staleness (description is not a mutation). Expected: PATCH on description returns 200 with empty `reconciliation_warnings`; no recon marked stale.
- [ ] **VB-REC-37** — Editing a transaction date DOES trigger staleness. Expected: PATCH on `txn_date` for a cleared txn returns 200 with non-empty `reconciliation_warnings`; the recon flips stale.
- [ ] **VB-REC-38** — Pre-mutation snapshot in `stale_reason` JSON contains the full `before` state for the offending transaction, including amount, `category_account_id`, and `txn_date`. Expected: `stale_reason.offenders[*].before` includes all three fields so the UI can show side-by-side diffs.
- [ ] **VB-REC-39** — Cascading FK delete (child txn deleted because parent txn deleted via `keep-this`): the staleness hook fires for each child, not just the parent. Expected: every cleared child txn produces its own stale-recon entry; the parent's stale entry covers the parent's row.
- [ ] **VB-REC-40** — Walk-back rollback: after rolling back the latest recon, the prior recon becomes the new "latest." If the prior recon is stale, the account list shows `⚠ stale`; clicking rollback again walks the gate backward one more step. Expected: rollback is a per-recon action; one click unwinds one step; stale prior recons surface the stale pill until resolved.
- [ ] **VB-REC-41** — Each rollback click is a single decision with a confirmation modal; there's no bulk / chained rollback endpoint. Expected: API exposes only single-recon rollback; the UI does not auto-apply successive rollbacks.

## Transaction Editor

These cover Phase E.2's general-purpose transaction editor (reachable from any transaction list) and the stale-banner entry point into it. The editor is amount-aware and re-runs journal lines + dedupe_hash on relevant edits; description edits are non-mutating per the §6.5 mutation table.

- [ ] **VB-TXN-EDIT-01** — From any transaction list (Categorization, Reconcile working view, per-account transactions): click a transaction row → row expands inline with all editable fields populated. Expected: expanded editor shows `txn_date`, `amount`, `description`, `category_account_id`, `notes`; `cleared_at` is present but read-only.
- [ ] **VB-TXN-EDIT-02** — Save commits the changes; PATCH returns the updated txn + `reconciliation_warnings` array (empty if no staleness triggered). Expected: 200 response body has `{ transaction, reconciliation_warnings: [...] }`; warnings array is non-empty exactly when at least one affected recon became stale.
- [ ] **VB-TXN-EDIT-03** — Discard reverts the form to the last-saved state with no server call. Expected: clicking Discard restores the field values from the last successful Save (or the initial load); no network request is fired.
- [ ] **VB-TXN-EDIT-04** — Edit `amount` → journal_lines are regenerated server-side (the categorization is amount-aware via the journal entry). Expected: post-Save, the txn's `journal_entry` has balanced debit/credit lines whose amounts match the new `amount`; old lines are gone.
- [ ] **VB-TXN-EDIT-05** — Edit `account` (`category_account_id`) → journal_lines point at the new account; old journal_lines deleted or migrated per the existing `categorizeTransaction` helper. Expected: post-Save, the journal entry's lines reference the new `category_account_id`; no orphan lines on the old account.
- [ ] **VB-TXN-EDIT-06** — Edit `txn_date` or `amount` → `dedupe_hash` is recomputed (existing logic). Expected: post-Save, `transactions.dedupe_hash` reflects the new `(account_id, txn_date, amount, vendor_normalized)` tuple; a re-import of the same data won't create a duplicate.
- [ ] **VB-TXN-EDIT-07** — When Save returns non-empty `reconciliation_warnings`, the editor surfaces an inline alert naming the affected reconciliation by account + as_of_date, with a link to that account's reconcile page. Expected: alert appears below the form; each warning is a separate row; clicking the link navigates to the right account's recon page.
- [ ] **VB-TXN-EDIT-08** — Stale-banner entry: clicking an offending transaction in the expanded "See what has changed" list opens the same editor pre-populated. No special "restore" affordance — user manually edits the field back to the original amount (visible in the list above the editor for reference) and Saves. Expected: editor opens with the offending field highlighted and the original value visible in the side-by-side list above; Save with the original value restores the reconciled state (no more stale warning on Save).
- [ ] **VB-TXN-EDIT-09** — `cleared_at` is shown read-only in the editor as "Reconciled: yes/no, as of {date}" for context. The field itself is read-only and only mutable via the reconciliation system. Expected: PATCH cannot set `cleared_at` directly; the editor field is `disabled`; the label switches between yes/no based on the underlying value.
- [ ] **VB-TXN-EDIT-10** — Editing the `description` (vendor/customer) does NOT trigger `reconciliation_warnings` (description is not a mutation per §6.5 table). Expected: PATCH on description returns 200 with empty `reconciliation_warnings`; the editor shows no warning banner.

## Status legend

- `[ ]` active, not yet verified by Echo
- `[x]` active, verified (last verified stamp inside the description)
- **strikethrough** inactive (kept for context, no longer testable — feature removed, behavior obsolete, etc.)

## Change log

- 2026-07-01 — Created from Echo's Phase C report findings + spec enumeration. 47 initial behaviors; 6 carry forward from Echo's manual verification.
- 2026-07-01 — Phase D added: 15 new behaviors (VB-REP-01 through VB-REP-15) covering AR aging + Schedule C CSV export + Reports UI. All 15 verified live by Cinder + Rusty at the API + curl level; UI behaviors verified at the component-implementation level (no browser-driven QA pass yet — first Echo browser run is the D+F1+E.1 backfill, 2026-07-02).
- 2026-07-01 — Phase F1 (orphan-safe delete): VB-DED-07 and VB-DED-08 already present from prior enumeration; updated notes to reflect F1 shipped. No new IDs needed.
- 2026-07-02 — Phase E.1 (Reconciliation) folded in: 11 new behaviors VB-REC-01 through VB-REC-11. Active count: 73. Wren + Echo backfill review spawned for D + F1 + E.1.
- 2026-07-04 — Phase E.2 (Reconciliation v2 + Transaction Editor) folded in: 30 new reconciliation behaviors VB-REC-12 through VB-REC-41 (gate advancement, rollback, staleness, walk-back) and a new "Transaction Editor" section with 10 behaviors VB-TXN-EDIT-01 through VB-TXN-EDIT-10 (inline edit, journal-line regen, dedupe_hash recompute, reconciliation_warnings surfacing, cleared_at read-only context, stale-banner entry). Active count: 113 (73 previously verified + 40 awaiting verification for E.2). No code or schema changes — pure doc fold-in by Cinder.
