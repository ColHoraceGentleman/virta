# WREN REVIEW — Phase E.2: Reconciliation Process Redesign

**Reviewer:** Wren 🔎
**Date:** 2026-07-06
**Scope:** Post-Cinder design-level spot-check per ENGINEERING.md §5.8. Cinder's report: `CINDER_REPORT_E2.md`, verdict SHIP.

---

## 1. TL;DR + Verdict

**NEEDS-FIX.** Two BLOCKERs, both in the mutation-detection/staleness layer — the "load-bearing" part of this phase per the brief's own framing. The frontend rewrite (`Reconcile.jsx`), the rollback atomicity, and the forward-only gate are all solid and match spec exactly. But the staleness *recovery* path described in the spec (§6.6, path (b): "resolve the mutation by editing the offending transaction... Saving clears the staleness flag") **does not exist in the code** — `stale` is set to 1 and never set back to 0 anywhere. And deleting a transaction that's cleared by an active reconciliation (draft or committed) throws a raw, unhandled `FOREIGN KEY constraint failed` 500 instead of firing the mutation hook — meaning the `transaction_deleted` mutation type in the spec's mutation table is currently **unreachable** for any transaction that's ever been cleared.

Both are backend gaps in code that Cinder's brief said was "already on disk, verified rather than written" — he ran a curl lifecycle that happened not to exercise either path (his only mutation test was `amount_changed`, and he never tested delete-of-a-cleared-txn or the resolve-the-mutation recovery flow). This is exactly the kind of gap the three-role discipline exists to catch.

Everything else checked out. Full findings below.

---

## 2. Per-checklist findings

### A. The bug Cinder found and fixed (§4 of his report)

**Verified correct, and better than the task brief assumed.** The brief I was given hypothesized Cinder's stale-banner condition was `row.stale && !row.open_reconciliation` (banner only when no draft is open). That is **not** what the code does. Looking at `AccountGate` (Reconcile.jsx:410):

```jsx
{summary && summary.stale && (
  <StaleBanner offendingTxns={(detail || staleDetail)?.stale_offending_txns || []} ... />
)}
```

This fires on `summary.stale` alone, independent of whether `detail` (open-draft path) or `staleDetail` (no-draft path) supplied the data. So the banner **does** render regardless of draft state, which is exactly what VB-REC-34 / spec text requires ("stale banner visible on account's reconcile page whenever that account has any stale reconciled recon"). Cinder's `staleDetail` second-load-path fix is correct and necessary — without it, `detail` stays null when there's no open draft and the banner would render with an empty offender list. Verified this live: the `stale_offenders` field lands correctly on the LIST endpoint and `stale_offending_txns` lands correctly on the detail endpoint regardless of which recon id anchors the query (confirmed via code read of `buildReconDetail`'s stale query — it pulls **all** stale reconciled recons for the account, not just the passed-in recon id).

**No finding.** This part is correct.

### B. The mutation detection layer — **BLOCKER**

**B1 — Staleness is never cleared. The spec's documented recovery path (b) does not exist.**

Spec §6.6: *"(b) Resolve the mutation by editing the offending transaction... restoring the original amount, and saving. Saving clears the staleness flag on the prior recon."*

I grepped the entire mutation/staleness code path (`server/services/reconciliation.js`, `server/routes/books/transactions.js`) for anywhere `stale` is set back to `0`. There is exactly one place `stale` is ever written: `invalidateReconciliationOnMutation` sets it to `1`. Nothing clears it. I verified this live: created a recon, cleared+closed it, mutated a cleared txn's amount (stale=1, confirmed via LIST endpoint), then reverted the amount back to the original value via PATCH. The recon's `stale` flag **remained 1** — the LIST endpoint still showed `stale: true, stale_count: 1` after the revert.

**Impact:** per the spec, and per the UI's own tooltip text ("Resolve staleness or roll back before starting a new reconciliation"), a user is told there are two ways to unblock a stale account: fix the transaction, or roll back. Only rollback actually works. If a user "fixes" the transaction back to the original value (exactly the documented happy path), the account stays permanently gated — the only escape is rollback, which throws away the entire reconciliation and forces starting over from scratch, even though the user did nothing wrong and the discrepancy is fully resolved.

**Severity: BLOCKER.** This is the "load-bearing part" (spec's own words) of the phase, and half of its documented recovery UX is a dead end.

**B2 — Deleting a cleared transaction crashes instead of invalidating the recon.**

`reconciliation_clears.transaction_id` is declared `REFERENCES transactions(id)` with **no** `ON DELETE CASCADE` or `ON DELETE SET NULL` (db.js line ~541). `deleteTransaction()` (journalHelpers.js) does a raw `DELETE FROM transactions WHERE id = ?` with no awareness of reconciliation_clears at all. `PRAGMA foreign_keys=ON` is set globally (db.js:18).

I reproduced this live: took a transaction that was cleared by a (now-rolled-back-for-cleanup) reconciliation, pointed a second transaction's `near_duplicate_of` at it, then called `POST /transactions/:id/resolve-duplicate {"action":"keep_this"}` (which deletes the *original* — the cleared one). Result:

```json
{"error":"FOREIGN KEY constraint failed","code":"SERVER_ERROR"}
```

500, generic message, no `reconciliation_warnings`, no mutation hook fired. The whole `resolve-duplicate` handler is correctly wrapped in `db.transaction(...)`, so the failure is atomic (I confirmed the pre-mutation state was fully preserved — no partial writes), but the user-facing result is a raw crash, not the documented "transaction_deleted mutation → stale recon → reconciliation_warnings in response" flow from spec §6.5.

**Impact:** the spec's mutation table explicitly lists "Transaction deleted (any code path: import dedupe, keep-this/keep-original, manual DELETE)" as **YES, this is a mutation**. Right now that code path doesn't produce a mutation — it produces an unhandled exception. Any cleared transaction that's a duplicate candidate (or has any other future delete path added) will 500 instead of degrading gracefully.

**Severity: BLOCKER.** The spec's own edge-case note calls out "FK-cascade deletion" as something the hook must handle "once per deleted child" — but the code doesn't even get that far; the DELETE statement itself fails before the hook can run.

**Note on hook completeness (the good news):** Aside from B2, the call-site coverage is otherwise correct. I checked every write path in `transactions.js`:
- `PATCH /:id` → `runMutationHookIfCleared` fires for amount/category/date changes. ✅ Verified live (amount_changed fires correctly, description/status changes correctly do NOT fire — matches spec table).
- `POST /:id/resolve-duplicate` (keep_this / keep_original) → captures pre-delete snapshots, fires the hook once per deleted id, dedupes warnings by `recon_id` (not double-firing across cascaded children) — **but only reachable if the DELETE itself doesn't throw first (see B2)**.
- No standalone `DELETE /transactions/:id` route exists in this file, so that spec bullet is moot for the current codebase (nothing to wire).

The category-change conservative rule (§6.5: treat any category change as a mutation, don't try to prove journal-line equivalence) is implemented exactly as spec'd — `categoryChanged` fires on any before/after difference in `category_account_id`, no equivalence check attempted. ✅

**account_id (source account) change:** confirmed NOT treated as a mutation (`runMutationHookIfCleared` only checks amount/category/date). Verified live: PATCHing a cleared transaction's `account_id` to a different account succeeds silently, no warning, recon stays clean. This is Cinder's own flagged item #5 — see §3 below for my read.

### C. The rollback semantics

**Verified correct and atomic.** Read `rollbackRecon` end-to-end and reproduced live: created a recon, cleared 7 txns, closed it, then rolled back. Single `db.transaction(...)` wraps all three required effects:
1. `transactions.cleared_at` nulled on the full cleared set (confirmed: all 7 back to NULL post-rollback).
2. Recon row DELETE (FK CASCADE removes `reconciliation_clears` — confirmed 0 rows remain).
3. `accounts.last_reconciled_at` / `last_reconciled_balance` reverted (confirmed: reverted to NULL since no prior recon existed in my test).

No effect happens outside the transaction wrapper. Latest-only enforcement (`ROLLBACK_NOT_LATEST` 404) is correctly checked before the transaction runs. No bulk-rollback endpoint exists in `reconcile.js` — confirmed by reading every route. The UI's rollback button only ever calls the single-recon endpoint once per click, no auto-chaining. ✅

### D. The forward-only gate

**Verified correct.** Confirmed live with three cases against an account with `last_reconciled_at = 2026-01-31`:
- Same date (`2026-01-31`) → 409 `RECON_DATE_NOT_FORWARD`. ✅ (the `=` case is blocked, matching "strictly greater than.")
- Earlier date (`2026-01-15`) → 409 `RECON_DATE_NOT_FORWARD`. ✅
- Later date (`2026-02-01`) → succeeds, draft created. ✅

`err.last_reconciled_at` is present on the 409 body and correctly surfaced onto the thrown client error object via `api.js`'s `+2 lines` change (confirmed by reading `request()`). ✅

### E. The stale UI + TransactionEditor wiring

- Global list (`<ReconcileList>`) shows only a pill, never the full banner — confirmed by code read, the pill is the only stale-rendering in that component. ✅
- "See what has changed" expansion: each offender row passes `preMutationSnapshot={o.before}` and `reconLink={{account_id, as_of_date}}` into `TransactionEditorRow` exactly per the brief's prop contract. ✅ (confirmed against `CINDER_BRIEF_E2.md` §L3 Component API section — the prop names match.)
- Rollback modal text: read the actual JSX (not just trusting the Playwright claim). The three required substrings (as_of_date, cleared count, previous as_of_date + balance) are all present and interpolated correctly, matching spec §6's wording closely enough — this is not a byte-exact match to the spec's template string (e.g. spec says "will need to redo this reconciliation from scratch" — code matches that exact phrase). ✅ No finding.

### F. The auto-cosmetic gap (§8.1)

Confirmed present in code (native checkboxes, only `accent-*` color applied, no custom styling). Not independently re-tested in a browser this pass — Cinder already flagged it and it's cosmetic-only. No new finding; agree with Cinder's characterization (NIT, not a bug).

### G. Regression check

- E.1 leftovers (`monthBounds`, `previousMonth`, period-picker logic) — confirmed **fully removed** from the E.2 file via diff against `git show HEAD:client/src/books/Reconcile.jsx` (the pre-E.2 version still has them; current working file does not).
- `STATUS_STYLE.investigating` — **still present** as a dead constant (`Reconcile.jsx` line ~34) but not referenced anywhere in the render path (only `STATUS_STYLE.reconciled` is used). Cosmetic dead code, not a functional leftover. **NIT.**
- `BooksShell.jsx` — confirmed the `?period=` parsing block is fully removed, diff matches the reported +3/-8 shape exactly.
- `Categorization.jsx` XC-1 fix — confirmed **untouched** in this pass (`git diff` shows the only changes to that file are from the prior fix-pass commit, not from E.2; Cinder's own report explicitly states he didn't touch it, and the diff confirms it).

### H. DB state

- `curl /api/v1/books/health` → `phase: "E.2"`, `reconciliations: 0`. ✅ Confirmed live, both at start and end of my review session (I ran several live create/clear/close/mutate/rollback cycles as part of testing B1/B2/C/D — all cleaned up, DB restored to the exact same 11-transaction / 0-reconciliation baseline afterward, verified via direct sqlite3 queries of `cleared_at` and `amount` columns).
- Pre-build backup `data/backups/tasks-pre-e2-1783353216.db` (+`.db-shm`/`.db-wal`) — confirmed present via `ls -la`. ✅

### I. Code quality / open follow-ups (Cinder's §8)

1. **Native checkboxes** — agree, cosmetic, no action needed this pass.
2. **`/books/categorize` crash (NDC-1)** — out of scope, agree.
3. **VB-INV-02 / VB-CAT-03** — out of scope, agree.
4. **stale_reason envelope dedup (append-only, multiple edits → multiple offender rows for the same txn)** — **Spec question for Patrick.** I read this the same way Cinder did: the spec's snapshot format is literally an append-only array, so the current behavior is spec-compliant, just potentially confusing UX if a txn is edited twice while stale. My recommendation: collapse to "most recent mutation per txn_id" for *display* purposes only (keep the full audit envelope in the DB as-is) — this is a UI-only change, low risk, and meaningfully reduces confusion. Not a blocker either way.
5. **`account_id` (source-account) change not treated as a mutation** — **[SIGNIFICANT] Escalate, don't just note.** Given B1/B2 above, I'd push back a bit harder than Cinder did on calling this "may be intentional." The `TransactionEditorRow` is a *general-purpose* editor per spec §8.5 — it's reachable from every transaction list in the app, not just the stale-banner recovery flow. A user doing ordinary bookkeeping (the spec's own stated primary use case) can silently move a cleared transaction to a different account with zero warning and zero recon invalidation. That's a real correctness gap in the mutation table, not just a documentation nit — the discrepancy `invalidateReconciliationOnMutation` exists specifically to prevent is exactly what an unflagged account_id change produces (the old account's books_balance is now wrong, silently). I recommend adding `account_id changed` as a `transaction_deleted`-equivalent-severity mutation type in the same pass that fixes B1/B2, since all three land in the same function.
6. **Stale-banner fetch cost at scale** — agree, not a problem at current volumes, fine to defer.

**Additive backend changes (`prior_reconciliation`, `last_reconciled_recon_id`, `last_cleared_count`)** — confirmed genuinely additive. I diffed `listAccountsWithReconStatus()` against the described E.1 shape; the new fields are appended to the returned object, no existing field changed semantics, no existing query touched. I also confirmed none of the other 7 exported functions (`getOrCreateRecon`, `getReconDetail`, `closeRecon`, `rollbackRecon`, `cancelDraft`, `invalidateReconciliationOnMutation`, `buildReconDetail`/`splitTxnsForAsOf` internals) were modified beyond what's needed — read each in full, no scope creep. ✅

---

## 3. Spec questions for Patrick/Rusty

1. **B1 (staleness never clears) needs a design decision, not just a fix.** The spec text (§6.6 path (b)) says saving a corrective edit "clears the staleness flag on the prior recon" — but doesn't specify: does it clear only if the edit reverts to the *exact* pre-mutation values (amount/category/date all match `stale_reason.before`), or does *any* subsequent edit to the flagged transaction clear the flag (even a different, intentional change)? This matters: naive "any save clears staleness" would let a user accidentally paper over a real discrepancy by editing to a *different* wrong value. I'd recommend: clear the specific offender's flag only when the current transaction state exactly matches the corresponding `before` snapshot for every mutation-relevant field, and only clear the recon's overall `stale` bit when zero offenders remain unresolved. This needs Patrick's sign-off before Cinder implements the fix.
2. **§8 #5 (account_id change)** — is moving a cleared transaction to a different account meant to be a mutation? My read: yes, it should be, given the general-purpose nature of the editor and the "why this matters" framing in spec §6.5 (silent-corruption prevention). Recommend adding it as a mutation type (`account_changed` or similar) in the same fix pass as B1/B2.
3. **§8 #4 (stale envelope dedup)** — UI-only question, lower priority than 1/2 above. My recommendation: display latest-mutation-per-txn only, keep audit trail as-is in the DB.

---

## 4. Recommendations for Echo's run

- **Do not mark B1/B2 as "already covered by Cinder's Playwright pass."** They weren't — his smoke tests only exercised `amount_changed` on a PATCH; no test exercised delete-of-a-cleared-transaction or the "revert value → does staleness clear" flow. Echo should add both as explicit new behaviors (they're not in the VB-REC-* list Cinder submitted) and mark them FAIL until the fix lands.
- When Echo re-runs after the fix, she should specifically verify: (a) reverting a mutated cleared txn to its exact original values actually flips `stale` back to `0` on the LIST endpoint, not just in a toast/local UI state; (b) `resolve-duplicate` on a transaction cleared by an **open draft** (not just a committed recon) also needs checking — I only reproduced B2 against a committed recon's cleared set; the same FK will fire for draft-cleared transactions too since `reconciliation_clears` doesn't distinguish recon status, but I did not explicitly verify the draft case live (out of time budget for this spot-check) — flag as needing confirmation.
- Re-verify VB-REC-16/37 (forward-only gate error, disabled Start button) still pass after whatever fix lands for B1 — those paths share code with the staleness gate check (`summary?.stale` in `AccountGate`).
- The account_id-mutation gap (§3 item 2) — if Patrick decides it should be a mutation type, that's new scope for Cinder, not something Echo tests until it exists. If Patrick decides it's fine as-is, Echo should add an explicit behavior confirming account_id changes on cleared txns do NOT produce warnings (documenting the decision, not just silence).

---

*Reviewer: Wren 🔎 · 2026-07-06 · Verdict: NEEDS-FIX (2 BLOCKER, 1 SIGNIFICANT, 2 NIT, 3 spec questions)*
