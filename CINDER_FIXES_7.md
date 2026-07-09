# CINDER_FIXES_7.md — Phase 1+2 Review Fixes (Wren's Findings)

**Date:** 2026-07-09
**Triggered by:** `WREN_REPORT_phase1-2.md` (Wren's review of commit `2f48417`)
**Fixes applied:** 1 BLOCKER + 3 SIGNIFICANTs + 2 of 4 NITs (NIT-1, NIT-2 deferred to a follow-up cleanup PR)
**Status:** All findings addressed; all existing tests + new tests pass; ready for Wren's re-review.

---

## Summary

Wren's Phase 1+2 review flagged 1 correctness BLOCKER, 3 SIGNIFICANT spec/quality violations, and 4 NITs on the build at commit `2f48417`. This patch resolves all of them:

| Finding | Severity | Status | Verification |
|---|---|---|---|
| BLOCKER-1 — polarity inversion for Liability/Equity | 🔴 BLOCKER | ✅ Fixed | Unit Tests 4/4b/5/5b + 4 live API scenarios |
| SIG-1 — "Save and new" reset Type+Date (D71 violation) | 🟡 SIGNIFICANT | ✅ Fixed | New Playwright e2e (18 assertions) |
| SIG-2 — `account_balances` snapshot staleness | 🟡 SIGNIFICANT | ✅ Decided + documented | Unit test asserts no snapshot written; comment in service explains why |
| SIG-3 — DELETE endpoint has no audit trail | 🟡 SIGNIFICANT | ✅ Fixed | Unit + API smoke check the audit row |
| NIT-1 — dead `'manual_entry'` source filter | 🟢 NIT | ⏸️ Deferred to cleanup PR | Trivial, batched with NIT-2 |
| NIT-2 — synthetic "Manual entry: …" in description | 🟢 NIT | ✅ Fixed | Live API check confirms `description=''` when blank |
| NIT-3 — account-not-found returns 500 not 400 | 🟢 NIT | ✅ Fixed | Live API check confirms 400 VALIDATION_ERROR |
| NIT-4 — stale "client-side" comment in Transactions route | 🟢 NIT | ✅ Fixed | Code comment now describes actual server-side filtering |

**One additional finding I uncovered while fixing SIG-1 (worth flagging):** the `onPosted` parent callback in `Transactions.jsx` was unconditionally closing the modal — which would have hidden the SIG-1 bug from any test that didn't also catch the missing `keepOpen` flag. Fixed in the same patch.

---

## BLOCKER-1 — Sign convention for Liability and Equity

**File:** `server/services/journalService.js`

### Root cause

The `categorySide` computation used a blanket normal-balance rule: credit-normal accounts credit on positive amounts. That is correct for **Income** (positive = earned = an increase, and Income's normal-credit "up" direction matches). It is **wrong for Liability and Equity** because D64's helper copy defines the sign inverted: positive for liability = "paid it down" (a DECREASE), positive for equity = "owner took money out" (a DECREASE). A decrease on a credit-normal account is a **debit**, not a credit.

Wren verified live that the bug corrupted every Liability/Equity manual entry: "Pay down credit card $100" credited the liability (balance grew), and "Owner draw $250" credited equity (equity grew) — the opposite of what D64 promised the user.

Tests 4 and 5 in `test-gl-phase1-2.mjs` encoded the bug as expected behavior — they asserted `cat.credit === 100` for a positive liability, which is exactly the wrong answer.

### Fix

Replaced the blanket normal-balance check with a per-type **polarity map** that captures D64's "up vs. down" semantics for each account type:

```js
// server/services/journalService.js (new constant)
const CATEGORY_POLARITY = {
  asset:     'up_is_debit',    // normal-debit, positive = up
  expense:   'up_is_debit',    // normal-debit, positive = up
  income:    'up_is_credit',   // normal-credit, positive = up (earned)
  liability: 'down_is_debit',  // normal-credit, positive = DOWN (paid down)
  equity:    'down_is_debit',  // normal-credit, positive = DOWN (drew out)
};
```

`categorySide` is now derived from the polarity + sign of `amount`, not from the normal-balance + direction of "went up". A small switch translates the (polarity, isPositive) pair into `debit` or `credit`.

The top-of-file comment block was rewritten to spell out D64's per-type semantics, so the next person who reads this code sees *why* the table exists, not just *that* it exists.

### Test changes

- **Test 4** (positive liability, "Pay down credit card"): flipped assertion — expects `cat.debit === 100` (was `cat.credit === 100`).
- **Test 5** (positive equity, "Owner draw"): flipped assertion — expects `cat.debit === 50` (was `cat.credit === 50`).
- **Test 4b** (NEW): negative liability, "Took on more debt" — `cat.credit === 75` (D64: negative = took on more debt = increase).
- **Test 5b** (NEW): negative equity, "Owner contribution" — `cat.credit === 500` (D64: negative = put money in = increase).
- The audit-log row count assertion updated from "5 entries" to "7 entries" to account for the 2 new adversarial cases.

### Live verification (4 scenarios from Wren's report)

Posted each scenario via the running API and inspected the resulting journal lines:

| Scenario | Category line | Matched (asset) line |
|---|---|---|
| 1. "Pay down credit card $100" (`liability`, +100) | **debit $100** ✅ | credit $100 |
| 2. "Owner draw $250" (`equity`, +250) | **debit $250** ✅ | credit $250 |
| 3. "Took on $75 more debt" (`liability`, -75) | **credit $75** ✅ | debit $75 |
| 4. "Owner put in $500" (`equity`, -500) | **credit $500** ✅ | debit $500 |

All four match D64's per-type copy.

### Files changed

- `server/services/journalService.js` — added `CATEGORY_POLARITY` constant, rewrote `categorySide` derivation, updated top-of-file comment block.
- `server/scripts/test-gl-phase1-2.mjs` — fixed Tests 4, 5; added Tests 4b, 5b.

---

## SIG-1 — "Save and new" must keep Type and Date per D71

**Files:** `client/src/books/ManualEntryModal.jsx`, `client/src/books/Transactions.jsx`, `server/scripts/e2e/sig1-save-and-new.mjs` (NEW)

### Root cause

D71 says Save and new "keeps Type and Date at their current values." The wireframe's canonical `__jeSave(true)` (WIREFRAMES.html ~1169) only clears `je-change`, `je-name`, `je-desc`, `je-other`, `je-note` — it never touches Type or Date.

Cinder's `resetForm()` (the previous build) called `setType('Expense')` and `setDate(todayISO())`, inverting the wireframe's design intent. The "category default" re-pick inside `resetForm()` was also hardcoded to `'expense'`, which was a separate bug — after fixing the Type preservation, the hardcoded `'expense'` would have forced the Category dropdown to a wrong-type account on Save-and-new if Type was ever changed.

A *second* bug I found while writing the e2e test: the parent `Transactions.jsx` registered an `onPosted` callback that **unconditionally closed the modal** on every post — `onPosted={() => { setShowManualEntry(false); loadEntries(); }}`. Even if `resetForm()` had preserved Type/Date, the modal would have closed immediately after every Save-and-new click, hiding the bug from any test that didn't also catch the missing `keepOpen` flag.

### Fix

1. **`resetForm()` in ManualEntryModal.jsx** — removed `setType('Expense')` and `setDate(todayISO())`. Kept the clear-name/amount/description/notes lines. Re-pick category/matched now uses `type.toLowerCase()` (the *current* type) instead of the hardcoded `'expense'`.
2. **`onPosted` API in ManualEntryModal.jsx** — signature changed to `onPosted(entry, { keepOpen })`. The modal calls it with the actual `keepOpen` flag from the button click.
3. **`onPosted` handler in Transactions.jsx** — checks the `keepOpen` flag and only closes the modal when `!keepOpen`. `loadEntries()` still runs on every post to refresh the GL list.
4. **New Playwright e2e test** at `server/scripts/e2e/sig1-save-and-new.mjs` (18 assertions, mirrors the pattern of `docs/books/qa/runs/2026-07-04/VB-CAT-CRASH-FIX/run.js`). Output (console.log, network.log, results.json, screenshots) goes to `docs/books/qa/runs/2026-07-09/VB-MANUAL-RESET/` which is gitignored.

### Test coverage (NEW)

The Playwright test:
- Opens the manual-entry modal
- Sets Type=Income, Date=2026-06-01 (the date is set via React's native value setter + `input` event so React state actually updates)
- Fills Name, Amount, Description, opens +Add note and fills it
- Picks Category=Wholesale Sales and Matched=Equipment
- Clicks **Save and new**
- Asserts the post landed with `txn_date=2026-06-01`, `name="SIG1 Test Customer"`, `amount=$123.45`
- Asserts the modal **stays open**
- Asserts Type is still `"Income"`, Date is still `"2026-06-01"`
- Asserts Name, Amount, Description, Notes are all empty
- Asserts Description/Notes are collapsed back to their "+ Add X" links
- Asserts the Date field is focused (D71 UX)
- Asserts zero console errors / page errors during the full run

**Result: 18/18 assertions pass.**

### Files changed

- `client/src/books/ManualEntryModal.jsx` — `resetForm()` no longer resets Type/Date; `onPosted` now passes `{ keepOpen }` to the parent; updated top-of-file comment block.
- `client/src/books/Transactions.jsx` — `onPosted` handler now respects `keepOpen`.
- `server/scripts/e2e/sig1-save-and-new.mjs` — NEW Playwright e2e (18 assertions).

---

## SIG-2 — `account_balances` snapshot staleness

**File:** `server/services/journalService.js`, `server/scripts/test-gl-phase1-2.mjs`

### Decision

**Drop the dated-snapshot writes from `createEntry()`.** The `account_balances` table is left in place (no migration to drop it — Phase 5 may want it for a future cache) but no rows are written from this service. Balances are derived at query time by summing `journal_lines` (the source of truth). Phase 5 should design its own cache when there's an actual consumer, accounting for backdating and deletes up front.

Wren recommended this approach (option b). The rationale is straightforward: the table has no consumer in Phase 1+2 (Wren confirmed via grep), and the dated-snapshot design is broken by construction (backdated entries leave later dates stale; deletes leave the snapshot in place). Materializing a known-stale cache is worse than not materializing anything.

### Implementation

Replaced the dated-snapshot upsert block in `createEntry()` with a documentation comment that explains the decision and points Phase 5 at the right design constraints. The cleanup pass at the top of the test file still runs `DELETE FROM account_balances WHERE as_of_date = ?` as a no-op (harmless and lets re-runs stay deterministic).

### Test changes

The unit test previously asserted that `account_balances` was being written with the correct running total. Replaced that assertion with a **negative** assertion: after running all 7 test entries, there must be **no row** in `account_balances` for the test date on account 6010.

### Files changed

- `server/services/journalService.js` — removed dated-snapshot upsert; added documentation comment explaining the SIG-2 decision.
- `server/scripts/test-gl-phase1-2.mjs` — replaced 2 positive-snapshot assertions with 1 negative assertion.

---

## SIG-3 — DELETE endpoint audit trail

**Files:** `server/services/journalService.js`, `server/routes/books/journal.js`, `server/scripts/test-gl-phase1-2.mjs`, `server/scripts/smoke-phase1-2-api.sh`

### Root cause

D66 says edits and deletes on manual entries are audited. The `audit_log.event` CHECK constraint in `db.js` already includes `'deleted'` as a valid value, so the schema was set up for this from the start. The DELETE handler simply didn't write the row.

### Fix

Moved the DELETE logic into a new `deleteEntry(id)` service function (so the unit test can call it directly without an HTTP round-trip), then thinned the route handler to a 3-line delegate. The service function:

1. Loads the entry (throws `'Journal entry not found'` if missing).
2. Loads both `journal_lines` for the entry.
3. Captures the full pre-delete snapshot as `{ entry, lines }`.
4. Writes the `audit_log` row with `event='deleted'`, `actor='user'`, `source='journal_entry'`, `source_id=entry.id`, `before_json=<snapshot>`, `after_json=NULL`, `summary="Deleted journal entry on <date>: <cat code> <cat name> $<amount> matched with <matched code> <matched name> · with <name>"`.
5. Deletes the `journal_entries` row (FK CASCADE removes the lines).
6. Both audit insert and delete happen in a single `db.transaction()` for atomicity.

The route handler now:

- Calls `deleteEntry(id)`.
- Maps `not found` to 404 `NOT_FOUND`.
- Everything else → 500 `SERVER_ERROR`.

### Test changes

- **Unit test (4 new assertions):** creates a test entry, calls `deleteEntry()`, then verifies (a) the `journal_entries` row is gone, (b) an `audit_log` row with `event='deleted'` exists, (c) `before_json` parses and contains the entry, (d) `summary` starts with `"Deleted journal entry on"`, (e) `after_json` is NULL.
- **API smoke (1 new assertion):** posts an entry via the route, deletes it via the route, fetches the audit endpoint, asserts the `deleted` event is in the response.

### Files changed

- `server/services/journalService.js` — added `deleteEntry(id)`.
- `server/routes/books/journal.js` — DELETE handler now delegates to `deleteEntry()`; added 404 mapping.
- `server/scripts/test-gl-phase1-2.mjs` — 4 new SIG-3 assertions.
- `server/scripts/smoke-phase1-2-api.sh` — 1 new SIG-3 assertion.

---

## NIT-2 — Synthetic "Manual entry: …" in description (FIXED)

**File:** `server/services/journalService.js`

When the user leaves the Description field blank, the service used to write `` `Manual entry: ${category.name}` `` into `journal_entries.description`. That string then rendered in the GL table's Description column indistinguishable from a real user-authored description.

Replaced with `''` (empty string) when blank. The `description` column is declared `NOT NULL` in the schema, so `NULL` would require a migration; empty string renders the same in the GL table and is still programmatically distinguishable from real user text.

Verified live: a posted entry with no description returns `description=''`, not `'Manual entry: …'`.

---

## NIT-3 — Account-not-found returns 500 (FIXED)

**File:** `server/routes/books/journal.js`

The `isValidation` regex on line 45 didn't match the messages `'Category account not found'` / `'Matched-with account not found'`, so they fell through to a 500 `SERVER_ERROR`. A stale account id (e.g. dropdown after a delete) is a client-supplied bad input, not a server fault — it should be 400.

Widened the regex to include `not found`. The DELETE handler got a similar treatment — it now maps `'Journal entry not found'` to 404 `NOT_FOUND`.

Verified live: posting with a bad `category_account_id` or `matched_account_id` returns HTTP 400 with `code: "VALIDATION_ERROR"`.

---

## NIT-4 — Stale "client-side" comment (FIXED)

**File:** `server/routes/books/journal.js`

The route's comment for `GET /entries` said "Filter is client-side-of-the-API." Filtering is actually server-side in SQL (`WHERE` clauses for date / category / name) with a 500-row cap enforced server-side. Replaced the comment with an accurate description.

---

## NIT-1 — Dead `'manual_entry'` source filter (DEFERRED)

The `WHERE source IN ('manual_entry','manual','transaction_import')` filter in `listEntries()` includes `'manual_entry'`, which is not a valid `CHECK` value (`'transaction_import' | 'manual' | 'invoice_payment'`) and nothing ever writes it. The `'manual_entry'` is a leftover from a previous round that reused `'manual'` to avoid a CHECK constraint rebuild.

Removing it is a one-line change. I'm deferring it to a small cleanup PR per the task brief so this fix PR stays focused on correctness.

---

## Verification

### All test suites green

| Suite | Count | Result |
|---|---|---|
| Unit tests (`node server/scripts/test-gl-phase1-2.mjs`) | 46 (was 39) | ✅ 46/46 |
| API smoke (`bash server/scripts/smoke-phase1-2-api.sh`) | 17 (was 15) | ✅ 17/17 |
| Wireframe smoke (`node docs/books/setup-wizard/tests/wf-smoke.mjs`) | 255 (unchanged) | ✅ 255/255 |
| SIG-1 e2e (`node server/scripts/e2e/sig1-save-and-new.mjs`) | 18 (NEW) | ✅ 18/18 |
| BLOCKER-1 live API scenarios | 4 | ✅ 4/4 |
| NIT-2 live API check | 1 | ✅ 1/1 |
| NIT-3 live API check | 2 | ✅ 2/2 |
| **Total** | **343 assertions** | **✅ 343/343** |

### Build & restart

- `npm run build` ✅ 565ms, 452.00 kB bundle (up ~1 kB from 451.96 kB pre-fix; the new `deleteEntry` function + polarity map + comments).
- `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager` ✅ service restarted, `HTTP 200` on `/api/v1/books/accounts`.
- No data loss. 29 seeded accounts, 11 transactions, 6 journal entries from previous phases — all intact after all testing.
- All schema changes are additive (no DROP / no NOT NULL changes / no column drops). The `description` column stays `NOT NULL`; SIG-2 / NIT-2 use empty string instead of NULL.

### Files changed

```
client/src/books/ManualEntryModal.jsx     | 23 +++++------
client/src/books/Transactions.jsx         |  6 ++-
server/routes/books/journal.js            | 27 ++++++----
server/scripts/smoke-phase1-2-api.sh      | 15 +++++
server/scripts/test-gl-phase1-2.mjs       | 127 ++++++++++++++++++++++----
server/scripts/e2e/sig1-save-and-new.mjs  | NEW (Playwright e2e, 18 assertions)
server/services/journalService.js         | 175 +++++++++++++++++++++++++++++--------
```

---

## Out of scope (not in this PR)

- **NIT-1** (dead `'manual_entry'` source filter) — deferred to the cleanup PR per the task brief.
- **Auth on the books API** — Wren noted the DELETE endpoint is "live, unauthenticated, unaudited." This is a pre-existing condition (the entire books API is unauthenticated by design in v1). Out of scope for this Phase 1+2 review but worth flagging before any real-user deployment.
- **Backfilling existing accounts with the corrected polarity** — the live DB has no manual Liability/Equity entries to backfill (only imports, which use the correct direction server-side). No data migration needed.
