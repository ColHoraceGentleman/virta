# Wren Re-Review — Virta Books v2 Phase 1+2 Fixes

**Fix commit:** `2a97193` on `main` (parent: `2f48417`, my original review commit)
**Reviewer:** Wren
**Verdict: PASS — ADVANCE TO ECHO.** All 1 BLOCKER + 3 SIGNIFICANTs are fixed and re-verified live. All 4 NITs addressed or acceptably deferred. No new blocking or significant findings.

---

## Per-Finding Status

| Finding | Status |
|---|---|
| BLOCKER-1 — Liability/Equity polarity inversion | **FIXED** |
| SIG-1 — "Save and new" reset Type/Date (D71) | **FIXED** |
| SIG-2 — `account_balances` staleness | **FIXED** (decision: (b)-adjacent — writes disabled entirely, documented) |
| SIG-3 — DELETE has no audit trail | **FIXED** |
| NIT-1 — dead `'manual_entry'` enum branch | **DEFERRED** (acceptable, per task brief) |
| NIT-2 — synthetic description fallback | **FIXED** |
| NIT-3 — account-not-found returns 400 not 500 | **FIXED** |
| NIT-4 — stale "client-side" comment | **FIXED** |
| New — DELETE endpoint unauthenticated | **NOTED, pre-existing, not blocking** |

---

## BLOCKER-1 — FIXED

**Fix:** `journalService.js` replaced the blanket normal-balance rule with a per-type `CATEGORY_POLARITY` map (`up_is_debit` / `up_is_credit` / `down_is_debit`), correctly distinguishing Income's "positive = up = credit" from Liability/Equity's "positive = down = debit."

I read the new logic line by line. The map:

```js
const CATEGORY_POLARITY = {
  asset:     'up_is_debit',
  expense:   'up_is_debit',
  income:    'up_is_credit',
  liability: 'down_is_debit',
  equity:    'down_is_debit',
};
```

...and the derivation (`categorySide = amountIsPositive ? 'debit' : 'credit'` for `down_is_debit`) is exactly the fix I proposed in the original review. Matches D64 semantics for all 5 types.

### Live re-verification (all 4 scenarios, posted through the running API on `localhost:3001`)

**Scenario 1 — Pay down credit card $100 (liability, +100). Expected: liability DEBIT, asset CREDIT.**
```json
"lines": [
  {"account_code":"2000","account_name":"Business Credit Card","account_type":"liability","debit":100,"credit":0},
  {"account_code":"1000","account_name":"Account RENAME","account_type":"asset","debit":0,"credit":100}
]
```
✅ Liability debited, asset credited. Correct — matches "paid it down" (liability balance decreases).

**Scenario 2 — Owner draw $250 (equity, +250). Expected: equity DEBIT, asset CREDIT.**
```json
"lines": [
  {"account_code":"3000","account_name":"Owner’s Equity","account_type":"equity","debit":250,"credit":0},
  {"account_code":"1000","account_name":"Account RENAME","account_type":"asset","debit":0,"credit":250}
]
```
✅ Equity debited, asset credited. Correct — matches "owner took money out" (equity decreases).

**Scenario 3 — Took on $75 more debt (liability, -75). Expected: liability CREDIT, asset DEBIT.**
```json
"lines": [
  {"account_code":"2000","account_name":"Business Credit Card","account_type":"liability","debit":0,"credit":75},
  {"account_code":"1000","account_name":"Account RENAME","account_type":"asset","debit":75,"credit":0}
]
```
✅ Liability credited, asset debited. Correct — matches "took on more debt" (liability balance increases).

**Scenario 4 — Owner put in $500 (equity, -500). Expected: equity CREDIT, asset DEBIT.**
```json
"lines": [
  {"account_code":"3000","account_name":"Owner’s Equity","account_type":"equity","debit":0,"credit":500},
  {"account_code":"1000","account_name":"Account RENAME","account_type":"asset","debit":500,"credit":0}
]
```
✅ Equity credited, asset debited. Correct — matches "owner put money in" (equity increases).

**All 4/4 scenarios pass with the correct direction.** Test entries were deleted after verification via the same DELETE endpoint (see SIG-3 section — audit rows confirmed written for each).

### Unit test coverage (Tests 4/4b/5/5b)

Ran `node server/scripts/test-gl-phase1-2.mjs`:

```
✅ Test 4: +liability (paid down) → debit category, credit matched (asset)
✅ Test 5: +equity (draw) → debit equity, credit matched (asset)
✅ Test 4b: -liability (took on more debt) → credit category, debit matched (asset)
✅ Test 5b: -equity (contribution) → credit equity, debit matched (asset)

46 passed, 0 failed
```

Test 4/5 now assert the corrected direction (previously encoded the bug itself, per my original finding). Test 4b/5b are new and cover the negative-amount adversarial cases that had zero coverage before — closing the exact gap I flagged. Test assertions match the live API results above exactly (positive liability → debit; negative liability → credit; same pattern for equity).

**BLOCKER-1 verdict: FIXED. No residual concerns.**

---

## SIG-1 — FIXED

**Fix:** `resetForm()` in `ManualEntryModal.jsx` no longer calls `setType('Expense')` / `setDate(todayISO())`. Confirmed by reading the diff — those two lines are removed; the current-`type` value is now used to re-derive the default category (`const t = type.toLowerCase()`) instead of hardcoding `'expense'`.

**Parent-side bug Cinder caught:** `Transactions.jsx`'s `onPosted` callback was unconditionally closing the modal (`() => { setShowManualEntry(false); loadEntries(); }`) regardless of which button was clicked, which would have silently defeated the SIG-1 fix at the UI level even with `resetForm()` correct. Fixed by threading `{ keepOpen }` through `onPosted(entry, { keepOpen })` from the modal, and the parent now checks it: `if (!keepOpen) setShowManualEntry(false);`. This is a legitimate catch — good instinct to write an e2e test that exercises the real DOM instead of trusting the component in isolation.

I confirmed the built `client/dist` bundle actually contains this fix (`grep -c keepOpen client/dist/assets/*.js` → 1 match, present), and the bundle's mtime (15:28:44) is after both source file mtimes (15:28:35, 15:28:39), so the e2e run below is testing the fixed code, not a stale build.

### e2e run

```
node server/scripts/e2e/sig1-save-and-new.mjs
```

```
[SIG1] PASS type-set Type=Income (DOM value: Income)
[SIG1] PASS date-set Date=2026-06-01 (DOM value: 2026-06-01)
[SIG1] PASS click-save-and-new clicked
[SIG1] PASS post-landed entry 090204da posted with date=2026-06-01, name="SIG1 Test Customer", amount=$123.45
[SIG1] PASS modal-still-open dialog remained visible after Save and new
[SIG1] PASS type-preserved Type still "Income" after Save and new (was "Income")
[SIG1] PASS date-preserved Date still "2026-06-01" after Save and new (was "2026-06-01")
[SIG1] PASS name-cleared / amount-cleared / desc-cleared / notes-cleared
[SIG1] PASS desc-collapsed / notes-collapsed
[SIG1] PASS date-focused Date field is focused for fast next-entry typing (D71)
[SIG1] PASS zero-console-errors
[SIG1] cleanup: deleted entry 090204daa2101add24cd2c747bc90273 status 200
[SIG1] done. PASS: 18 FAIL: 0
```

18/18 assertions pass, including the core D71 assertion (Type=Income, Date=2026-06-01 both survive "Save and new") and the full field-clearing/collapse behavior. Test cleans up its own entry afterward (confirmed 200 on delete).

**SIG-1 verdict: FIXED. No residual concerns.**

---

## SIG-2 — FIXED (decision implemented + documented)

Cinder's decision was **(b)-adjacent**: rather than keeping the dated-snapshot design and recomputing forward, or reducing to one-row-per-account, the fix simply **stops writing to `account_balances` entirely** from `createEntry()`. The table stays in the schema (no migration needed) but no code path inserts into it anymore in Phase 1+2. Balances are derivable at query time by summing `journal_lines` (the actual source of truth), which sidesteps the staleness bug altogether rather than patching around it.

I read the replacement comment block in `journalService.js` (where the old upsert loop used to be):

> "Since Phase 1+2 has no consumer for account_balances, the decision (recorded here so Phase 5 doesn't reintroduce the bug) is to NOT write any snapshots from this service... Phase 5 should design its own cache when there's an actual consumer, accounting for backdating + deletes up front."

This is a code-level change (not just "fix it later" with no diff), documented in-line with rationale, and it eliminates the exact staleness class I found (backdated entries, deletes) by construction — there's nothing to go stale if nothing is written.

**Confirmed no Phase 1+2 consumer reads `account_balances`:**

```
grep -rn "account_balances" server/ client/src/
```

Every hit is either the table definition/index (`db.js`), the removal comment (`journalService.js`), or test assertions that check the table stays *empty* (`test-gl-phase1-2.mjs`). Zero read consumers anywhere in the app. This matches acceptable option (a "defer with no live consumer" pattern) from the task brief — safe to ship.

Live-confirmed via unit test: `account_balances: no stale snapshot written for A6010@TX_DATE (SIG-2 decision)` passes after 7 entries posted in the test run.

**SIG-2 verdict: FIXED. Clean resolution — better than a patch-the-staleness fix, since it removes the failure mode instead of narrowing it.**

---

## SIG-3 — FIXED

**Fix:** DELETE logic moved into `journalService.deleteEntry(id)`. It captures a full pre-delete snapshot (`entry` + `lines`, joined with account codes/names/types) into `before_json`, then in a single transaction deletes the `journal_entries` row and inserts an `audit_log` row with `event='deleted'`, `after_json=NULL`. The route handler (`journal.js`) now delegates to this function and maps a "not found" error to 404.

### Unit test confirmation

```
✅ SIG-3 prep: entry e4b exists before delete
✅ SIG-3: journal_entries row removed by deleteEntry()
✅ SIG-3: audit_log row written for delete (event=deleted)
✅ SIG-3: deleted audit row has before_json with entry + lines
✅ SIG-3: deleted audit row summary starts with "Deleted journal entry"
✅ SIG-3: deleted audit row has after_json = NULL
```

### Smoke test confirmation (`bash server/scripts/smoke-phase1-2-api.sh`)

```
✅ SIG-3 prep: created entry for delete-audit test  · 1c2a8373bfc7f449f31e4ff1a4d99b79
✅ SIG-3: DELETE wrote audit row with event=deleted  · events=deleted,created
```

I also independently exercised the DELETE endpoint against the 4 BLOCKER-1 test entries I created above and got clean `{"data":{"success":true,...}}` 200 responses for all four — the audit trail machinery is live, not just test-harness-only.

**SIG-3 verdict: FIXED. No residual concerns.**

---

## NITs

- **NIT-1** (dead `'manual_entry'` enum branch) — **DEFERRED**, as disclosed. Confirmed the `listEntries()` filter is now `WHERE je.source IN ('manual','transaction_import')` — wait, actually checking the diff: the dead `'manual_entry'` value *was* removed from this filter in this same commit (`je.source IN ('manual','transaction_import')`, down from `('manual_entry','manual','transaction_import')`). Cinder's commit message says NIT-1 is deferred, but the diff shows it landed as a side effect of touching that line. Either way — the dead branch is gone. **Effectively fixed**, contrary to the commit message's own claim of deferral. Harmless either way; noting the discrepancy for accuracy, not as a blocker.
- **NIT-2** (synthetic description fallback) — **FIXED.** Live-verified: posted an entry with no description, got back `"description": ""` (empty string), not `"Manual entry: <category>"`.
- **NIT-3** (account-not-found → 400 not 500) — **FIXED.** Live-verified: `POST .../entries` with a bogus `category_account_id` now returns `HTTP 400 {"error":"Category account not found","code":"VALIDATION_ERROR"}` (previously 500). Also confirmed the DELETE 404 mapping works: deleting a nonexistent id returns `HTTP 404 {"error":"Journal entry not found","code":"NOT_FOUND"}`.
- **NIT-4** (stale "client-side" comment) — **FIXED.** Comment now reads "Filtering is applied SERVER-SIDE in SQL... with a 500-row cap, not in the browser." Accurate.

---

## New Findings

**None blocking.** One clarification worth noting for the record (not a new defect):

- The NIT-1 discrepancy above (commit message says "deferred," diff shows it landed) — purely cosmetic, doesn't affect behavior, not worth a round-trip to Cinder. Flagging for accuracy only.

**Pre-existing condition, flagged by Cinder, not mine to adjudicate:** the DELETE endpoint (and the entire books API) remains unauthenticated. Cinder correctly scoped this as out-of-bounds for a Phase 1+2 fix commit — the whole API has no auth layer by design in v1, this isn't a regression introduced by this patch. Noting for Rusty's awareness per the task brief, but this does not block Echo QA and should not be re-litigated in this review cycle.

---

## Test Suite Summary (all re-run live, this session)

| Suite | Expected | Actual | Result |
|---|---|---|---|
| `node server/scripts/test-gl-phase1-2.mjs` | 46 passed | 46 passed, 0 failed | ✅ |
| `bash server/scripts/smoke-phase1-2-api.sh` | 17 passed | 17 passed, 0 failed | ✅ |
| `node server/scripts/e2e/sig1-save-and-new.mjs` | 18 passed | 18 passed, 0 failed | ✅ |
| `node docs/books/setup-wizard/tests/wf-smoke.mjs` | 255/255 | 255/255 | ✅ unbroken |
| Live BLOCKER-1 scenarios (4x, direct API) | 4/4 correct direction | 4/4 correct | ✅ |
| Live NIT-2 check (blank description) | `""` | `""` | ✅ |
| Live NIT-3 check (bad account_id) | 400 VALIDATION_ERROR | 400 VALIDATION_ERROR | ✅ |
| Live SIG-3 check (DELETE 404 on missing id) | 404 NOT_FOUND | 404 NOT_FOUND | ✅ |

All test data I created during this re-review (4 BLOCKER-1 scenario entries, 1 NIT-2 entry) was deleted via the DELETE endpoint after verification; confirmed zero residual `WREN-*` rows remain via a `name_q=WREN` filter query.

---

## Recommendation

**ADVANCE TO ECHO.**

The BLOCKER is genuinely fixed — I re-derived the fix independently from the diff before running anything, then confirmed all 4 adversarial scenarios live against the running server, and the direction is correct in every case. The polarity map is the right structural fix (not a patch on top of the old logic), the new adversarial unit tests (4b/5b) close the negative-amount coverage gap I flagged, and the fix doesn't just make the tests pass — the underlying accounting logic is now actually correct per D64.

All three SIGNIFICANTs are resolved cleanly: SIG-1's fix is verified via a real e2e test that exercises the DOM (and Cinder's own parent-bug catch shows good review discipline), SIG-2's resolution removes the failure mode rather than narrowing it, and SIG-3 closes the audit gap with proper transactional integrity (delete + audit write happen atomically).

Nothing here needs to bounce back to Cinder. Echo should focus QA time on the full manual-entry flow across all 5 account types (now that the ledger direction is trustworthy) plus the Save-and-new UX flow end to end.
