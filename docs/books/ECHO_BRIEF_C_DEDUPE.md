# Echo Brief — Virta Books Phase C Dedupe QA

**Goal:** Verify the dedupe surface of Phase C (`accounting-app`) is correct, end-to-end, against the live DB. Focus on edge cases and semantics. Don't re-review what Wren already verified and Cinder already smoke-tested.

**Read first:**
1. This brief (you're here).
2. `~/clawd/projects/accounting-app/ACCOUNTING-v1.md` §5 (CSV Import Pipeline) and §6 (Categorization Review UI) — for the spec definitions of `near_duplicate_of`, "near-duplicate", dedupe_hash, and the resolution UI.
3. `~/clawd/projects/accounting-app/CINDER_FIXES_C.md` — for context on what was just shipped and what was smoke-tested.
4. `~/clawd/projects/accounting-app/WREN_REVIEW_C.md` — read the BLOCKERs and SIGNIFICANTs sections so you know what's already been confirmed by another reviewer (don't re-litigate).

**Authoritative code paths** (live, in the task-manager repo since the DB is shared):
- Import + dedupe pipeline: `~/clawd/projects/accounting-app/server/routes/books/imports.js`
  - `computeDedupeHash()` ~L47
  - Import candidate building (exact dedupe) ~L230 and ~L392 (two paths: impersonated + non-impersonated)
  - `findNearDuplicates()` ~L491
  - Insert loop that respects `dedupe_status` (transient, in-memory label — *not* a persisted column; the schema only stores `dedupe_hash` + `near_duplicate_of`)
- Resolution endpoint: `~/clawd/projects/accounting-app/server/routes/books/transactions.js`
  - `POST /api/v1/books/transactions/:id/resolve-duplicate` ~L225-296 (the three actions: `keep_both`, `keep_this`, `keep_original`)
  - Near-duplicate info enrichment for the UI ~L117-145 and ~L175-195
- Spec definitions: `~/clawd/projects/accounting-app/ACCOUNTING-v1.md` §5 + §6

**Live state right now (verified 2026-07-01):**
- Service on port 3001, phase C. DB at `~/clawd/projects/task-manager/data/tasks.db`.
- 13 transactions, 0 currently have `near_duplicate_of` set, 1 vendor rule, 2 source mappings. 4 pre-Cinder-fix backups in `data/backups/`. Service healthy.
- Schema has `dedupe_hash UNIQUE` and `near_duplicate_of TEXT REFERENCES transactions(id)` with an index. **No persisted `dedupe_status` column** — that's intentional, only the hash pointer survives.

---

## Verification checklist (in priority order)

### 1. `keep_this` FK clearing semantics — the question I want answered

Read `transactions.js` lines ~257-273 (the `keep_this` branch).

Cinder's claim: "Before deleting the original, clear `near_duplicate_of` on any *other* transactions that point at the original, then null `near_duplicate_of` on this row, then delete the original + its journal entries. Wrapped in `db.transaction()` so it's atomic."

Verify three things:
- **A.** Is the SQL actually correct? (Cinder's report claims it is. Re-read the code with fresh eyes.)
- **B.** Is this the *right* semantic, or would "re-point the other near-dupes at the surviving row" be better? Think about: if the user resolves A→B as `keep_this` (keep B, drop A), and C was also flagged as near-dup of A, what should happen to C? My read is "clear to NULL" (the user already made a decision, leave C for them to re-judge) but I want your opinion.
- **C.** Are there missing cascade paths? E.g., if the original had `category_account_id` set and a journal entry exists, and there are *multiple* journal entries on the original (one from import, one from a manual re-categorize), do the right ones get deleted? The current code deletes `source = 'transaction_import' AND source_id = ?`. Confirm this is exhaustive.

### 2. Exact-dedupe hash coverage

`computeDedupeHash(txn_date, amount, description, accountId)`.

- Check the hash includes **just enough** to catch "same statement uploaded twice" and "overlapping CSV exports" but **not so much** that the same purchase imported from a different source (PayPal vs. bank CSV) fails to match when it should.
- Specifically: does the hash *include* `account_id`? If yes, that's correct — a transaction in two accounts shouldn't match (different cards, same merchant). If no, that's a bug.
- Does it normalize the description? If two CSVs export "STARBUCKS #1234" vs. "Starbucks Store 1234" the hash will differ — verify that's the intended behavior (probably yes, since exact dedupe is strict; near-dup catches the fuzzy case).

### 3. Near-dup match window — ±3 days

Read `findNearDuplicates` (~L491). 

- The window is `NEAR_DUP_DAYS = 3` and uses `JULIANDAY` math.
- Edge cases worth probing:
  - Month boundaries (Jan 30 vs. Feb 2 — does the math break?)
  - Time-zone-naive dates — txn_date is `YYYY-MM-DD` strings, so should be safe, but verify.
  - Amount comparison uses `ROUND(ABS(amount), 2)` — verify this handles the PayPal/Venmo sign-convention fix. (Cinder smoke-tested sign convention in the import path, but the near-dup match might still match a debit against a credit because it `ABS`es both sides. Probably correct for "is this the same purchase?" but worth flagging if "payment to PayPal" + "PayPal transfer to bank" with the same absolute amount could falsely match across the import window.)

### 4. The two import paths (impersonated + non-impersonated)

There are two near-identical import code paths in `imports.js` (~L230 and ~L392). They use the same `computeDedupeHash` and `findNearDuplicates` — but they may drift over time.

- Verify both paths call the same functions with the same arguments.
- Check the impersonated path (`suggested_account_id` override) — does the account_id used in the hash match the *final* account the row lands in, or the originally-suggested one? If the former, cross-account imports work. If the latter, there's a subtle bug.

### 5. UI-side check (lightweight)

`client/src/components/Categorize.jsx` (or wherever the resolve-duplicate buttons live — find it). Confirm:
- The three buttons fire the right `POST /:id/resolve-duplicate` action (Cinder fixed a bug where the "Rule" button was firing the wrong action; just confirm the buttons now resolve to `keep_both` / `keep_this` / `keep_original` correctly).
- Pressing Enter doesn't double-fire (Cinder fixed an Enter no-op; verify it's now Enter-as-confirm or Enter-as-nothing, but not double-submit).
- The near-dup banner shows the original transaction's date + amount + description clearly.

If you can't find the component, say so — don't guess.

### 6. Live re-test (rebuild the dedupe scenario)

Run a smoke test against the live DB (port 3001) to validate the dedupe path end-to-end:

1. Pick an existing transaction in the live DB (any of the 13 is fine — they're test data).
2. Import the same CSV file twice (or a near-identical one) and verify the second import reports `duplicatesSkipped: N` where N matches the overlap.
3. Re-import after adding a 1-day-shifted row from the same vendor with same amount; verify it lands with `near_duplicate_of` set, and that the UI shows the banner.
4. Hit the resolve-duplicate endpoint with each of the three actions on a near-dup pair; verify the response and that the DB state matches (use sqlite3 to spot-check after).

**Important:** Echo should NOT mutate real test data destructively without confirmation. Use `suggested_account_id` of a dedicated test account if one exists, or just verify the FK-clearing behavior using a synthetic row pair that's safe to delete.

---

## What you DON'T need to do

- Don't re-verify the bulk-categorize fix (commit `9fa3488`) — smoke-tested, commit history is the proof.
- Don't re-verify the PayPal/Venmo sign convention fix — same.
- Don't re-verify Rule button or Enter no-op (point 5 is just a sanity read, not a deep dive).
- Don't rewrite the schema. If you find a real schema issue, document it as a finding, don't fix it.
- Don't write *new* features. Only verify what's there.

## Deliverable

A single `ECHO_REPORT_C_DEDUPE.md` at `~/clawd/projects/accounting-app/` with:

1. **Verdict per checklist item**: PASS / FAIL / NEEDS-DECISION with one paragraph of evidence. For FAIL or NEEDS-DECISION, name the file:line and propose a fix.
2. **Live re-test transcript** (curl + sqlite3 output, kept tight).
3. **Overall recommendation**: SHIP / FIX-FIRST / NEEDS-DISCUSSION.

Append to or replace? Your call. Probably append (we want the audit trail).

## Constraints

- Read-only when reasonable. Don't rewrite working code; if a fix is needed, list it.
- Don't promote yourself to Sonnet or change your model. Use `minimax/MiniMax-M3` primary as configured.
- Estimated time: 30-45 min if you stay focused.

Status: I'll wait for your completion event. Push back to me when done.
