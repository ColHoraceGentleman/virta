# Wren Review — Virta Books v2 Phase 1+2 Build

**Commit:** `2f48417` on `main`
**Reviewer:** Wren
**Verdict: FAIL — 1 BLOCKER (posting-logic correctness bug affects Liability + Equity), plus 1 SIGNIFICANT spec violation and supporting SIGNIFICANT/NIT issues. Do not advance to Echo until the BLOCKER is fixed.**

The Expense/Income posting logic is solid and every test I ran against it (39 unit + 15 API + my own adversarial cases) passed. But the sign convention is **inverted for Liability and Equity accounts** — the two credit-normal account types where the D64 helper copy describes a *decrease-oriented* positive ("paid it down," "took money out") rather than an *increase-oriented* positive (like Income's "you earned this"). Cinder's `journalService.js` treats all credit-normal types identically, which is correct for Income but wrong for Liability and Equity. Every "pay down my credit card" or "owner draw" entry currently posts backwards.

---

## BLOCKER

### 🔴 BLOCKER-1 — Sign convention is inverted for Liability and Equity account types

**File:** `server/services/journalService.js`, lines ~131–142 (categorySide computation)

```js
const normalBalance = normalBalanceOf(typeLower);
...
const categoryGoesUp = numericAmount > 0;
const categorySide =
  (normalBalance === 'debit' && categoryGoesUp) ||
  (normalBalance === 'credit' && !categoryGoesUp)
    ? 'debit'
    : 'credit';
```

This treats **all** credit-normal types (`liability`, `equity`, `income`) the same way: positive amount → credit the category, negative → debit. That's correct for **Income** (D64: "Positive = You earned this much" — an increase, and Income's normal-credit side is the "up" direction, so credit-on-increase is right).

It is **backwards for Liability and Equity**, per D64's own copy:

- **Liability** — "Positive = You paid it down. Negative = You took on more debt."
  Paying down debt **decreases** the liability balance. A liability's normal balance is credit, so a decrease is a **debit**. But the code credits the category on positive amounts — the opposite.
- **Equity** — "Positive = Owner took money out. Negative = Owner put money in."
  An owner draw **decreases** equity. Equity's normal balance is credit, so a decrease is a **debit**. The code credits the category on positive amounts — the opposite.

I verified this directly against the running service (not just reading the code):

```
Scenario: "Pay down credit card $100" — type=liability, amount=+100
Expected: liability account DEBITED $100 (balance decreases)
Actual:   liability account CREDITED $100 (balance increases — the entry
          records the user going FURTHER into debt, not paying it down)

Scenario: "Owner draw $250" — type=equity, amount=+250 (D64: positive = took money out)
Expected: equity account DEBITED $250 (equity decreases — owner took money out)
Actual:   equity account CREDITED $250 (equity increases — as if the owner
          put money IN, not took it out)

Scenario: "Took on $75 more debt" — type=liability, amount=-75 (D64: negative = took on more debt)
Expected: liability account CREDITED $75 (balance increases)
Actual:   liability account DEBITED $75 (balance decreases — backwards)

Scenario: "Owner put in $500" — type=equity, amount=-500 (D64: negative = owner put money in)
Expected: equity account CREDITED $500 (equity increases)
Actual:   equity account DEBITED $500 (equity decreases — backwards)
```

Every one of these is inverted from what D64's helper copy promises the user. The double-entry invariant (debit total = credit total) still holds — because the matched-with side is flipped consistently — so the entry is internally "balanced," but it's **balanced in the wrong direction**. Books would show liabilities growing when the user pays them down, and equity growing when the owner takes a draw. This corrupts the balance sheet from the very first manual entry against a Liability or Equity account.

**Why the tests didn't catch it:** `test-gl-phase1-2.mjs` Test 4 and Test 5 assert `cat.credit === 100` (liability) and `cat.credit === 50` (equity) for **positive** amounts — but those assertions encode the *bug itself* as the expected behavior. The test was written against the implementation, not against D63/D64. Compare Test 4's own comment: `// +liability → credit category, debit matched (asset)` — that comment describes what the code does, not what D64 says it should do. Nobody cross-checked the assertion against the wireframe's canonical example (`WIREFRAMES.html` line 294: `Owner draw = amount: -250`, i.e., negative for a draw — the exact opposite polarity of what this build's Test 5 asserts for a draw).

**Fix:** For Liability and Equity, "positive = went down" (debit on increase-side normal-credit... no — the actual correct mapping is: for these two types only, flip the polarity relative to Income:

```js
// Income: positive (earned = up) → credit (matches normal-credit "up" direction)
// Liability: positive (paid down = down) → debit (opposite of normal-credit "up")
// Equity:   positive (drew out = down) → debit (opposite of normal-credit "up")
```

The cleanest fix is a per-type "polarity" map rather than a blanket normal-balance rule:

```js
const CATEGORY_POLARITY = {
  asset:     'up_is_debit',    // normal-debit, positive = up
  expense:   'up_is_debit',    // normal-debit, positive = up
  income:    'up_is_credit',   // normal-credit, positive = up (earned)
  liability: 'down_is_debit',  // normal-credit, positive = DOWN (paid down)
  equity:    'down_is_debit',  // normal-credit, positive = DOWN (drew out)
};
```

Re-derive `categorySide` from this table instead of the blanket normal-balance check, and fix the two inverted unit tests (Test 4, Test 5) to assert the corrected direction. Add explicit adversarial cases for negative Liability/Equity amounts too (the current suite doesn't cover any negative case for those two types).

**Blast radius:** Affects every future Liability and Equity manual entry (credit card paydowns, owner draws/contributions, loan payments). Income and Expense/Asset postings are unaffected and correct. This is exactly the kind of thing that quietly wrecks a balance sheet — it will not throw an error, it will just be wrong, and it compounds every time someone posts against those two types.

---

## SIGNIFICANT

### 🟡 SIG-1 — "Save and new" resets Type and Date, violating D71

**File:** `client/src/books/ManualEntryModal.jsx`, `resetForm()`, lines 121–140

D71 is explicit: Save and new "**keeps Type and Date at their current values**" — the whole point is fast sequential entry (e.g., logging five Office Supplies expenses in a row without re-picking Type/Date each time). The wireframe's canonical `__jeSave(true)` handler (`WIREFRAMES.html` ~1169–1183) only clears `je-change`, `je-name`, `je-desc`, `je-other`, `je-note` — it never touches Type or Date.

Cinder's `resetForm()` does this instead:

```js
function resetForm() {
  setType('Expense');        // ← resets Type (spec says keep it)
  setDate(todayISO());       // ← resets Date to today (spec says keep it)
  setName('');
  setAmount('');
  ...
}
```

This is a straightforward, testable spec violation with zero test coverage — neither the 39-assertion unit suite nor the 15-assertion API smoke test exercises the client-side reset behavior at all (they can't; it's a pure React state concern with no server round-trip to assert against). No Playwright/e2e test covers it either, despite the TASK brief explicitly calling for "Playwright e2e: full manual-entry flow."

**Fix:** Don't reset `type` or `date` in `resetForm()`. Clear everything else as-is.

### 🟡 SIG-2 — `account_balances` snapshot goes stale on backdated entries and deletes

**File:** `server/services/journalService.js`, lines 233–249 (balance upsert), and `server/routes/books/journal.js` DELETE handler.

The `account_balances` table stores one row per `(account_id, as_of_date)` representing the *cumulative* balance as of that date. When a new entry posts, the code only recomputes the snapshot for `txn_date` — the date of the new entry. I verified this directly:

```
1. Post +$100 expense on 2026-05-15 → snapshot @05-15 = 100 (correct)
2. Post +$50 expense (same account) on 2026-05-01 (an earlier date, posted second)
   → snapshot @05-01 = 50 (correct)
   → snapshot @05-15 is STILL 100 (should now be 150 — it's stale)
```

Any account with a snapshot at a *later* date than a newly-backdated entry is now wrong until something else happens to touch that later date again. Since nothing in Phase 1+2 reads `account_balances` yet (grep confirms no consumer), this is currently latent — but the table exists specifically so Phase 5+ Reports can read cached balances instead of summing `journal_lines` every time, and whoever builds that Phase 5 consumer will inherit silently-wrong numbers for any account that ever received a backdated entry.

Same issue on delete: I posted an entry, confirmed its snapshot, then deleted the `journal_entries` row (via the same DELETE endpoint code) and the leftover snapshot value did **not** roll back — it kept showing the balance from before the delete.

**Fix:** Either (a) recompute snapshots for *all* dates ≥ the affected `txn_date` for both touched accounts (expensive but correct), or (b) don't materialize dated snapshots at all in Phase 1+2 — just store `account_balances` as one row per account (no `as_of_date`) recomputed fully on every write, and defer the dated-snapshot optimization to whichever phase actually consumes it, with a design that accounts for backdating and deletes up front. Given the comment in the code says "Phase 5+ Reports will do incremental," I'd flag this for Rusty: is a known-stale cache better than no cache here, or does it need a fix now before it's load-bearing?

### 🟡 SIG-3 — DELETE endpoint has no audit trail and is a live, unauthenticated admin backdoor

**File:** `server/routes/books/journal.js`, lines 108–116; `server/db.js` audit_log CHECK constraint includes `'deleted'` as a valid event.

D66 says: "Edits and deletes on manual entries are also audited." The DELETE handler does neither — it just runs `DELETE FROM journal_entries WHERE id = ?` with no audit_log row written, despite the schema explicitly supporting `event='deleted'`. The route comment ("Used by the demo cleanup + future admin tools") suggests this was scoped as dev-only, and it's correctly *not* wired into the client (`api.js` has no `deleteJournalEntry` call) — so it's not reachable from the UI today. But it is a live, unauthenticated, unaudited hard-delete endpoint on a running server, and there's no auth middleware anywhere in this codebase to gate it (confirmed via grep — no `requireAuth`/session checks in any books route). If this ships to anything beyond localhost, it's a data-integrity and audit-trail hole. At minimum it should write the audit row now (cheap, and matches the schema's own intent) so it's not forgotten when "future admin tools" arrive.

---

## NITs

### 🟢 NIT-1 — Dead `'manual_entry'` source filter value
`journalService.js` line 355 filters `WHERE je.source IN ('manual_entry','manual','transaction_import')`, but `'manual_entry'` is not a valid CHECK-constraint value (the enum only allows `'transaction_import' | 'manual' | 'invoice_payment'`) and nothing ever writes it. Disclosed by Cinder in the commit message as an intentional tradeoff (reused `'manual'` to avoid a CHECK rebuild) — harmless, but the dead enum branch should be deleted rather than left in for the next person to puzzle over.

### 🟢 NIT-2 — `journal_entries.description` gets a synthetic fallback that leaks into the GL
When the user leaves Description blank, the server inserts `` `Manual entry: ${category.name}` `` instead of NULL/empty (`journalService.js` line 216). This then renders directly in the GL table's Description column, which the UI treats as if it were user-authored ("Manual entry: Software Subscriptions" shows up as a real description string next to genuinely user-typed descriptions from other rows). Minor UX inconsistency — not wrong, just worth a product decision on whether the GL should distinguish "no description" from "auto-generated description."

### 🟢 NIT-3 — 500 instead of 400 for "account not found" validation errors
`journalService.js` throws plain `Error('Category account not found')` / `Error('Matched-with account not found')` for a bad/stale account id. The route's `isValidation` regex (`journal.js` line 45) doesn't match those messages (no "required|invalid|unknown|must be|..." substring), so they fall through to a 500 `SERVER_ERROR` instead of a 400 `VALIDATION_ERROR`. This is a client-supplied-bad-id case (e.g., stale dropdown after an account was deleted), which is squarely a validation error, not a server fault. Confirmed live: `POST .../entries` with a bogus `category_account_id` returns HTTP 500. Cheap fix — either widen the regex or throw a typed validation error class.

### 🟢 NIT-4 — GL filter bar cap wording says "client-side" but filtering is actually server-side
The Transactions page comment and Cinder's demo notes both say filters are "client-side-of-the-API," but `listEntries()` does the date/category/name filtering in SQL (`WHERE` clauses) server-side, with the 500-row cap also enforced server-side (verified: `?limit=99999` returns capped at 500). This matches the TASK brief's actual intent ("Filters apply client-side. No server-side filtering in v1" was the *original* ask, but the build correctly did it server-side instead, which is the better call for a growing GL — just flag that the comments are describing the wrong architecture, not the wrong behavior). Not a bug; just a stale/misleading comment.

---

## What passed (verified, not just read)

- ✅ **Balanced-entry guarantee**: every entry I posted, across all 5 account types and both signs, had `sum(debit) === sum(credit)`. The invariant holds structurally even where the direction is wrong (BLOCKER-1) — Cinder's "assert before commit" design is sound, it just needed the right polarity table feeding it.
- ✅ **Expense sign convention** (positive = debit category / credit matched; negative = inverse) — correct in all cases I tried, including negative "refund" amounts.
- ✅ **Income sign convention** (positive = credit category / debit matched; negative = inverse for reversals) — correct.
- ✅ **Zero-amount rejection** — `amount: 0` and `amount: 0.004` both rejected with `VALIDATION_ERROR`, live-tested via both the unit suite and a direct API call.
- ✅ **Same Category + Matched-with rejected** — 400 `VALIDATION_ERROR`, both server-side and mirrored client-side.
- ✅ **Type/Category mismatch rejected** — picking `type=income` with an expense-typed `category_account_id` is rejected.
- ✅ **Audit row on create**: `before_json = NULL`, `after_json` parses as JSON with both lines + entry snapshot, `summary` is a readable sentence. Confirmed for all 5 test-suite entries.
- ✅ **Foreign keys enforced**: attempted an INSERT with a bogus `category_account_id` directly against the DB with `foreign_keys=ON` — correctly rejected at the SQLite layer, independent of the app-layer check.
- ✅ **SQL injection**: `name_q` filter uses parameterized `LIKE` — tried a classic `' OR 1=1--` payload against `name_q`, returned zero rows (no injection, no crash).
- ✅ **Migration idempotency**: booted the DB module twice in the same session; second boot is a clean no-op (all `ALTER TABLE`/`CREATE TABLE IF NOT EXISTS` guards work as intended). No errors, no duplicate seed rows.
- ✅ **No data loss**: `accounts=29`, `transactions=11` before/after all my testing — matches Cinder's disclosed baseline exactly. All schema changes are additive (`ALTER TABLE ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`); no `DROP`/rebuild touched pre-existing rows.
- ✅ **Filter API correctness**: date range (inclusive both ends), category_id (either side), name_q (case-insensitive substring) all verified against live entries, including the 500-row cap enforcement.
- ✅ **D71 button order**: Save and new / Cancel / Save(primary), left-to-right, matches the wireframe exactly.
- ✅ **D70 Sage warning**: token list matches the spec exactly (`credit card, checking, savings, bank, stripe, paypal, venmo, square, plaid, import`), case-insensitive substring match, re-evaluates on Matched-with change.
- ✅ **D62/R26/R27 modal field layout**: 5 default fields (Date, Type, Category, Name, Amount) + collapsed Description/Notes behind `+ Add X` links + always-visible Matched with — matches spec.
- ✅ **All 39 unit assertions pass** (`test-gl-phase1-2.mjs`), all **15 API smoke assertions pass** (`smoke-phase1-2-api.sh`), and the **wireframe smoke stays 255/255** (unbroken, confirmed I ran it after the rest of my testing).
- ✅ **Index coverage**: `idx_journal_entries_date`, `idx_journal_entries_category` exist for the two most filter-relevant columns. (No index on `name` — acceptable for v1 given `LIKE '%...%'` can't use a B-tree index anyway, and the 500-row cap keeps table scans bounded.)

---

## Recommendations, ordered by severity

1. **(BLOCKER-1)** Fix the Liability/Equity polarity inversion in `journalService.js` before this goes anywhere near Echo or real user data. This is a correctness bug in the core value proposition of the build ("the system converts sign to debit/credit correctly, silently") — right now it's silently wrong for 2 of 5 account types. Rewrite Test 4 and Test 5 in `test-gl-phase1-2.mjs` to assert the *correct* direction (they currently assert the bug), and add negative-amount cases for Liability/Equity, which have zero coverage today.
2. **(SIG-1)** Fix `resetForm()` to leave Type and Date untouched on Save-and-new, per D71. Quick fix, currently zero test coverage — add a lightweight client test or at least a manual QA note for Echo to check explicitly, since neither existing suite can catch this class of bug.
3. **(SIG-2)** Get a decision from Rusty on whether `account_balances` staleness (backdated entries, deletes) needs a fix now or can ship as a documented known-limitation until a Phase 5 consumer actually reads the table. Either way, document the limitation somewhere visible — right now the risk is silent, not flagged.
4. **(SIG-3)** Add an audit_log write to the DELETE handler (event='deleted') — cheap, matches existing schema intent, closes the gap before "future admin tools" show up and assume the audit trail is complete.
5. **(NITs 1-4)** Cosmetic/cleanup — not blocking, batch into the next small PR.

**Recommendation to Rusty:** Do not advance to Echo (QA) until BLOCKER-1 is fixed and re-verified — QA time spent testing Liability/Equity flows against wrong-direction postings would be wasted, and worse, could pass QA if Echo's test scenarios happen to only check the balance invariant (which holds) rather than the *direction* (which is wrong). Once BLOCKER-1 and SIG-1 are fixed, this is a strong build — the architecture, validation, audit logging, and Expense/Income posting logic are all sound, and the test discipline (39+15 assertions, idempotent, self-cleaning) is good practice worth keeping as the pattern for future phases.
