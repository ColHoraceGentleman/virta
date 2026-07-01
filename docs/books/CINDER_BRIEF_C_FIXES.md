# Phase C Fix Pass — Wren Fixes + Dedupe Upgrade

**Builder:** Cinder 🔥
**Brief prepared:** 2026-06-30
**Based on:** WREN_REVIEW_C.md (6 fixes) + Patrick's dedupe requirements (2026-06-30)

Read WREN_REVIEW_C.md before starting. Every fix below references a finding in that file.

---

## Context

Phase C shipped and is live. The service is healthy (`phase: "C"`, all routes 200). No data corruption yet — C-B2 is latent (no PayPal/Venmo rows in DB). Fix all 6 items in a single pass, then add the two dedupe upgrades.

**Safe restart:** `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager`
**DB backup before touching schema:** `sqlite3 ~/clawd/projects/task-manager/data/tasks.db ".backup '/Users/colonelhoracegentleman/clawd/projects/task-manager/data/backups/tasks-pre-phaseC-fixes-$(date +%s).db'"`

---

## Fix 1 — C-B2: PayPal/Venmo sign convention naming (BLOCKER)

**Files:** `server/parsers/paypal.js`, `server/parsers/venmo.js`, `client/src/books/ImportCSV.jsx`

PayPal/Venmo export positive = inflow (income). The current `CANONICAL_MAPPING.amount_sign_convention` is wrongly set to `'positive_outflow'` which would flip a $100 sale to -$100 in the generic CSV apply path.

**Fix:**
- `paypal.js` and `venmo.js`: change `CANONICAL_MAPPING.amount_sign_convention` from `'positive_outflow'` → `'negative_outflow'`
- `ImportCSV.jsx` line that sets the default sign convention: change `'positive_outflow'` → `'negative_outflow'` for the paypal/venmo case
- `ImportCSV.jsx` UI option labels: remove the `"(PayPal / Venmo)"` parenthetical from `positive_outflow` to avoid the contradiction. Keep labels clean: `"Negative = outflow (standard CC/bank)"` for `negative_outflow`, `"Positive = outflow (some bank exports)"` for `positive_outflow`.

Mirror changes to accounting-app parsers directory.

---

## Fix 2 — C-B1: bulk-categorize redundant outer UPDATE (BLOCKER)

**File:** `server/routes/books/transactions.js`, bulk-categorize endpoint

The outer `db.transaction()` runs its own `UPDATE transactions SET category_account_id = ?, status = 'categorized'` before calling `categorizeTransaction()`, which does the same UPDATE again plus creates the journal entry. Atomically correct today but will silently break if anyone adds a "skip if already categorized" guard to `categorizeTransaction` later.

**Fix:** Remove the redundant outer UPDATE. Let `categorizeTransaction` own the full write. Update the skip guard to check `existing.status === 'categorized' && existing.category_account_id === categoryId`:

```js
// In the bulk-categorize loop:
const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
if (!existing) { skipped++; continue; }
if (existing.status === 'categorized' && existing.category_account_id === categoryId) { skipped++; continue; }
// No outer UPDATE — categorizeTransaction handles everything:
categorizeTransaction(id, categoryId, /*silent=*/true);
updated++;
journalCreated++;
```

---

## Fix 3 — C-S3: restore + re-categorize creates orphaned journal entries (SIGNIFICANT)

**File:** `server/routes/books/transactions.js`, `POST /:id/restore` + `categorizeTransaction()`

If a categorized transaction (journal entry created) is excluded then restored, `restore` sets `status='uncategorized'` but leaves `category_account_id` set. Re-categorizing to a different account then creates a second journal entry without voiding the first.

**Fix — two-part:**

1. In `POST /:id/restore`, also null out `category_account_id`:
```js
UPDATE transactions SET status = 'uncategorized', category_account_id = NULL, updated_at = datetime('now') WHERE id = ?
```
And delete the orphaned journal entries for this transaction:
```js
// Get the entry id(s) linked to this transaction
const entries = db.prepare(`SELECT id FROM journal_entries WHERE source = 'transaction_import' AND source_id = ?`).all(id);
for (const e of entries) {
  db.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(e.id); // journal_lines cascade
}
```
Wrap the UPDATE + DELETEs in a single `db.transaction()`.

2. Add a guard in `categorizeTransaction()` to prevent double journal entries (belt-and-suspenders for any future path that reaches it with an existing entry):
```js
const existingEntry = db.prepare(
  `SELECT id FROM journal_entries WHERE source = 'transaction_import' AND source_id = ?`
).get(transactionId);
if (existingEntry) {
  // Journal entry already exists — just update the transaction row, no new entry.
  db.prepare(`UPDATE transactions SET category_account_id = ?, status = 'categorized', updated_at = datetime('now') WHERE id = ?`)
    .run(categoryAccountId, transactionId);
  return;
}
```

---

## Fix 4 — C-S1: "Rule (r)" button fires wrong action (SIGNIFICANT)

**File:** `client/src/books/Categorization.jsx`

The "Rule (r)" button in TxnDetail calls `onCategorize()` instead of opening the rule-creator modal. The `r` keyboard shortcut works correctly.

**Fix:** Pass an `onOpenRule` callback from the parent Categorization component down to TxnDetail. Wire the button's `onClick` to call `onOpenRule(selected.vendor_normalized)` — same logic as the `r` keydown handler.

If `TxnDetail` is a locally-defined inner component (not imported), just hoist `setRulePrompt` access. If it receives `selected` and `onCategorize` as props today, add `onOpenRule` alongside them.

---

## Fix 5 — C-S2: Enter key is a no-op (SIGNIFICANT)

**File:** `client/src/books/Categorization.jsx`

`Enter` is spec'd (§6) to confirm the selected category + advance to the next transaction. The handler is an empty comment.

**Fix:** In the keydown handler, wire Enter to confirm the current picker selection:
```js
} else if (e.key === 'Enter') {
  if (pickerValue) {
    categorize(pickerValue);
  }
}
```
`pickerValue` is the currently-selected account in the right-pane picker. If no picker value is set, Enter is a no-op (which is acceptable — the user hasn't selected anything to confirm). `pickerValue` needs to be in scope for the keydown handler; if it's local to a child component, lift it to the parent or use a ref.

---

## Fix 6 — C-S4: dead code + safeIntegers side effect (SIGNIFICANT)

**File:** `server/routes/books/imports.js`, line ~288-289

Remove the dead line:
```js
const id = insertStmt.safeIntegers(false).reader ? null : null;
```
The re-fetch on the following lines is the correct ID retrieval. This line is never used and calling `.safeIntegers(false)` mutates the shared prepared statement object.

---

## Dedupe Upgrade 1 — Near-duplicate detection

**Spec:** ACCOUNTING-v1.md §5 "Dedupe (R8)" — confirmed 2026-06-30.

**What it is:** After exact dedupe (hash match → auto-skip), run a secondary check for each new row against existing transactions: same `vendor_normalized` + same `amount.toFixed(2)` + `txn_date` within ±3 days on the same `account_id`. Flag matches as near-duplicate — **do not auto-skip**. The user decides in the Categorization UI.

### Schema change (idempotent migration, DB backup first)

Add `near_duplicate_of TEXT REFERENCES transactions(id)` column to `transactions`:
```js
// In db.js, after Phase C tables, idempotent:
{
  const cols = db.prepare('PRAGMA table_info(transactions)').all().map(c => c.name);
  if (!cols.includes('near_duplicate_of')) {
    db.exec('ALTER TABLE transactions ADD COLUMN near_duplicate_of TEXT REFERENCES transactions(id)');
  }
}
```

### Backend changes

**In `server/routes/books/imports.js`:**

Add a `findNearDuplicates(candidates, accountId)` function:
```js
function findNearDuplicates(candidates, accountId) {
  // For each candidate (not already an exact duplicate), check if a
  // transaction exists with the same vendor_normalized + same amount (to 2dp)
  // + txn_date within ±3 days on the same account.
  const results = [];
  for (const c of candidates) {
    if (c.dedupe_status === 'duplicate') { results.push(c); continue; }
    const existing = db.prepare(`
      SELECT id, txn_date, description, amount
      FROM transactions
      WHERE account_id = ?
        AND vendor_normalized = ?
        AND ROUND(ABS(amount - ?), 2) = 0
        AND ABS(JULIANDAY(txn_date) - JULIANDAY(?)) <= 3
      LIMIT 1
    `).get(accountId, c.vendor_normalized, c.amount, c.txn_date);
    results.push({
      ...c,
      near_duplicate_of: existing ? existing.id : null,
      near_duplicate_info: existing ? {
        id: existing.id,
        txn_date: existing.txn_date,
        description: existing.description,
        amount: existing.amount,
        days_apart: Math.round(Math.abs(
          (new Date(c.txn_date) - new Date(existing.txn_date)) / 86400000
        ))
      } : null
    });
  }
  return results;
}
```

Call `findNearDuplicates` on the candidate list **after** exact dedupe, **before** returning the preview response. Include `near_duplicate_of` and `near_duplicate_info` in each candidate in the response payload.

On `POST /imports/apply`, if a candidate has `near_duplicate_of` set, insert the transaction normally (don't skip) but set `transactions.near_duplicate_of = near_duplicate_of`. The user already saw the warning in the UI and chose to import.

**In `server/routes/books/transactions.js`:**

Add `GET /api/v1/books/transactions/:id/near-duplicate` — returns the existing transaction that this one is a near-duplicate of (or 404 if `near_duplicate_of` is null). Used by the Categorization UI "View original" link.

Add `POST /api/v1/books/transactions/:id/resolve-duplicate` — body: `{ action: 'keep_both' | 'keep_this' | 'keep_original' }`. For `keep_this`: delete the original transaction (and its journal entries). For `keep_original`: delete this transaction (and its journal entries). For `keep_both`: null out `near_duplicate_of` (user confirmed they're different transactions). All wrapped in `db.transaction()`.

### Frontend changes

**In `client/src/books/Categorization.jsx`:**

When a transaction has `near_duplicate_of !== null`, show a yellow warning banner in the right pane:

```
⚠️ Possible duplicate — matches a transaction from [near_duplicate_info.days_apart] day(s) ago
  [Vendor] · [Amount] · [Date]   [View original ↗]

  What would you like to do?
  [Keep both]  [Keep this one]  [Keep original]
```

"View original" opens the existing transaction in a small inline preview (no navigation needed — just show the fields in a sub-panel). The three action buttons call `POST /transactions/:id/resolve-duplicate` with the appropriate action.

The transaction can still be categorized normally regardless of the near-duplicate status. The duplicate-resolution is a separate decision.

---

## Dedupe Upgrade 2 — Re-import source banner + cross-account guard (UX)

### Re-import banner

**In `client/src/books/ImportCSV.jsx`, Step 1 (upload result)**:

After the `/imports` response comes back, if `applied_mapping.source_key` matches a saved mapping that has a `last_used_at` timestamp, show a soft banner:

```
ℹ️ Looks like another Chase CC import — last import from this source was [N] days ago.
   [N] of [total] rows match existing transactions and will be skipped.
```

This is purely informational. Already handled by exact dedupe — this just surfaces it more visibly so she knows the skip count isn't a problem.

### Cross-account guard

**In `client/src/books/ImportCSV.jsx`, Step 2 (account picker)**:

If the detected `source_key` has a memorized `account_id` (R5) and the user selects a different account, show a soft inline warning:

```
⚠️ You previously imported from this source to [Memorized Account].
   Importing to a different account will create transactions in [New Account] instead.
   [Use memorized account]  [Continue with new account]
```

This is advisory only — user can dismiss and proceed. No hard block.

---

## Mirroring requirement

All changes apply to both:
- `~/clawd/projects/accounting-app/` (source-of-truth)
- `~/clawd/projects/task-manager/` (live deploy)

After applying:
1. Back up DB
2. Restart: `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager`
3. Verify: `curl -s http://127.0.0.1:3001/api/v1/books/health` — should return `phase: "C"` still (no phase bump for a fix pass)
4. Verify `near_duplicate_of` column exists: `sqlite3 ~/clawd/projects/task-manager/data/tasks.db "PRAGMA table_info(transactions);" | grep near`
5. Smoke test near-duplicate: insert two transactions with same vendor + amount + dates 2 days apart via API, then POST a candidate row matching them → confirm `near_duplicate_of` is set in the response

---

## Deliverable

Write `CINDER_FIXES_C.md` (same format as `CINDER_FIXES_WREN.md` from Phase B) listing:
- Each fix applied, file, line count delta
- DB backup path
- Smoke test results (near-duplicate detection specifically)
- Any deviations from this brief

Then send completion event to main session.
