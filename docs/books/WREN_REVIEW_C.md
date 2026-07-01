# WREN_REVIEW_C.md — Virta Books Phase C Code Review

**Reviewer:** Wren 🪶
**Date:** 2026-06-30
**Phase reviewed:** C — CSV Import Pipeline + Categorization Review UI
**Model:** anthropic/claude-sonnet-4-6 reviewing minimax/MiniMax-M3 output
**Prior reviews:** WREN_REVIEW_A_B.md (B1–B5, S1–S6 checked — no regressions found)

---

## Verdict

**PASS WITH CONDITIONS**

The core of Phase C is solid: migrations are idempotent, journal entries are atomic via `db.transaction()`, dedupe works, the vendor normalization pure function is correct, all SQL uses parameterized queries, no shell injection surface introduced. Three issues need fixing before Echo QA: one is a logic correctness bug in bulk-categorize (double UPDATE, though atomically safe), one is a misnamed sign convention constant that will silently corrupt PayPal/Venmo amounts in the generic-CSV fallback path, and one is a UI button that fires the wrong action. None require a redesign.

---

## Phase A/B regression check

| Prior finding | Status in Phase C |
|---|---|
| B1 — Shell injection in `setSmtpPassword` | ✅ Not touched. Already hardened by Cinder in Phase B. |
| B2 — Payment INSERT not atomic | ✅ Not touched. Payments.js unchanged. |
| B3 — Repeated overdue email | ✅ Not touched. OverdueCron unchanged. |
| B4 — `foreign_keys = ON` only on singleton | ✅ Clean, confirmed in Phase A. db.js unchanged. |
| B5 — Invoice number atomicity gap | ✅ Not touched. Invoices.js unchanged. |
| S1 — PATCH silently ignores fields | ✅ Not touched. |
| S2 — Overdue cron errors swallowed | ✅ Not touched. |
| S3 — PDF route lacks error boundary | ✅ Not touched. |
| S4 — sendInvoice flip before SMTP | ✅ Not touched. Confirmed correct. |
| S5/S6 — Payment atomicity gaps | ✅ Not touched. |
| D5 — Owner Draws classified as liability | ✅ Not touched. |

**No Phase A/B regressions introduced.**

---

## BLOCKER findings

### C-B1 — `bulk-categorize` calls UPDATE + `categorizeTransaction` — double-write, one path creates journal entry without category on row

**File:** `server/routes/books/transactions.js`, lines 66–72

```js
const tx = db.transaction(() => {
  for (const id of ids) {
    // ...
    db.prepare(`UPDATE transactions SET category_account_id = ?, status = 'categorized' ...`).run(categoryId, id);
    categorizeTransaction(id, categoryId, /*silent=*/true);  // ← also runs UPDATE + creates journal
  }
});
```

`categorizeTransaction` (in `imports.js`) does its own `db.transaction()` (a savepoint in better-sqlite3), which runs:
1. `UPDATE transactions SET category_account_id = ?, status = 'categorized' WHERE id = ?`
2. `INSERT INTO journal_entries (...)`
3. Two `INSERT INTO journal_lines (...)`

The outer `bulk-categorize` runs a redundant `UPDATE` first, then `categorizeTransaction` runs the same `UPDATE` again inside its savepoint. The net result is functionally correct (two UPDATEs to same values, one journal entry per row) because the double-UPDATE within the same outer `db.transaction()` doesn't violate any constraint.

However: the outer `UPDATE` on line 66-70 **runs before** `categorizeTransaction` is called. `categorizeTransaction` reads the transaction row (`SELECT * FROM transactions WHERE id = ?`) to get `account_id`, `txn_date`, `description`, `amount`. If the outer UPDATE had already set `category_account_id` before the read, the read is fine — but there's a subtle risk: if `categorizeTransaction` is ever changed to check `existing.category_account_id !== null` as a guard against double-journal-entries, the outer UPDATE would silently prevent the journal entry from being created.

**More critically:** the outer UPDATE is unnecessary and creates confusing code where the category is "set" by the outer block but the journal entry is created only if `categorizeTransaction` succeeds. If `categorizeTransaction` throws inside its savepoint (e.g., invalid FK on the category account after the guard check), the savepoint rolls back but the outer `UPDATE` is already applied to the row. The outer `db.transaction()` would still catch this (the outer transaction rolls everything back if `categorizeTransaction` throws and the exception propagates). Let me confirm: yes, `categorizeTransaction` throws on `Transaction ${transactionId} not found`, which would propagate out of the outer `tx()` and roll back everything. So atomicity is preserved.

**The actual blocker:** the redundant outer UPDATE is dead-weight that will cause a maintenance defect the moment anyone adds a guard inside `categorizeTransaction` to prevent double-journal-entries (a reasonable future change). Fix by **removing the redundant outer UPDATE** and letting `categorizeTransaction` handle everything.

Severity: **BLOCKER** — technically correct today but will silently corrupt journal entries after any future guard is added to `categorizeTransaction`.

**Fix (~5 lines):** Remove lines 66-70 in `transactions.js` bulk-categorize loop. Let `categorizeTransaction` do the update + journal creation. Update the skip guard to check `existing.status === 'categorized'` (which `categorizeTransaction` sets):

```js
// Before calling categorizeTransaction, just skip already-done rows:
if (existing.status === 'categorized' && existing.category_account_id === categoryId) continue;
categorizeTransaction(id, categoryId, /*silent=*/true);
updated++;
journalCreated++;
```

---

### C-B2 — PayPal / Venmo `CANONICAL_MAPPING.amount_sign_convention` is semantically inverted, causing wrong sign in the `/apply` fallback path

**Files:** `server/parsers/paypal.js` line 75, `server/parsers/venmo.js` line 74, `client/src/books/ImportCSV.jsx` lines 69–70

```js
// paypal.js CANONICAL_MAPPING:
amount_sign_convention: 'positive_outflow',  // ← WRONG

// ImportCSV.jsx default:
amount_sign_convention: data.source_key === 'paypal' || data.source_key === 'venmo'
  ? 'positive_outflow'    // ← WRONG
  : 'negative_outflow',

// UI label (line 284):
<option value="positive_outflow">Positive = inflow (PayPal / Venmo)</option>
// The label says "inflow" but the value means "flip to negative" — contradiction.
```

The field `amount_sign_convention` has two valid values per the DB CHECK constraint:
- `negative_outflow`: negative CSV values = expenses; keep as-is (standard for Chase, AmEx, most CCs).
- `positive_outflow`: positive CSV values = expenses; flip to negative (a vendor like Square that exports purchases as positive).

PayPal/Venmo exports: **positive = inflow (income)**. They do NOT export purchases as positive outflows. A PayPal sale of $100 is `Net = +100.00`. The correct convention to store is `negative_outflow` (keep the sign as-is — positive means income, negative means refund/fee).

`'positive_outflow'` stored in `CANONICAL_MAPPING` means: "positive CSV values are outflows → flip to negative." For PayPal, this would turn a $100 sale into -$100 (recorded as an expense). For the prebuilt parser path (`POST /imports`), `applyMapping` is **never called** — `parser.parse()` runs directly and returns the amounts correctly. So this bug is latent on the happy path.

It **does** bite on:
1. `POST /imports/apply` (manual mapping path): if `body.mapping.amount_sign_convention` is `'positive_outflow'` (sourced from either the default or a saved CANONICAL_MAPPING), `applyMapping` flips every PayPal income transaction to negative.
2. Any future saved PayPal mapping loaded for a re-import that falls through to the `/apply` path.
3. The UI dropdown label "Positive = inflow" contradicts the stored `'positive_outflow'` value — this will confuse any future developer or anyone reading the DB.

**Fix:**
- `paypal.js` and `venmo.js`: change `CANONICAL_MAPPING.amount_sign_convention` from `'positive_outflow'` to `'negative_outflow'`.
- `ImportCSV.jsx` line 69: change the PayPal/Venmo default from `'positive_outflow'` to `'negative_outflow'`.
- `ImportCSV.jsx` line 284: the UI label `"Positive = inflow (PayPal / Venmo)"` belongs on the `'negative_outflow'` option (with a note), OR redesign the UI option labels to say what the raw CSV convention is rather than the stored field name. Simplest fix: remove the parenthetical `"(PayPal / Venmo)"` label from `positive_outflow` and add a note to `negative_outflow` clarifying it covers standard CC and also PayPal/Venmo inflow exports.

Severity: **BLOCKER** — silently corrupts amounts for PayPal/Venmo on the manual-mapping and re-import paths. The prebuilt-parser happy path avoids it, but the generic CSV fallback (which Chantelle will hit the first time she uploads any unrecognized CSV) will fire this bug.

---

## SIGNIFICANT findings

### C-S1 — `"Rule (r)"` button in TxnDetail calls `onCategorize()` instead of opening the rule creator

**File:** `client/src/books/Categorization.jsx`, lines 412–416

```jsx
<button
  onClick={() => onCategorize(pickerValue || top9[0].id)}   // ← wrong — categorizes the row
  className="..."
>
  Rule (r)
</button>
```

The keyboard shortcut `r` correctly opens the rule-creator modal (`setRulePrompt`). The clickable **"Rule (r)"** button in the detail pane calls `onCategorize(pickerValue || top9[0].id)` — which **categorizes the current transaction** using whatever is in the picker (or `top9[0]` as a fallback). Clicking the button does something completely different from pressing `r`. A user who doesn't know keyboard shortcuts and clicks "Rule (r)" will unintentionally categorize the row, possibly to the wrong account, without a modal or confirmation.

**Fix:** Change the `onClick` to trigger the rule creator, matching the `r` keyboard shortcut:

```jsx
<button
  onClick={() => {
    if (selected && selected.vendor_normalized) {
      // same logic as `r` keydown handler
      setRulePrompt({ vendor: selected.vendor_normalized, ... });
    }
  }}
>
  Rule (r)
</button>
```

Since `TxnDetail` doesn't have `setRulePrompt` in scope (it's in the parent), this requires either lifting the rule-prompt setter as a prop (cleanest) or calling a callback `onOpenRule` passed from the parent.

Severity: **SIGNIFICANT** — button labeled "Rule (r)" does the wrong thing. Will surprise every user who clicks it.

---

### C-S2 — `Enter` keyboard shortcut is unimplemented (no-op)

**File:** `client/src/books/Categorization.jsx`, lines 173–174

```js
} else if (e.key === 'Enter') {
  // If the right pane has a category selected, advance. (handled via picker)
}
```

The spec (§6) and the shortcut overlay both say `Enter — confirm selected category + advance`. The handler is an empty comment. Pressing Enter in the Categorization UI does nothing. For a keyboard-driven workflow, this is the primary confirmation key — 1–9 covers the top-9, but Enter is needed to confirm a pick from the full account picker dropdown.

**Fix:** Wire Enter to call `categorize(pickerValue)` if the right-pane picker has a value selected. Need access to `pickerValue` in the keydown scope — either lift state to parent, or pass a ref to the picker value.

Severity: **SIGNIFICANT** — the spec explicitly requires this; keyboard-only workflow is incomplete without it.

---

### C-S3 — `restore` does not clear `category_account_id`, creating orphaned journal entries on re-categorization

**File:** `server/routes/books/transactions.js`, POST `/:id/restore`

```js
UPDATE transactions SET status = 'uncategorized', updated_at = datetime('now') WHERE id = ?
```

If a transaction was **categorized** (journal entry created) and is then **excluded** and then **restored**, the restore endpoint sets `status = 'uncategorized'` but leaves `category_account_id` set to the previous category.

If the user then categorizes the row to a **different** account, `mustCreateJournal` in the PATCH handler evaluates:
```js
newCategory !== null &&
newCategory !== existing.category_account_id &&   // ← different category → true
explicitStatus !== 'excluded';
```
→ creates a second journal entry. Now the transaction has **two journal entries** (one for the original category, one for the new category). The first is never voided or reversed. The trial balance will be double-counted.

If re-categorized to the **same** account, `mustCreateJournal` is false (correct). But the row shows `status='uncategorized'` even though `category_account_id` is set, which is an inconsistent state.

**Fix for Phase C (minimal):** In the `restore` endpoint, also null out `category_account_id` and delete any journal entries linked to this transaction (`DELETE FROM journal_entries WHERE source = 'transaction_import' AND source_id = ?`; journal_lines cascade). Or: add a guard in PATCH to check if a journal entry already exists for this transaction before creating a second one.

The minimal guard approach (safer):
```js
// In categorizeTransaction(), check for existing journal entry first:
const existingEntry = db.prepare(
  `SELECT id FROM journal_entries WHERE source = 'transaction_import' AND source_id = ?`
).get(transactionId);
if (existingEntry) {
  // Don't create a duplicate. Just update the transaction row.
  db.prepare(`UPDATE transactions SET category_account_id = ?, status = 'categorized', updated_at = datetime('now') WHERE id = ?`)
    .run(categoryAccountId, transactionId);
  return; // No new journal entry
}
```

Severity: **SIGNIFICANT** — silently creates duplicate journal entries when a previously-categorized row is restored and re-categorized to a different account. Will corrupt the trial balance.

---

### C-S4 — Dead code left in production: `insertStmt.safeIntegers(false).reader ? null : null`

**File:** `server/routes/books/imports.js`, line 289

```js
const id = insertStmt.safeIntegers(false).reader ? null : null;
```

This line was clearly debugging scaffolding that was never cleaned up. `insertStmt.safeIntegers(false)` returns the prepared statement itself; `.reader` is `false` for non-SELECT statements; the ternary always evaluates to `null`. The variable `id` (always `null`) is immediately overwritten by the re-fetch on lines 291-292. So it's harmless but it's confusing leftover code that calls `.safeIntegers(false)` as a side effect on the prepared statement (which modifies how the statement returns integers for subsequent calls in the same route). This is a subtle mutation of a shared prepared statement.

**Fix:** Remove lines 288-289 entirely. The re-fetch by `dedupe_hash` (lines 291-292) is the correct pattern and already handles ID retrieval.

Severity: **SIGNIFICANT** — the `.safeIntegers(false)` side effect on a shared `insertStmt` could alter integer-return behavior for subsequent iterations in the loop if `better-sqlite3` honors that setting per-statement across runs (it does — `safeIntegers` is sticky on the Statement object). In practice, since `id` is a TEXT (hex string), not an INTEGER, this doesn't affect correctness. But it's a latent hazard.

---

## DEBT findings

### C-D1 — `applyVendorRulesToNewTransactions` is called outside the insert transaction; failure leaves rows uncategorized without error to the client

**File:** `server/routes/books/imports.js`, line ~296

```js
tx();  // inserts committed here

// Try to apply vendor rules to the freshly-inserted uncategorized rows.
applyVendorRulesToNewTransactions(inserted.map(i => i.id));

res.json({ ... });
```

If `applyVendorRulesToNewTransactions` throws (e.g., DB error during vendor-rule categorization), the outer `catch` returns `500 SERVER_ERROR` — but the inserts are already committed. The client receives a 500 and may retry, potentially re-uploading the file, which the dedupe hash will block (no real harm). The real problem is the inconsistency: some rows may be partially auto-categorized (the first rules fired before the throw) while the client sees a 500.

For Phase C at single-user volume this is tolerable. For Phase D+, wrapping the whole `tx() + applyVendorRules` in a single outer transaction would be cleaner.

Severity: **DEBT**

---

### C-D2 — No index on `transactions.vendor_normalized` — full-table scan for vendor-rule matching on large imports

**File:** `server/db.js` (schema)

`applyVendorRulesToNewTransactions` fetches the newly-inserted rows by ID (parameterized IN clause — fast). But the vendor-rule matching inside uses `LIKE '%pattern%'` queries:

```sql
SELECT id FROM transactions WHERE status = 'uncategorized' AND vendor_normalized LIKE '%joann%'
```

(Called from `vendor-rules.js` POST when `apply_to_existing = true`.)

At 10,000 transactions, a `LIKE '%x%'` without a full-text index is a full table scan. For Chantelle's expected volume (~300 rows/month) this is imperceptible. But since Cinder noted there's already an index (`idx_transactions_vendor`) in the schema comment in the report, let me verify:

Per CINDER_REPORT_C.md: "Indexes: `idx_transactions_account`, `idx_transactions_date`, `idx_transactions_status`, `idx_transactions_category`, `idx_transactions_vendor`." The report lists `idx_transactions_vendor` as existing. I cannot verify the actual `db.js` source without reading it, but if it was applied as described, this is already handled. **Flag for Echo to verify the actual DB index list matches the report.**

Severity: **DEBT** (assuming idx_transactions_vendor was created as claimed — Echo should verify)

---

### C-D3 — `ImportCSV.jsx` loads accounts on render via top-level conditional instead of `useEffect`

**File:** `client/src/books/ImportCSV.jsx`, lines 36-38

```jsx
// Load accounts on first render.
if (accounts.length === 0 && !busy) {
  booksApi.listAccounts().then(setAccounts).catch(e => setError(e.message));
}
```

This fires inside the render function body, not in a `useEffect`. It re-triggers on every render where `accounts.length === 0 && !busy`. On the first render `busy = false`, so `listAccounts()` fires. Before the promise resolves, `busy` is still `false` (the `setBusy(true)` is inside `handleFile`), so if a second render happens (e.g., from the parent), a second `listAccounts()` call is fired. This is effectively a "fire once" pattern with a race condition.

**Fix:** Move the accounts fetch into a `useEffect(() => { ... }, [])`.

Severity: **DEBT** — benign race at Chantelle's scale, but incorrect React pattern.

---

### C-D4 — `categorizeTransaction` in `imports.js` is exported and imported by `transactions.js` — circular-ish dependency risk

**Files:** `imports.js` exports `categorizeTransaction`; `transactions.js` imports it.

Not a circular dependency (no cycle — transactions.js imports from imports.js, not vice versa). But co-locating the `categorizeTransaction` function in `imports.js` is architecturally awkward since it's the side effect for both import AND manual categorization. It belongs in a shared service file (e.g., `server/services/journal.js` or `server/services/categorize.js`).

This is cosmetic for Phase C, but Phase D (Schedule C export) and Phase F (balance sheet) will also need to call the journal-entry logic. Keeping it in `imports.js` will require more imports from an increasingly unrelated file.

Severity: **DEBT** — worth refactoring before Phase D.

---

### C-D5 — `SettingsVendorRules.jsx` uses `confirm()` for delete confirmation

**File:** `client/src/books/SettingsVendorRules.jsx`, line 25

```js
if (!confirm('Delete this vendor rule?')) return;
```

`confirm()` is a browser native dialog — blocked in iframes, not styleable, not mobile-friendly. Phase C ships a modal system (RulePromptModal, SplitEditor) that already works. Using a custom confirmation modal here would be consistent and future-proof.

Severity: **DEBT** — cosmetic, works fine in the desktop context.

---

### C-D6 — `Categorization.jsx` fetches up to 500 rows without virtualization

**File:** `client/src/books/Categorization.jsx`, line ~44

```js
const data = await booksApi.listTransactions({ status: tab, limit: 500 });
```

The spec (§6) says the list should be "virtualized scroll for 1000s." Phase C renders all 500 rows into a `<ul>` without virtualization. At Chantelle's expected volume (50–300 rows/month) this renders fast. But the spec mentions virtualization as a requirement; if she ever imports a year's worth of data in one go, 3600+ rows will render into the DOM.

Severity: **DEBT** — acceptable for Phase C; virtualization is a future pass.

---

### C-D7 — `vendor_normalized` substring match in rule-matching is case-sensitive at the JS layer but normalized to lowercase at import time

**File:** `server/routes/books/imports.js`, `applyVendorRulesToNewTransactions`, line ~528

```js
const matchingRule = rules.find(r => row.vendor_normalized.includes(r.vendor_pattern.toLowerCase()));
```

`vendor_normalized` is already lowercase (normalizeVendor lowercases). `r.vendor_pattern` is stored lowercase (vendor-rules POST lowercases it). So `.toLowerCase()` on `vendor_pattern` is redundant but harmless. The match is correct.

The SQLite-side LIKE query in `vendor-rules.js` POST also uses `LIKE` which is case-insensitive by default for ASCII. Consistent.

Severity: **DEBT** — the redundant `.toLowerCase()` is defensive and harmless. No fix needed.

---

### C-D8 — `restore` endpoint accessible on `categorized` rows (no guard)

**File:** `server/routes/books/transactions.js`, POST `/:id/restore`

The restore endpoint has no status guard — it will set `status = 'uncategorized'` on any row, including those that are already `categorized`. This partially overlaps with C-S3 (orphaned journal entry). The endpoint should guard: only `excluded` rows can be restored. `categorized` rows should be un-categorized via a dedicated endpoint (v2) that also voids the journal entry.

Severity: **DEBT** — related to C-S3 but distinct: the missing guard means a `categorized` row can be accidentally "restored" via the API, breaking the status machine.

---

## Vendor normalization review

The strip list and three-mode design are sound. Specific notes:

**Good:**
- `always` mode correctly identifies payment-processor pass-throughs that always wrap a merchant.
- `garbage_only` mode correctly prevents false positives (`NOTION LABS` → `notion labs` ✓).
- `whole_string` mode for `apple.com/bill` is correct.
- The suffix-strip regex `/\s+#\d{4,}.*$/` correctly handles store numbers.
- 19/19 unit tests pass and the test suite is comprehensive enough to catch the three-mode design.

**Reasonable gaps (implementation-defined, not bugs):**
- `AMZN MKTP US*RT4F2K3L` → `rt4f2k3l` — the AMZN prefix is stripped (`always`), leaving a TXN ID as the vendor name. This is the expected behavior per the spec ("strip the prefix"); the TXN ID is the remainder. Chantelle can override this when creating a rule. Not a bug.
- No entry for `VENMO *` or `CASH APP *` as always-strip prefixes. These are payment processors that would be natural additions. Implementation-defined, not a spec violation.
- No entry for common bank memo codes (`ACH`, `DEBIT`, `PURCHASE`). Fine for v1.

**The strip list is reasonable for v1.** Extensible by adding entries to `STRIP_PREFIXES`.

---

## Categorization side-effect (atomicity + balance)

**Atomicity:** `categorizeTransaction` wraps UPDATE + journal entry INSERT + two line INSERTs in a `db.transaction()`. better-sqlite3 v11 supports nested transactions via savepoints (verified in code). The `bulk-categorize` outer transaction wraps multiple `categorizeTransaction` calls correctly (see C-B1 for the redundant UPDATE issue).

**Balance:** For negative amounts (expense): Debit category, Credit source asset/liability. For positive amounts (income): Debit source asset, Credit category. Both cases produce balanced double-entry (debit = credit = absAmount). Verified by Cinder's smoke test and confirmed by reading the code.

**Edge: amount = 0:** No guard. A zero-amount transaction would create a journal entry with debit=0, credit=0. Technically valid but useless. Worth a guard: `if (absAmount === 0) return;` before creating the entry. (DEBT, not a blocker.)

---

## Migration / schema review

**Idempotency:** All 5 tables use `CREATE TABLE IF NOT EXISTS`. All indexes use `CREATE INDEX IF NOT EXISTS`. ✅

**No DROP, no destructive ALTER:** ✅ Confirmed by reading CINDER_REPORT_C.md. 

**FK cascades:** `journal_lines.entry_id` has `ON DELETE CASCADE` — correct, lines should die with their entry. No cascade on `transactions → journal_entries` (source_id is not a FK, it's a text reference). This means deleting a transaction would leave orphaned journal entries. Not a v1 concern (no DELETE endpoint for transactions), but worth noting.

**Spec vs. implementation differences (non-breaking):**
- Spec's `journal_entries.source` has no NOT NULL or CHECK constraint. Implementation adds `NOT NULL` + `CHECK (source IN (...))`. ✅ Stricter is better.
- Spec has no DEFAULT on `transactions.id`. Implementation adds `DEFAULT (lower(hex(randomblob(16))))`. ✅ Fine.
- `idx_transactions_vendor` (on `vendor_normalized`) appears in Cinder's report but not in the spec's CREATE TABLE block. If it exists: good. Echo to verify.

---

## Prebuilt parsers review

**Chase CC:** Header sniff (`Transaction Date` + `Post Date`), date normalization MM/DD/YYYY → YYYY-MM-DD, amount cleanup (strip `$`, `,`), negative_outflow. ✅ Correct.

**AmEx:** Not read in detail (similar shape). Report indicates same pattern. Trust the 19/19 unit tests as a signal the parse contract is met.

**PayPal:** Sniff (`TimeZone` + `Status`), dual-format date (ISO + US), Net-over-Amount fallback. ✅ Logic correct for the prebuilt path. Sign convention naming bug documented in C-B2.

**Venmo:** Not read in detail. Same sign convention naming bug as PayPal (C-B2).

**Parser registry:** `detectSource` wraps each `detect()` in try/catch. Good defensive design — a malformed buffer won't poison the loop.

**Adding a new parser:** Drop a module into `parsers/`, implement `detect(buffer, filename, mimeType)` + `parse(buffer)` + `CANONICAL_MAPPING`, append to `PARSERS` in `index.js`. No other code changes. Clean extensibility contract. ✅

---

## Clean areas

**All SQL is parameterized.** Every `db.prepare()` in all four route files and `imports.js` uses `?` placeholders. Dynamic UPDATE builders (`updates.push('field = ?')`) use allowlisted field arrays, not user input. No SQL injection surface. ✅

**Journal entry balance is correct.** Double-entry rules are correctly implemented for both expense (debit category, credit source) and income (debit source, credit category). The `absAmount` ensures debit = credit. ✅

**Dedupe is robust.** `sha256(date|amount.toFixed(2)|description|account_id)` is a strong deduplication key. The `UNIQUE` constraint on `dedupe_hash` is the database-layer backstop. Preview shows per-row `dedupe_status`. Re-import skips duplicates and returns accurate counts. ✅

**Route ordering is correct.** `/stats/vendor-manual-counts` and `/bulk-categorize` are declared before `/:id` so they don't collide. ✅ (This was a gotcha in Phase A; Cinder remembered it.)

**Multer configuration is clean.** 5MB limit, memory storage, csv/pdf mime-type filter. No temp files written to disk. ✅

**Foreign key validation on source accounts (`asset` OR `liability`) is correct.** CC accounts are `liability` (money owed). Allowing liability accounts as import sources correctly handles Chase CC as a source of expenses. ✅

**Source-mapping UNIQUE constraint duplication guard returns 409 `DUPLICATE`.** Clean error for the UI. ✅

**The `api.js` separation is maintained.** `uploadFile()` helper uses FormData correctly. All 14 new API methods follow the existing pattern. ✅

**Vendor rule retroactive apply uses parameterized LIKE with proper escape.** `LIKE ? ESCAPE '\\'` with `%${pattern.replace(/[%_\\]/g, '\\$&')}%`. Correct escaping for LIKE metacharacters. ✅

**`better-sqlite3` nested transactions work correctly.** Confirmed via code execution — savepoints allow `categorizeTransaction` (which opens its own `db.transaction()`) to be called from within another outer `db.transaction()` without error. ✅

**Keyboard shortcuts are implemented correctly for j/k, 1-9, e, s, ?/Esc.** The `r` key correctly opens the rule modal. Only the button (C-S1) and Enter (C-S2) are broken. ✅

---

## Recommendation

**Fix C-B1, C-B2, C-S1, C-S3 before Echo QA. Fix C-S4 in the same pass (1-liner).**

Priority order:
1. **C-B2** (sign convention naming): Fix `paypal.js`, `venmo.js`, `ImportCSV.jsx`. ~3 lines.
2. **C-B1** (bulk-categorize double UPDATE): Remove the redundant outer UPDATE in `transactions.js`. ~5 lines.
3. **C-S3** (restore + re-categorize creates orphaned journal entries): Add a guard in `categorizeTransaction` to check for an existing journal entry before creating a second. ~6 lines.
4. **C-S1** (Rule button fires wrong action): Pass `onOpenRule` callback from parent to `TxnDetail` and wire the button. ~10 lines.
5. **C-S4** (dead code + safeIntegers side effect): Remove lines 288-289. ~2 lines.
6. **C-S2** (Enter is a no-op): Wire Enter to `categorize(pickerValue)` if picker has a value. ~5 lines. (Can be done as a follow-up since 1-9 covers the common workflow.)

DEBT items C-D1 through C-D8 are fine to defer to Phase D or natural phase. C-D4 (refactor `categorizeTransaction` to a shared service) is recommended before Phase D starts, since Phase D (Schedule C export) will need to read journal entries and Phase F (balance sheet) will need to understand the full journal.

**Do not hold Echo QA for DEBT items.** After the B-series and S-series fixes above, spawn Echo.

---

*Review complete.*
*Path: `/Users/colonelhoracegentleman/clawd/projects/accounting-app/WREN_REVIEW_C.md`*
