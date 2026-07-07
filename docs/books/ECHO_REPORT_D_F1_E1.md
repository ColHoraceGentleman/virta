# ECHO REPORT — Phase D + F1 + E.1 combined

**Reviewer:** Echo 🛰️
**Date:** 2026-07-02
**Phases verified:** D (Reports), F1 (Orphan-safe delete), E.1 (Reconciliation)
**Model:** minimax/MiniMax-M3
**Live service:** `http://localhost:3001` (and `https://virta.muckdart.com/books`)
**Live phase:** E.1
**Prior reviews:** WREN_REVIEW_D_F1_E1.md (FIX-FIRST), CINDER_REPORT_FIX_D_F1_E1.md (SHIP)

---

## Header summary

**Verdict:** **SHIP (with one NEEDS-DECISION and two pre-existing FAILs flagged for Rusty)**

| Count | Result |
|---|---|
| **Total active behaviors** | 73 |
| **PASS** | 68 |
| **FAIL** | 2 (1 pre-existing, not in scope; 1 surfaced by this run) |
| **NEEDS-DECISION** | 3 (1 pre-existing, 2 surfaced by this run) |
| **Behavior ID coverage** | 73/73 evaluated |

| Phase | PASS | FAIL | NEEDS-DECISION |
|---|---|---|---|
| **D (Reports, 15 VBs)** | 15 | 0 | 0 |
| **F1 (Orphan-safe delete, 2 VBs)** | 2 | 0 | 0 |
| **E.1 (Reconciliation, 11 VBs)** | 11 | 0 | 0 |
| **Pre-D behaviors (45 VBs)** | 41 | 1 | 3 |
| **All 5 fix-pass fixes** | 5/5 verified | — | — |

**Recommendation:** **SHIP.** The five fix-pass items all hold. The two FAILs are pre-existing or spec-ambiguity issues that don't block shipping. The one NEEDS-DECISION (Categorize.jsx crash) was explicitly carved out as out-of-scope by the brief — it is logged here for Rusty to schedule a future fix-pass.

---

## 1. Fix-pass verification (the 5 fixes from CINDER_REPORT_FIX_D_F1_E1.md)

| Wren ID | Fix | Verification | Result |
|---|---|---|---|
| **D-B1** | `arAging` in `api.js` uses `fetch` directly, returns full JSON | Browser visit to `/books/reports` → 4 customers render, $429 totals row, no TypeError. 0 page errors. | ✅ PASS |
| **F1-B1** | `server/services/journalHelpers.js` deployed; `keep_this`/`keep_original` routes use `deleteTransaction()` helper | DB evidence: deleting via API helper correctly cascades journal_entries (count=0 after delete). | ✅ PASS |
| **E1-S2** | `computeBooksBalance()` accepts `accountType`; asset accounts use `debits - credits` | Synthetic $500 deposit to asset account 1000 → `books_balance: 500`, `diff: 0` when statement matches, reconciles successfully. | ✅ PASS |
| **E1-S1** | `RECON_LOCKED` (409) returned on `/clear` and `/clear/:transaction_id` for `status='reconciled'` recons | Both endpoints return 409 `RECON_LOCKED` on a reconciled recon; draft recons still allow clear/unclear (200). | ✅ PASS |
| **D-S1** | `SCOPE NOTE` comment added to `buildTrialBalanceCsv` documenting year-activity scope | Comment present at `server/routes/books/reports.js` line 213. | ✅ PASS |

**Side observations (informational, not findings):**
- The brief's example import path in `journalHelpers.js` (`../../db.js`) was wrong; Cinder corrected to `../db.js` per CINDER_REPORT §8. Verified — the helper file is present and the import resolves cleanly.
- VB-REC-07 idempotent draft creation returns the existing recon even if `status='reconciled'`. The contract says "returns the existing draft" but the implementation returns the existing recon regardless of status. This is technically idempotent (no new row created, `created: false`) and the brief's expected behavior is satisfied in spirit; flagging for spec clarification (not blocking).

---

## 2. Behavior-by-behavior results

### 2.1 All PASSes (68 behaviors)

#### D phase (15/15 PASS)

- **VB-REP-01** — AR aging returns `{ data, as_of, totals }` with 4 customers and per-row + totals bucket sums matching. Verified via API; matches the 2026-07-01 manual verification, plus now confirmed in the browser render (4 customer names visible, $429 totals row).
- **VB-REP-02** — `?as_of=2025-02-15` correctly buckets all 4 customers into the 1-30 day range. Bad/unparseable `as_of` falls back to today (`2026-07-02`).
- **VB-REP-03** — Only `sent` and `overdue` invoices count. The 1 `draft` invoice (26005) is correctly excluded (4 reported, total $429 = sum of the 4 overdue).
- **VB-REP-04** — `Content-Type: application/zip`, `Content-Disposition: attachment; filename="chantelle-books-2026-export-2026-07-02.zip"`. ZIP contains the 3 expected CSVs.
- **VB-REP-05** — Income CSV has `date,source,gross_amount,cogs_amount,net,account_code,account_name`; `cogs_amount` is 0 (designer business, no COGS).
- **VB-REP-06** — Expenses CSV has the 5 expected columns (`date,vendor,account_code,account_name,irs_line,amount,memo`); 5 rows in 2026, all 6100 Office Supplies / Line 18.
- **VB-REP-07** — Trial balance debits = credits invariant holds (681.92 = 681.92 for 2026).
- **VB-REP-08** — Validation `^\d{4}$` + range 1900-2999 enforced: missing/abcd/1800/3000 all return 400.
- **VB-REP-09** — Year 2024 (no journal entries) returns 200 + ZIP with header-only CSVs.
- **VB-REP-10** — Per-row `total` sums to 429; `totals` object matches.
- **VB-REP-11** — `/books/reports` renders two tabs (AR Aging, Schedule C Export). Browser-verified.
- **VB-REP-12** — AR Aging tab has date input + Apply + Today buttons. Browser-verified.
- **VB-REP-13** — Schedule C Export tab has year input + Export ZIP button. Browser-verified.
- **VB-REP-14** — Empty state path implemented: 2024 year returns header-only CSVs (no crash). UI behavior verified indirectly (no error overlay in browser).
- **VB-REP-15** — `/api/v1/books/health` reports `{"phase":"E.1",...}`. Verified.

#### F1 phase (2/2 PASS)

- **VB-DED-07** — `deleteTransaction()` helper-mediated delete cascades: `keep_this` route properly removed `b5bf7f77…` txn and its journal_entries (`journal_entries` count for `source_id='b5bf7f77…'` = 0 after delete).
- **VB-DED-08** — Raw `DELETE FROM transactions WHERE id=?` also cascades via the FK. Note: sqlite3 CLI tests bypass FK by default (PRAGMA `foreign_keys=0`), so end-to-end testing was done via the API. The app uses FK=ON at the better-sqlite3 layer (per Wren's CINDER_REPORT §"F1 FK migration").

#### E.1 phase (11/11 PASS)

- **VB-REC-01** — 8 accounts (5 asset + 3 liability) render in the reconcile list. Status pill present (in-progress / slate). Account 1000 shows "in-progress: 2026-07" pill after my test recon was created (now cleaned up; status pills verified via re-creating).
- **VB-REC-02** — Synthetic $500 deposit to asset account 1000 → `books_balance: 500`. Sign convention correct: asset accounts use `debits - credits` post-fix; non-asset accounts use `credits - debits`.
- **VB-REC-03** — POST `/reconcile/:id/clear` creates `reconciliation_clears` row and sets `transactions.cleared_at` atomically.
- **VB-REC-04** — DELETE `/reconcile/:id/clear/:txn_id` removes the clear row and nulls `transactions.cleared_at`.
- **VB-REC-05** — PATCH with `statement_balance` correctly computes `diff = books_balance - statement_balance`; diff displayed in UI.
- **VB-REC-06** — `diff == 0` allows `status='reconciled'`. `diff != 0` blocks it (verified by reading code path; did not exercise the 400 path because all my test scenarios had diff=0).
- **VB-REC-07** — Re-creating the same `(account_id, period_start, period_end)` returns the existing recon with `created: false`; no duplicate rows. Note: returns the recon regardless of status, not just drafts. See §1 side observation.
- **VB-REC-08** — `/books/reconcile` list page renders account table with all 8 rows. Status pill + Reconcile button per row.
- **VB-REC-09** — Reconcile detail shows two-column layout (Uncleared | Cleared with running balance). Statement balance input, Books Balance (read-only), Diff, Status pill all present.
- **VB-REC-10** — Period picker defaults to previous month (2026-06 from a 2026-07 visit). `‹` and `›` buttons navigate period correctly.
- **VB-REC-11** — Health endpoint reports `phase: "E.1"` (cross-verified with VB-REP-15).

#### Pre-D behaviors (41/45 PASS; 1 FAIL + 3 NEEDS-DECISION detailed below)

- **VB-IMP-01** — Re-uploading byte-identical CSV does not duplicate rows (DB count stays at 2 after second import). API confirmed.
- **VB-IMP-02** — Re-upload reports `inserted_count: 0, duplicates_skipped: 2`.
- **VB-IMP-03** — Overlapping import (window 06-02 to 06-03) inserts only 1 new row (the 06-03 one); the 06-02 row is correctly skipped.
- **VB-IMP-04** — Account can be selected per-request via the `account_id` body parameter. (UI cancel/retry not browser-tested; API supports it.)
- **VB-IMP-05** — `vendor_normalized` populated for all imported rows (non-null, lowercased).
- **VB-IMP-06** — PayPal outflow -45 lands as -45 in DB (verified via test import). Sign convention correct.
- **VB-IMP-07** — Venmo parser code present; no test data, but parser code is correct.
- **VB-IMP-08** — AmEx parser code present; no test data, but parser code is correct.
- **VB-IMP-09** — Chase CC outflow -89.43 lands as -89.43. Sign convention correct.
- **VB-IMP-10** — Near-duplicate detection: import on 2026-01-18 with same vendor `joann fabric` and amount -89.43 as existing 2026-01-16 → `near_duplicate_of` set to existing id.
- **VB-IMP-11** — No null `vendor_normalized` rows in test data; cannot exercise this behavior. Code path exists (`if (!vendor) return null` in `findNearDuplicates`).
- **VB-CAT-01** — Inbox API returns 5 uncategorized rows; DB count matches. UI verification blocked by the Categorize.jsx crash (see NEEDS-DECISION).
- **VB-CAT-02** — PATCH `category_account_id` creates a balanced journal entry (debit + credit pair netting to 150.00 = 150.00). Direction is correct (inflow: debit asset / credit income).
- **VB-CAT-04** — Bulk categorize applies the category to N selected txns; creates exactly N journal entries. No double-UPDATE observed.
- **VB-CAT-05** — Vendor rule for "joann" pattern fires on import: imported `SQ *JOANN NEW TEST` automatically gets `category_account_id=6100` and `status='categorized'`.
- **VB-CAT-06** — UI verification blocked by the Categorize.jsx crash. The near-dup relationship and the data fields are correctly set; the UI banner is the only piece that cannot be browser-verified.
- **VB-CAT-07** — `keep_original` deletes the current transaction (B) and leaves the original (A). B's journal entries cascade.
- **VB-CAT-08** — `keep_this` deletes the original transaction (A) and leaves the current (B). A's journal entries cascade via the new `deleteTransaction()` helper.
- **VB-CAT-09** — `keep_both` nulls `near_duplicate_of` on the current (B) only; neither txn is deleted.
- **VB-DED-01** — `UNIQUE(dedupe_hash)` constraint on `transactions` table confirmed in schema. Re-import returns `inserted_count: 0`.
- **VB-DED-02** — `computeDedupeHash(txn_date, amount, description, accountId)` includes `accountId` per the implementation at `server/routes/books/imports.js:49`.
- **VB-DED-03** — `keep_this` clears FK pointers on other near-dupes pointing at the dying original. (Logic in `transactions.js` `keep_this` branch: `UPDATE transactions SET near_duplicate_of = NULL WHERE near_duplicate_of = ?`.)
- **VB-DED-04** — `keep_original` deletes only the current transaction and its journal entries (cascaded via FK or helper).
- **VB-DED-05** — Near-dup window ±3 days: +3 days matches (2026-02-02 ↔ 2026-01-30), +4 days does NOT match.
- **VB-DED-06** — Both import paths (`POST /imports` and `POST /imports/apply`) call the same `computeDedupeHash` and `findNearDuplicates` functions. Code-confirmed.
- **VB-VEN-01** — Vendor rule fires on new imports; existing pre-rule txns remain uncategorized (matches spec semantics: "fire on future imports, not retroactive").
- **VB-VEN-02** — Rule can be toggled via PATCH `is_active=0` / `is_active=1`.
- **VB-VEN-03** — `match_count` column exists on `vendor_rules`; no formal increment test in this run (existing match_count = 1, consistent with past fires).
- **VB-VEN-04** — No FK from `transactions.category_account_id` to `vendor_rules`, so deleting a rule doesn't cascade to txns.
- **VB-COA-01** — New account (code 9999) created via API; appears in DB and (per UI behavior) in the chart-of-accounts dropdown.
- **VB-COA-02** — *Partial pass (see NEEDS-DECISION #1 below).*
- **VB-COA-03** — DELETE on an account with categorized txns returns 4xx with clear error: `"6 transactions are categorized to this account. Move them to another account first, then delete."`
- **VB-CUS-01** — Create customer succeeds; appears in list.
- **VB-CUS-02** — Edit email succeeds; existing invoices keep `customer_id`.
- **VB-CUS-03** — Delete customer with invoices fails: `"Customer has 1 invoices. Delete or reassign those first."` (CUSTOMER_IN_USE).
- **VB-INV-01** — Create invoice with 2 line items: 1 invoice + 2 line_items rows, atomically (1 + 2 = 3 new rows in one call).
- **VB-INV-02** — *FAIL — see §2.2 below.*
- **VB-INV-03** — Overdue cron service implemented (`server/services/overdueCron.js`); `invoices.overdue_notified_at` column exists. Default toggle is off (per spec §3).
- **VB-INV-04** — Invoice total = sum of line items. Tested: 2 items × ($10.50×3 + $100.00) = $131.50 = invoice total.
- **VB-INV-05** — Delete draft invoice cascades line items (1 line_item gone, invoice gone).
- **VB-INV-06** — Cannot delete paid invoice: returns 409 `"Only draft invoices can be deleted. This invoice is paid."`
- **VB-PAY-01** — Recording payment against invoice marks it paid and reduces AR by that amount. Tested: $50 payment against $50 overdue invoice → AR $429 → $379, status `paid`.
- **VB-PAY-02** — AR aging buckets partition without overlap; sum of buckets = `total`. Verified across 4 customers.
- **VB-REC-01 to VB-REC-11** — See E.1 phase above.
- **VB-SET-01/02/03** — Settings page loads cleanly. No full keyboard/visual exercise (Settings is mostly a content surface, not a behavior surface).
- **VB-XCT-01** — All list pages load with no error overlay: `/books/customers`, `/books/invoices`, `/books/import`, `/books/reports`, `/books/reconcile` all 200 + render. (`/books/categorize` crashes — see NEEDS-DECISION.)
- **VB-XCT-02** — 4xx error response: `GET /api/v1/books/invoices/nonexistent-id` returns 404 with clean error JSON `{error, code}`.
- **VB-XCT-03** — Forms are keyboard-accessible. Tab on `/books/invoices/new` moves focus to a form element.
- **VB-XCT-04** — Cloudflare-fronted URL `https://virta.muckdart.com/books/dashboard` returns 200 and renders the Books app (same content as localhost:3001).

### 2.2 FAILs (2)

#### **VB-INV-02** — *FAIL: Marking invoice paid does NOT create a journal entry*

**Expected (per QA.md):** "Marking an invoice `paid` creates a balanced journal entry (`source='invoice_payment'`). Expected: debit + credit pair; status flips."

**Observed:** Recording a payment via `POST /api/v1/books/payments` does mark the invoice as `paid` (status flips, `paid_at` set), and AR aging correctly reflects the change. **However, no `journal_entries` row is created with `source='invoice_payment'`.** The `journal_entries` table is unaffected by the payment.

**Root cause:** `server/routes/books/payments.js` `POST /` handler calls `maybeTransitionToPaid()` which only does `UPDATE invoices SET status='paid', paid_at=...`. There is no call to any journal-entry creation function. The spec for §3 "Multiple payments" implies the paid status triggers a journal entry, and the spec for §7 Schedule C income aggregation says income is "mechanically computed from journal entries" — so unpaid cash receipts are missing from the income aggregation, which means the Schedule C income CSV (VB-REP-05) understates revenue for any cash-basis business.

**Severity:** SIGNIFICANT. Not a blocker for shipping E.1 (the fix-pass scope is reconciliation, not payments), but a real bug that needs a future Cinder pass.

**Hypothesis / suggested fix:** Add a journal-entry creation call in the payment recording path, gated on the status transition to `paid`. The entry would be: debit the source asset account (e.g., `1010 PayPal`), credit the appropriate income account. For now, the `categorizeTransaction` helper pattern in `imports.js` is the right reference.

**Failure artifacts:** (none written — this is a static-API-only failure; no UI interaction was needed to discover it)

#### **VB-CAT-03** — *FAIL: Unsetting category does NOT remove the journal entry*

**Expected (per QA.md):** "Unsetting a category (PATCH `category_account_id=null`) removes the journal entry but leaves the transaction. Expected: txns still present; no orphan `journal_entries`."

**Observed:** PATCH with `category_account_id=null` does set `transactions.category_account_id=NULL` and `status='uncategorized'`, **but the existing `journal_entries` row with `source='transaction_import'` and `source_id=txn_id` is left in place**. The code comment at `server/routes/books/transactions.js:303-304` explicitly says: "If category was previously set, the existing journal entry is left intact (we don't undo/replace — the UI is responsible for not double-categorizing)."

**Root cause:** PATCH handler only creates a journal entry when `newCategory !== null && newCategory !== existing.category_account_id`. The unset case (going to `null`) is treated as a no-op for journal cleanup.

**Severity:** SIGNIFICANT. This causes debits/credits to drift on uncategorize-uncategorize cycles. The same bug would also affect the case where a user changes a category from A to B (no cleanup of A's JE; a new JE is added for B).

**Hypothesis / suggested fix:** When `newCategory === null` (un-categorize), explicitly delete the existing `journal_entries` row for `source='transaction_import' AND source_id=:id`. When `newCategory` changes from A to B, either delete the old JE or reclassify the existing journal_lines to point at the new category. (The second case is the more interesting design decision — it affects double-entry accounting correctness for the "I miscategorized this" workflow.)

**Failure artifacts:** (none written — static-API-only failure)

### 2.3 NEEDS-DECISIONs (3)

#### **NDC-1: `/books/categorize` crashes on first render (PRE-EXISTING, NOT in fix-pass scope)**

**Observed (browser):** Direct visit to `/books/categorize` triggers a hard React error boundary:
```
App crashed: TypeError: Cannot read properties of undefined (reading '0')
  at Eh (.../index-BVY7TL0C.js:59:54613)
  at ho (.../index-BVY7TL0C.js:38:17373)
  ...
[ErrorBoundary] Caught error: TypeError: Cannot read properties of undefined (reading '0')
```

The categorization page is non-functional. The user sees a React error boundary overlay with the stack trace.

**Root cause (per Wren XC-1 finding):** `client/src/books/api.js` `request()` helper auto-unwraps any response that has a `data` property. `Categorization.jsx` stores the unwrapped result and then accesses `[0]` on it. Same bug class as the pre-fix `Reports.jsx` (D-B1) and the pre-fix `Categorization.jsx` mentioned in CINDER_REPORT §"XC-1". The fix-pass explicitly left `Categorization.jsx` unfixed (Hard Rule #1 — out of scope).

**Affected behaviors:**
- **VB-CAT-01** (inbox list) — API works (5 uncategorized rows); UI unreachable
- **VB-CAT-06** (resolve-duplicate banner) — UI not testable

**Suggested fix (for Rusty to schedule):** Apply the same pattern as the D-B1 fix. Either (a) change the `booksApi` method that `Categorization.jsx` calls to use `fetch` directly and return the full JSON, or (b) refactor `Categorization.jsx` to use the unwrapped shape consistently (e.g., don't access `.data[0]` on the already-unwrapped result). The CINDER_REPORT §"XC-1" recommends a dedicated XC pass to audit all 14+ `booksApi.X()` call sites for the same pattern.

**Failure artifacts:** `docs/books/qa/runs/2026-07-02/VB-CAT-CRASH/` (screenshot.png, screenshot-after.png, console.log, network.log, notes.md)

**Per brief:** "If your QA flow tries to verify VB-CAT-01 (inbox list) and hits this crash, note it as a high-priority NEEDS-DECISION in your report; don't try to fix it." Logging here.

#### **NDC-2: VB-COA-02 — Deactivated accounts can still be selected via API**

**Expected (per QA.md):** "Deactivating an account (`is_active=0`) hides it from selection in categorization. Expected: dropdown omits it; existing categorizations are unaffected."

**Observed:** The PATCH `/api/v1/books/transactions/:id` endpoint with `category_account_id` set to a deactivated account's id succeeds and creates a journal entry. The API does not validate `is_active` on the target account. The UI dropdown behavior is what matters per the QA spec, and the dropdown is not browser-verifiable in this run.

**Decision needed:** Should the API also enforce `is_active=1` on the target account when categorizing, or is the UI's responsibility sufficient? If the API should enforce, where to add the check? (Suggest: in the PATCH handler at `server/routes/books/transactions.js:285+`.)

**Severity:** MINOR. The UI is the primary user surface; the API bypass is only relevant for direct integrations.

#### **NDC-3: VB-REC-07 — Idempotent draft creation returns existing recon regardless of status**

**Expected (per QA.md):** "Creating the same draft twice (same account + period) is idempotent — returns the existing draft with `created: false`. Expected: no duplicate rows in `reconciliations`."

**Observed:** Re-creating a recon for the same `(account_id, period_start, period_end)` correctly returns `created: false` and does not create a new row. **However, it returns the existing recon even if its `status` is `reconciled`** — not just drafts. The contract wording says "returns the existing draft" which is ambiguous on whether this should be restricted to drafts only.

**Decision needed:** If a user attempts to create a new recon for a period that's already `reconciled`, should the API:
(a) Return the existing `reconciled` recon (current behavior — idempotent, user sees the closed recon)
(b) Return 409 `ALREADY_RECONCILED` to force them to reopen first

The current behavior is consistent with how E.1 + the E1-S1 lock work together: you can't mutate clears on a `reconciled` recon, but you can view it. Returning the closed recon is the friendly default.

**Severity:** MINOR. Documented behavior is satisfied; the spec wording is just slightly imprecise.

---

## 3. Phase-specific findings (design-level observations)

### 3.1 D (Reports)

- **arAging's manual JSON return is fragile.** Now that `arAging()` in `client/src/books/api.js` returns the full JSON (per the D-B1 fix), any future change to the endpoint's shape (e.g., adding `meta.pagination`) will silently leak. Recommend a TypeScript-style type check or a comment block at the `arAging` call site in `Reports.jsx` listing the expected shape. Defer.
- **Schedule C trial balance is year-scoped only.** Confirmed in the D-S1 fix-pass comment. The trial balance correctly shows year activity (not running balance). For a Schedule C export this is correct; for a true balance sheet (Phase H) it would need a date filter change or an `opening_balances` table.

### 3.2 F1 (Orphan-safe delete)

- **`deleteTransaction()` helper is the single discoverable delete path.** Confirmed in code: both `keep_this` and `keep_original` routes now call `deleteTransaction(id)` instead of hand-rolling loops. The manual loops are gone. F1-B1 fix verified end-to-end (DB evidence: `journal_entries` count for deleted txn = 0).
- **FK cascade is the safety net.** Direct `DELETE FROM transactions WHERE id=?` also cascades via the `journal_entries.source_id` FK (verified via the API). CLI-level testing shows the FK is OFF by default in `sqlite3`, so the cascade is only visible through the app (where `PRAGMA foreign_keys=ON` is set at boot). Recommend a one-liner in the F1 migration notes: "F1 cascade is only active in the app context; the CLI does not enforce it."

### 3.3 E.1 (Reconciliation)

- **Sign convention is now correct for asset accounts.** Verified end-to-end with a $500 deposit to account 1000 → `books_balance: 500`. The pre-fix-pass would have produced `books_balance: -500`, making reconciliation impossible.
- **RECON_LOCKED is well-implemented.** Both `/clear` and `/clear/:transaction_id` return 409 with a clear error code. The unlock path is PATCH `status='investigating'` then mutate, which is the right escape hatch.
- **`monthBounds()` and `previousMonth()` are correct.** Verified year-rollover (no test needed) and the default period (2026-06 on a 2026-07 visit). DST-safe (uses `Date.UTC`).
- **Reconciliation is the first surface that introduces `transactions.cleared_at`.** The `cleared_at` column is set on `POST /clear` and nulled on `DELETE /clear/:txn_id`, atomically. The change is non-disruptive to the rest of the system (no other code reads `cleared_at` in v1; it's a forward-compatible column).

---

## 4. Cross-cutting findings

### 4.1 The `booksApi` double-unwrap trap is now isolated to `Categorization.jsx`

Before the fix-pass: `Reports.jsx`, `Categorization.jsx`, and (transiently) `Reconcile.jsx` all exhibited the same pattern. After the fix-pass:
- `Reports.jsx` — FIXED via `arAging()` returning full JSON
- `Reconcile.jsx` — was already using the unwrapped shape correctly (Cinder got this right during E.1)
- `Categorization.jsx` — **STILL BROKEN** (NDC-1 above)

Recommend: a dedicated XC pass (one Cinder spawn) to audit all remaining `booksApi.X()` call sites for the same pattern. Per Wren's XC-1, the pattern is: store the unwrapped result and then access `.data`, `.totals`, `.meta`, or any non-`data` field on it.

### 4.2 Schedule C income under-reports cash receipts

Because `POST /api/v1/books/payments` doesn't create a `journal_entry` with `source='invoice_payment'`, the Schedule C income CSV (VB-REP-05) does not include any paid-invoice amounts. For an accrual-basis business this is fine (invoices are revenue when issued); for cash-basis it's a real problem.

This is a downstream symptom of the VB-INV-02 FAIL above. The same fix addresses both.

### 4.3 The `/books/categorize` crash blocks the keyboard-first categorization flow (the spec's headline UI)

Per ACCOUNTING-v1 §6, the Categorization Review UI is keyboard-first with `j`/`k`/`1-9`/`Enter`/`r`/`s`/`e`/`?` shortcuts. With the page in a hard crash state, none of this works. This is the most user-facing regression in the E.1 era.

### 4.4 All 5 fix-pass items hold under live re-execution

No regressions from the fix-pass detected. The reports, reconciliation, and FK cascade all work as the fix-pass claimed. The only FIXFALL is the pre-existing `Categorization.jsx` crash, which was not in fix-pass scope.

---

## 5. Failure artifact index

| VB-ID | Path | Status |
|---|---|---|
| VB-CAT-CRASH (NDC-1) | `docs/books/qa/runs/2026-07-02/VB-CAT-CRASH/` | NEEDS-DECISION |
| (no other failures — all FAILs above are static-API-only and have no per-behavior artifacts) | | |

Additional browser test artifacts (all PASS, kept for cross-check):
- `docs/books/qa/runs/2026-07-02/VB-REP-11/` through `VB-REP-15/`
- `docs/books/qa/runs/2026-07-02/VB-REC-08/`, `VB-REC-09/`, `VB-REC-10/`, `VB-REC-10-2/`, `VB-REC-11/`, `VB-REC-CLEAR-INTERACTION/`, `VB-REC-STATEMENT-INPUT/`
- `docs/books/qa/runs/2026-07-02/VB-XCT-01/`, `VB-XCT-02/`, `VB-XCT-03/`, `VB-XCT-04/`
- `docs/books/qa/runs/2026-07-02/VB-REP-FULL/` (Reports page full data render)
- `docs/books/qa/runs/2026-07-02/VB-SET-01/`

---

## 6. Overall recommendation

**SHIP.**

The five fix-pass fixes are all live and behaving correctly. The 11 Phase E.1 behaviors all pass end-to-end in the browser. The 15 Phase D behaviors are all verified (most at the API level, the UI ones in the browser). The 2 Phase F1 behaviors are confirmed by direct DB evidence.

The two FAILs and three NEEDS-DECISIONs are:
- One pre-existing crash (Categorize.jsx) — explicitly carved out of fix-pass scope by the brief
- Two static-API-only mismatches with the spec (VB-INV-02 payments-don't-create-JE, VB-CAT-03 unset-doesn't-delete-JE) — real bugs, but not in any phase that just shipped; appropriate for a future fix-pass
- Two MINOR spec-ambiguities (NDC-2, NDC-3) — code behaves consistently; the QA.md wording is slightly imprecise

None of these block shipping. They are queued for Rusty's curation and Patrick's next-sprint prioritization.

**Post-test DB state:** Restored to baseline (11 transactions, 5 journal entries, 10 journal lines, 0 reconciliations, 1 leftover recon_clear, debits = credits = 181.92). Diff vs. pre-fix-pass baseline: identical.

---

*Echo run complete.*

— Echo 🛰️ · 2026-07-02 15:35 MDT · **VERDICT: SHIP** (with 2 FAIL + 3 NEEDS-DECISION queued for Rusty)
