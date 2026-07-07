# Phase E.2 — Reconciliation Process Redesign

**Status:** DRAFT — pending Patrick sign-off
**Date:** 2026-07-04
**Replaces:** §E.1 calendar-month binding for the period range
**Wraps:** §13 (Account Reconciliation)

---

## Why this changes

E.1 binds a reconciliation to a calendar-month period (`period_start` / `period_end` set via `monthBounds()`). Real bank/credit-card statements are not calendar-month-aligned:

- Credit-card statements may close mid-month (e.g., 6/9 → 7/9)
- Bank statements shift a day or two around holidays/weekends
- A reconciliation that's "for June" might actually span 5/28–6/29 against the real statement

We also conflated two things in E.1: the **period the recon covers** and the **as-of date the user is reconciling**. The user is reconciling *as of* a date; the period is implicit (everything up through that date that hasn't been reconciled yet).

## Design changes

### 1. Reconciliation date instead of period range

A reconciliation is anchored to a single **as_of_date** (the statement date). The implicit "period" is:

> All transactions for this account with `txn_date <= as_of_date` that are not yet reconciled by an earlier, already-completed reconciliation.

Schema change:
- New canonical field: `as_of_date TEXT NOT NULL` on `reconciliations`
- Deprecate (do not drop yet, for backwards compat with any open E.1 drafts): `period_start` / `period_end`
- E.1 rows with a status of `draft` get migrated: `as_of_date = period_end`; rows with `status='reconciled'` are read-only historical records and keep `period_start`/`period_end` for the audit trail

### 2. Forward-only, but per-account

Per-account "last reconciled as of" lives on the account row: `accounts.last_reconciled_at TEXT` (an as_of_date). The create-reconciliation endpoint enforces:

```
as_of_date > last_reconciled_at
```

Enforced at the API level (not just UI) — this is a *correctness* gate, not a UX gate. Returns 409 `RECON_DATE_NOT_FORWARD` if violated.

Edge case: a brand-new account with no prior reconciliation has `last_reconciled_at = NULL`, which is treated as "no lower bound." First reconciliation accepts any as_of_date.

### 3. Pending flag on in-progress reconciliations

A reconciliation in `status='draft'` (in-progress) implicitly applies a "pending" mark to the transactions it's working with. For UI purposes:

- When viewing transactions on `/books/reconcile/:id` (the work-in-progress view), the **Cleared column** is built from `reconciliation_clears` rows for this recon.
- When viewing transactions on the account's regular transaction list (the import/categorize path), the user can filter by recon-pending. (UI deferral — see "Phase UI scope" below.)

The clearing semantics from E.1 are unchanged: marking a txn cleared inserts a `reconciliation_clears` row. The recon's `cleared_count` and the journal-side `transactions.cleared_at` flag both still get set.

**Important:** until the recon is committed (status flipped to `reconciled`), clearing is **provisional**. If the user cancels, the clears are rolled back (see §5). If the user commits, the clears are permanent and the transactions are excluded from any future reconciliation's pool.

### 4. Commit requires diff == 0

The reconcile button is `disabled` (UI) and the PATCH-to-status endpoint is `409` (API) until `diff == 0`. Diff = `books_balance - statement_balance`, computed at as_of_date against the implicit transaction pool.

- `books_balance`: sum of journal_lines for `account_id` where `je.txn_date <= as_of_date` MINUS the `statement_balance` already-anchored by any earlier `reconciled` recon for this account whose `as_of_date < this.as_of_date`. (Net effect: each prior reconciliation removes its "ending balance" from the running sum, so each recon is responsible for only its own delta.)
- The statement_balance input lives on the recon row, set via PATCH.

### 5. Save vs. cancel — explicit two-way exit

When a user opens a recon and walks away mid-way, we **don't auto-discard**. The draft sits there with provisional clears. The UI:

```
┌─────────────────────────────────────────┐
│  Continue reconciliation                │
│  ─ or ─                                 │
│  Cancel and delete reconciliation       │
└─────────────────────────────────────────┘
```

API: `DELETE /api/v1/books/reconcile/:recon_id` (new endpoint).
- Deletes the recon row.
- FK cascade removes `reconciliation_clears` rows.
- `transactions.cleared_at` is **nulled** for all transactions that were provisionally cleared (because the clears are gone, the flag is no longer meaningful).
- A previously-reconciled recon (status='reconciled') cannot be deleted — must be reopened first (see §6).

### 6. Rollback — explicit, latest-only

If a recon turns out to be wrong, the only escape hatch is to roll it back. Rollback is a one-way operation that **removes the recon entirely** and brings the account's reconciliation gate back to where it was before this recon was committed.

```
POST /api/v1/books/reconcile/:id/rollback
```

UI: a **"Roll back previous reconciliation"** button on the account-reconcile screen. Clicking it shows a warning ("This will un-reconcile N transactions and reset the account's last reconciliation to {previous_as_of_date}, {previous_balance}. You will need to redo this reconciliation from scratch.") with a **Confirm** button. No one-click undo.

**Rules:**

1. **Only the latest recon for an account can be rolled back.** Enforced at the API: `404 ROLLBACK_NOT_LATEST` if there's a more recent `reconciled` recon for the same `account_id`.
2. Effects, atomically:
   - Recon row **deleted** from `reconciliations` (no tombstone — Patrick 2026-07-04 17:41 MDT). Audit is at most a single log line ("Recon {id} rolled back by user at {timestamp}"); no per-transaction notation.
   - `reconciliation_clears` rows cascade-deleted.
   - For each cleared transaction: `transactions.cleared_at` is nulled (the transactions rejoin the "uncategorized-as-far-as-the-gate-knows" pool).
   - `accounts.last_reconciled_at` reverts to the *previous* reconciled recon's `as_of_date` (or NULL if there is none).
   - `accounts.last_reconciled_balance` reverts similarly.
   - `journal_entries` and `journal_lines` are **untouched** — the JE was a record of the categorization, not of the reconciliation. Categorization is independent of clearing.
3. **Schema:** drop the `rolled_back_at` and `rolled_back_to_id` columns from the migration (no longer needed). Status stays as `'reconciled'` semantics until the row is DELETE'd.
4. **Old `reconciled` recons are immutable.** No PATCH to a `reconciled` recon except via the rollback path. PATCH `status='investigating'` is gone (the new model has no `investigating` status anymore — rollback replaces it).

**Why rollback-only-latest and not arbitrary:** the *purpose* of reconciliation is the gate (the as_of_date forward-only invariant). Letting you roll back an arbitrary old recon would unblock the gate but not restore the cleared_at flags of any *newer* recons that included the rolled-back transactions — partial rollback would silently break the invariant. Latest-only is the only model that's actually sound.

---

### 6.5 Reconciled-transaction mutation detection (the load-bearing part)

**This is the rule that makes reconciliation trustworthy:** once a transaction has been cleared by a `reconciled` recon for some account, *anything* that changes its amount (categorization re-class, manual amount edit, etc.) or deletes the transaction must be flagged, and the affected recon must be invalidated.

**Why this matters:** the gate locks the account's books_balance at the time of recon. If you change a cleared transaction's amount after the fact, the gate's books_balance is now wrong, but the gate still claims the account is reconciled. Subsequent recons would compute their `diff` against the (now wrong) locked balance and could appear to reconcile cleanly when in fact they don't. This is the silent-corruption mode that rollback alone can't fix.

**What "mutation" means:**

| Event | Treated as mutation? |
|---|---|
| Transaction deleted (any code path: import dedupe, keep-this/keep-original, manual DELETE) | **YES** |
| `transactions.amount` changed | **YES** |
| `transactions.category_account_id` changed (re-categorized) | YES, if the new category produces different journal_lines (different account_id or amount split). NO if it produces the same lines (just renames the categorization label). **Implement the conservative version: treat *any* category change on a cleared txn as a mutation.** Auditing whether the journal lines are equivalent is too error-prone for v1. |
| `transactions.txn_date` changed (very rare, only via direct DB edit) | **YES** |
| `transactions.description` changed | NO — does not affect reconciliation |
| `transactions.status` changed | NO — does not affect reconciliation |
| `transactions.cleared_at` flipped manually | NO — treated as a system field, not user-editable |

**Where the hooks go:**

The mutation check needs to run at every write path that touches `transactions`. Today the candidates are:

1. `POST /api/v1/books/transactions/:id` (PATCH-style update — category, etc.)
2. `POST /api/v1/books/transactions/:id/keep-this` / `/keep-original` (duplicate-resolve delete paths)
3. The dedupe FK cascade (when a parent txn is deleted, children are cascade-deleted; the children may be cleared by a recon)

For each, add a single helper: `invalidateReconciliationOnMutation(transactionId, mutationType)` that:

1. Queries `reconciliation_clears` to find any `reconciliation_id`s that cleared this txn.
2. For each such recon that is `status='reconciled'`, marks the recon as `stale`. **Schema:** new column on `reconciliations`: `stale BOOLEAN DEFAULT 0`, `stale_reason TEXT`, `stale_at TEXT`.
3. Does NOT change `accounts.last_reconciled_at` or `last_reconciled_balance` (yet). The gate doesn't move until the user takes action.
4. Returns the list of stale recons (and the originating txn) to the caller.

**Behavior on PATCH / DELETE / keep-this / keep-original:**

- Server returns the normal 200/4xx response (the user-initiated mutation succeeds).
- **If any reconciled recon for the txn becomes stale**, the response body includes a `reconciliation_warnings` field:
  ```json
  {
    "transaction": {...},
    "reconciliation_warnings": [
      {
        "recon_id": "abc123",
        "account_id": "...",
        "as_of_date": "2026-06-30",
        "reason": "transaction_deleted" | "amount_changed" | "category_changed",
        "stale_at": "2026-07-04T17:42:00Z"
      }
    ]
  }
  ```
- Client checks for the field and, if present, displays an inline warning banner ("This change has invalidated reconciliation for [Account] as of 2026-06-30. The account's beginning balance will be out of balance until you re-reconcile.")

**Behavior on opening the reconcile page for an account with a stale recon:**

The account list shows a red `⚠ stale` pill instead of the normal reconciled/in-progress pill. Clicking into the account:

- The reconcile page shows the *current* `books_balance` (computed against `last_reconciled_at` + cleared_at + the post-mutation txns).
- Above the standard UI: a **red banner** with the heading "Beginning balance is off" (or similar short warning text).
- The banner contains a link **"See what has changed"** (or similar). Clicking it reveals a list of the offending transactions — each row showing the original reconciled amount **and** the current amount side by side (from the `stale_reason` snapshot).
- Each row in the offending-transactions list is **clickable**, and clicking opens the in-line transaction edit screen (see §8.5) where the user can manually correct the transaction.
- The "Start reconciliation" button is **disabled** while staleness is unresolved. The user must either resolve the staleness (edit offending txns back to original) OR rollback the latest recon per §6 to unlock it.

**Schema: pre-mutation snapshot**

For audit + UI display, when a mutation is detected, store the **pre-mutation state** of the transaction on the reconciliation's `stale_reason` field as a JSON blob:

```json
{
  "type": "amount_changed",
  "txn_id": "...",
  "before": { "amount": -45.00, "category_account_id": "6100", "txn_date": "2026-06-15" },
  "after":  { "amount": -89.43, "category_account_id": "6100", "txn_date": "2026-06-15" }
}
```

For deletions, `before` is the full txn row; `after` is `null`.

**Why not auto-rollback on staleness:** the user might want to keep the mutation and re-reconcile from scratch, or they might want to revert the mutation manually. Either way, the gate is now wrong — but the *choice* of how to recover is a human decision, not an automatic one.

**Edge case: FK-cascade deletion.** When `keep-this` / `keep-original` deletes a parent txn, the cascade may also delete child transactions (if the schema ever has parent/child txn relationships). The mutation hook runs on each cascade-deleted child too. The `invalidateReconciliationOnMutation` helper must be called once per deleted child, not once per call.

---

### 8.5 Transaction edit UI (general-purpose)

E.2 ships a transaction editor. This is a **general-purpose tool** — the most common reason to open it is just normal bookkeeping work (the user notices a wrong amount, fixes it, moves on). The stale-banner recovery flow is *one* of the entry points into this editor; it isn't the reason the editor exists.

**Two ways into the editor:**

1. **From any transaction list.** Click a transaction on Categorization, the Reconcile working view, or any future per-account transactions list. This is the **primary** way users will mutate transactions — they're already in the list, looking at something, fix a thing.
2. **From the stale banner's "See what has changed" expanded list.** Each offending transaction row is clickable and opens the same editor. The user then manually edits the transaction to restore (or intentionally change) the value.

There's no separate "restore" or "revert" affordance in the editor — the user just edits the field manually. If the user wants the txn back to the original amount, they edit `amount` back to that value and Save.

**Editor model.** Click a transaction row → the row expands inline (not a modal) showing every editable field, populated with current values. Save commits changes via `PATCH /transactions/:id`. Discard reverts the form to last-saved state with no server call.

**Editable fields:**
- `txn_date` (date picker)
- `vendor` / `customer` (text — whichever the txn has)
- `amount` (number input, sign-aware for outflows)
- `account` (dropdown, filtered to active accounts but allows inactive for rare cases)
- `memo` (textarea)
- `near_duplicate_of` (dropdown, optional)
- `status` (uncategorized / categorized / excluded / personal — gated by whether a category_account_id is set)

**Read-only fields:**
- `id`, `created_at`, `imported_at` (audit fields)
- `dedupe_hash` (cleared/recomputed automatically when txn_date / amount / description changes)
- `cleared_at` (touched only via reconciliation system, surfaced read-only in the editor as "Reconciled: yes/no, as of {as_of_date}" for context)

**When Save triggers a stale recon.** If the saved change makes a stale `reconciliation_warnings` come back, the editor surfaces an inline alert: "This change has affected reconciliation for {Account Name} as of {as_of_date}." with a link to that account's reconcile page. The user can then either:
- Edit further to make the change non-mutating (rare; e.g., they meant to change the memo, not the amount).
- Save as-is and acknowledge that they're invalidating the recon — at which point the stale banner takes over the recovery conversation.

**Scope clarification.** This is the edit UI for the `transactions` table only. The set of editable fields is bounded; the mutation-detection hooks are wired to a known list of transaction writes; no other table gets this UI in E.2. In particular: customers, vendors, accounts, invoices — out of scope, edit via separate forms (which already exist for some).

---

### 6.6 Latest-only rollback + mutation detection, combined

---

### 6.6 Latest-only rollback + mutation detection, combined

The mutation-detection layer and the rollback layer complement each other:

- **Mutation detection** invalidates a recon but does not move the gate.
- **Rollback** moves the gate by deleting exactly one recon — the *latest* reconciled recon for the account.

Each rollback is a single, explicit, one-recon-deep decision. If the user needs to roll back further than the latest, they finish the first rollback (which makes the prior recon the new "latest"), then click rollback again. There is no bulk rollback, no chained rollback — each step is one decision made with one recon's worth of context.

**Walk-back rollback example:** Patrick confirms "you should be able to keep rolling back as far as you want" (2026-07-04 17:48 MDT). So if five months of recons are wrong, that's five rollbacks — one button click each, one confirmation each, one decision each. The mutation-detection warning still fires per-step (catches any transaction-changes-from-five-months-ago case at the time of the change, before the user even gets to the rollback UI).

**Interaction with mutation detection:** after a rollback, the account gate reverts to the *prior* recon's as_of_date. If that prior recon is itself `stale=1`, the post-rollback state shows:

> Account at gate = prior recon's as_of_date. That prior recon is still stale. So the account is "reconciled as of that date" *with a known broken* balance.

The mutation-detection warning on the prior recon catches this — when the user next opens the account, they see the red `⚠ stale` pill and the "Beginning balance is out of balance" banner. The user has two recovery paths from there:
- **(a) Walk-back further** by clicking rollback again. The stale-prior becomes the new "latest" until she reaches a non-stale gate or the start.
- **(b) Resolve the mutation** by editing the offending transaction (see §8.5 in-line edit UI), restoring the original amount, and saving. Saving clears the staleness flag on the prior recon.

Both paths are valid. The point is: **one rollback = one decision = one recon's depth.** Walking back N times is N decisions, never bundled.

### 7. Default-cleared view but with a "show past as_of_date" toggle

Default behavior when opening a draft recon for an account at as_of_date `D`:

> Show all transactions with `txn_date <= D` for this account that are not yet cleared by any *previously-reconciled* recon (i.e., transactions that "should" be in this recon's pool).

The UI also offers a toggle: **"Include transactions past as_of_date"** (off by default). When on, also show transactions with `txn_date > D` so the user can see uncleared items like a late-posting check.

**Note for the user:** matching such a past-as_of_date transaction into the current recon is *valid*. The bank showed it; you have a statement supporting it. Posting it later doesn't invalidate the recon.

### 8. UX flow (Patrick-confirmed 2026-07-04)

1. Land on `/books/reconcile`.
2. **Select account** from a list. (E.1 already has this; per-account status pills updated to show last-reconciled-as-of-date instead of "in-progress: 2026-07".)
3. If account has no open draft: show last reconciliation date + amount reconciled to. New reconciliation form: as_of_date input + statement_balance (optional, can be entered later) + **Start reconciliation** button.
4. If account has an open draft: show the working recon (continuation view). Two paths: **Continue** / **Cancel and delete**.
5. Once in the recon: standard E.1 two-pane (uncleared | cleared + diff). Add the **"Include past as_of_date"** toggle.
6. Reconcile button enabled only when `diff == 0`. Commit → status='reconciled' → `accounts.last_reconciled_at = as_of_date`.
7. Reopen path: from `/books/reconcile` history view (deferred UI — see below), or via PATCH directly.

---

## Schema migration

In `server/db.js` after the E.1 block:

```sql
-- (a) New column on reconciliations
ALTER TABLE reconciliations ADD COLUMN as_of_date TEXT;

-- (b) Backfill from existing E.1 rows
UPDATE reconciliations
SET as_of_date = period_end
WHERE as_of_date IS NULL;

-- (c) New columns on accounts
ALTER TABLE accounts ADD COLUMN last_reconciled_at TEXT;
ALTER TABLE accounts ADD COLUMN last_reconciled_balance REAL;

-- (d) Stale-detection columns on reconciliations
ALTER TABLE reconciliations ADD COLUMN stale INTEGER DEFAULT 0;          -- 0/1 boolean
ALTER TABLE reconciliations ADD COLUMN stale_reason TEXT;               -- JSON blob: { type, txn_id, before, after }
ALTER TABLE reconciliations ADD COLUMN stale_at TEXT;                    -- timestamp of staleness

-- (e) Index for the staleness query path
CREATE INDEX IF NOT EXISTS idx_reconciliations_stale ON reconciliations(account_id, stale);

-- (f) Index for as_of_date lookups
CREATE INDEX IF NOT EXISTS idx_reconciliations_as_of ON reconciliations(account_id, as_of_date);
```

All additive. No FK disable trick required. No CHECK constraint to widen (rollback now deletes the row outright, so no new status value). Idempotent (each guarded by `PRAGMA table_info` check before `ALTER TABLE`).

## API contract

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/v1/books/reconcile` | List accounts + `last_reconciled_at` + `last_reconciled_balance` + open-draft indicator |
| `POST` | `/api/v1/books/reconcile` | `{ account_id, as_of_date }`. Returns existing open draft if any (idempotent). Returns 409 `RECON_DATE_NOT_FORWARD` if `as_of_date <= last_reconciled_at`. |
| `GET` | `/api/v1/books/reconcile/:id` | Returns uncleared+cleared at as_of_date; `include_past` query param (default `false`) toggles txns past as_of_date. |
| `PATCH` | `/api/v1/books/reconcile/:id` | Update `statement_balance`, `notes`. Status transition rules: draft→investigating (allowed), investigating→draft (allowed), reconciled→investigating (allowed, opens; audit fields updated). Other transitions 409. |
| `POST` | `/api/v1/books/reconcile/:id/close` | **NEW.** Body: `{ statement_balance }`. Sets status='reconciled' if diff==0, else 409 `DIFF_NOT_ZERO`. Atomically: insert clears (already there), set `transactions.cleared_at`, set `accounts.last_reconciled_at` + `accounts.last_reconciled_balance`. |
| `DELETE` | `/api/v1/books/reconcile/:id` | Allowed only if status ∈ {draft, investigating}. Cascade-deletes clears; nulls `transactions.cleared_at` on the affected txns. Returns 404 if status='reconciled' (use rollback path instead). |
| `POST` | `/api/v1/books/reconcile/:id/rollback` | **NEW.** Latest-only rollback. 404 `ROLLBACK_NOT_LATEST` if a more recent `reconciled` recon exists for the account. On success: DELETE the recon row (no tombstone), cascade-delete clears, null `transactions.cleared_at` for the cleared set, revert `accounts.last_reconciled_at` + `last_reconciled_balance` to the prior recon's values (or NULL if none). Optional query param `?force_chain=1` enables recursive rollback through stale prior recons (see §6.6 Open Question); default `0` returns `409 PRIOR_RECON_STALE` if the prior recon is stale. |
| `POST` | `/api/v1/books/reconcile/:id/clear` | Unchanged from E.1. |
| `DELETE` | `/api/v1/books/reconcile/:id/clear/:transaction_id` | Unchanged from E.1. |

The old `period_start` / `period_end` fields stay on the schema for now. Reading code reads `as_of_date`; legacy write paths are gone (replaced by the new endpoints).

The old `status='investigating'` is dropped from new code paths. The CHECK constraint stays (so old E.1 rows that were 'investigating' still load) but no new rows will be written.

**Mutation hooks** (per §6.5): the following existing endpoints get a `invalidateReconciliationOnMutation(txn_id, mutation_type)` call appended to their write paths:

- `PATCH /api/v1/books/transactions/:id` (amount or category change)
- `POST /api/v1/books/transactions/:id/keep-this` (delete via duplicate resolve)
- `POST /api/v1/books/transactions/:id/keep-original` (delete via duplicate resolve)
- `DELETE /api/v1/books/transactions/:id` (direct delete — may not exist yet; verify)

Response body for these endpoints gains an optional `reconciliation_warnings` array (empty array if no staleness triggered).

## UI scope (Phase E.2 deliverable vs. deferral)

**In scope for E.2:**
- Account select → "Start reconciliation" with as_of_date input
- Open draft → continue / cancel
- Working recon view with **Include past as_of_date** toggle
- Reconcile button gating on diff==0
- **"Roll back previous reconciliation"** button — always operates on the latest recon. Walk-back is N clicks for N recons; one click per decision.
- **Staleness UI:**
  - Red `⚠ stale` pill on the account list when any of the account's recons are stale
  - Red "Beginning balance is out of balance" banner on the account reconcile page when entering a stale account
  - List of offending transactions under the banner (clickable to navigate to the in-line transaction edit view per §8.5)
  - Client-side handling of the `reconciliation_warnings` response field on PATCH / DELETE / keep-* responses
- **Mutation hooks** on the four transaction-write paths listed in the API contract
- **In-line transaction edit UI** — per §8.5. Required to make the stale-banner recovery flow possible without SQL workarounds.

**Deferred to E.3:**
- **Reconciliation history list** — list of read-only PDF reports of each past recon per account, dated. Generated at commit time. Stored on the recon row.
- Pending-filter for the regular transaction list (per §3)

## Decisions confirmed (Patrick, 2026-07-04 17:35 + 17:41 + 17:48 MDT)

1. **Rollback, not reopen.** No `status='investigating'` PATCH. Rollback **DELETE**s the recon row outright (no tombstone). At most a single log line; no per-transaction notation. Cleared-at flags nulled, account gate reverts to prior recon.
2. **Rollback operates on a single (latest) recon per click.** No bulk / chained rollback. Walk-back across many recons is N clicks for N decisions (Patrick 2026-07-04 17:48 MDT).
3. **No auto-discard.** Drafts stay until user explicitly cancels. No timeout.
4. **Mutation detection on cleared transactions.** Any mutation (delete, amount change, category change) to a transaction that's been cleared by a `reconciled` recon invalidates that recon. The recon is marked stale (`stale=1`, `stale_reason` JSON blob, `stale_at` timestamp). The gate does not move. The user is notified in the response and on next visit to the reconcile page; they must re-reconcile, rollback, or restore the offending transaction.
5. **Transaction edit UI is in scope for E.2** (Patrick 2026-07-04 17:48 + 17:56 MDT). General-purpose editor reachable from any transaction list; also the entry point from the stale-banner "See what changed" expanded list. **No "restore" or "revert" button** — just editable fields. Recovery path uses the same Save mechanism: user manually edits the field back to the original value and Save commits.
6. **History list deferred to E.3.** Past recons rendered as read-only PDF reports. **PDF generated at commit time** (`POST /close`), stored on the recon row as `pdf_path`.
7. **`last_reconciled_balance` kept.** Fast path for the "previous recon ended at $X.43" summary on the account select screen.

---

## Test plan (behavior IDs, to add to `qa/QA.md`)

- **VB-REC-12** — Account list shows `last_reconciled_at` + `last_reconciled_balance` per account; no open-draft pill if account has no draft.
- **VB-REC-13** — POST `/reconcile` with `as_of_date` strictly greater than `last_reconciled_at` creates a new draft.
- **VB-REC-14** — POST `/reconcile` with `as_of_date <= last_reconciled_at` returns 409 `RECON_DATE_NOT_FORWARD`.
- **VB-REC-15** — GET `/reconcile/:id` (default) returns only transactions with `txn_date <= as_of_date` that aren't covered by a prior `reconciled` recon.
- **VB-REC-16** — GET `/reconcile/:id?include_past=1` adds transactions with `txn_date > as_of_date` for the same account; supports matching a past-as_of_date txn into the current recon.
- **VB-REC-17** — POST `/reconcile/:id/clear` for a txn that crosses the as_of_date boundary is allowed when `include_past=1`.
- **VB-REC-18** — POST `/reconcile/:id/close` with `diff != 0` returns 409 `DIFF_NOT_ZERO`; recon remains in draft.
- **VB-REC-19** — POST `/reconcile/:id/close` with `diff == 0` atomically: sets status='reconciled', sets `accounts.last_reconciled_at` + `accounts.last_reconciled_balance`, sets `transactions.cleared_at` on the cleared set.
- **VB-REC-20** — DELETE `/reconcile/:id` for a draft: cascades to clears, nulls `transactions.cleared_at` on all provisionally-cleared txns.
- **VB-REC-21** — DELETE `/reconcile/:id` for a `reconciled` recon: returns 404 (must rollback first).
- **VB-REC-22** — POST `/reconcile/:id/rollback` on the latest reconciled recon for an account: DELETE the row, cascade clears, null `transactions.cleared_at` on the cleared set, revert `accounts.last_reconciled_at` + `last_reconciled_balance` to the prior recon's values (or NULL if first).
- **VB-REC-23** — POST `/reconcile/:id/rollback` on a non-latest recon: returns 404 `ROLLBACK_NOT_LATEST`.
- **VB-REC-24** — After a rollback, a new reconciliation can be opened for the same account with the *original* prior as_of_date as the new lower bound (proves the gate reverted correctly).
- **VB-REC-25** — Rollback does **not** delete journal_entries or journal_lines for the cleared transactions (categorization is independent of reconciliation).
- **VB-REC-26** — UI flow: account select → start reconciliation form; reconcile button disabled until diff==0.
- **VB-REC-27** — UI flow: "Include past as_of_date" toggle changes the txn list per the contract.
- **VB-REC-28** — UI flow: "Roll back previous reconciliation" button visible only when the account's latest recon is `reconciled` AND not stale; clicking it surfaces a confirmation modal; on confirm, the recon is rolled back atomically and the UI updates to show the prior recon summary.
- **VB-REC-29** — Browser smoke: open account → see last recon summary (date + balance) → start new recon → walk through cancel-and-delete → confirm no orphan clears or cleared_at flags remain.
- **VB-REC-30** — Mutating a cleared transaction (PATCH amount): server returns 200 with `reconciliation_warnings: [...]`; the recon row is marked stale (`stale=1`, `stale_reason` JSON, `stale_at` set); `accounts.last_reconciled_at` is unchanged.
- **VB-REC-31** — Deleting a cleared transaction (`keep-this` / `keep-original` / direct delete): same as VB-REC-30 but `stale_reason.type = 'transaction_deleted'`.
- **VB-REC-32** — Recategorizing a cleared transaction: same as VB-REC-30 (conservative: any category change is a mutation).
- **VB-REC-33** — Account list shows a red `⚠ stale` pill when any of the account's recons is stale.
- **VB-REC-34** — Opening a stale account's reconcile page shows the red "Beginning balance is out of balance" banner.
- **VB-REC-35** — The stale-account banner contains a "See what has changed" link; clicking it reveals a list of offending transactions with their original (reconciled-time) and current amounts shown side by side.
- **VB-REC-36** — Editing a transaction description does NOT trigger staleness (description is not a mutation).
- **VB-REC-37** — Editing a transaction date DOES trigger staleness.
- **VB-REC-38** — Pre-mutation snapshot in `stale_reason` JSON contains the full `before` state for the offending transaction, including amount, category_account_id, and txn_date.
- **VB-REC-39** — Cascading FK delete (child txn deleted because parent txn deleted via `keep-this`): the staleness hook fires for each child, not just the parent.
- **VB-REC-40** — Walk-back rollback: after rolling back the latest recon, the prior recon becomes the new "latest." If the prior recon is stale, the account list shows `⚠ stale`; clicking rollback again walks the gate backward one more step.
- **VB-REC-41** — Each rollback click is a single decision with a confirmation modal; there's no bulk / chained rollback endpoint.

**Transaction editor behaviors (VB-TXN-EDIT-*):**

The editor is a general-purpose transaction editor reachable from any transaction list. The stale banner entry point is *one* of two ways in; the rest is normal usage.

- **VB-TXN-EDIT-01** — From any transaction list (Categorization, Reconcile working view, per-account transactions): click a transaction row → row expands inline with all editable fields populated.
- **VB-TXN-EDIT-02** — Save commits the changes; PATCH returns the updated txn + `reconciliation_warnings` array (empty if no staleness triggered).
- **VB-TXN-EDIT-03** — Discard reverts the form to the last-saved state with no server call.
- **VB-TXN-EDIT-04** — Edit `amount` → journal_lines are regenerated server-side (the categorization is amount-aware via the journal entry).
- **VB-TXN-EDIT-05** — Edit `account` (category_account_id) → journal_lines point at the new account; old journal_lines deleted or migrated per the existing `categorizeTransaction` helper.
- **VB-TXN-EDIT-06** — Edit `txn_date` or `amount` → `dedupe_hash` is recomputed (existing logic).
- **VB-TXN-EDIT-07** — When Save returns non-empty `reconciliation_warnings`, the editor surfaces an inline alert naming the affected reconciliation by account + as_of_date, with a link to that account's reconcile page.
- **VB-TXN-EDIT-08** — Stale-banner entry: clicking an offending transaction in the expanded "See what has changed" list opens the same editor pre-populated. No special "restore" affordance — user manually edits the field back to the original amount (visible in the list above the editor for reference) and Saves.
- **VB-TXN-EDIT-09** — `cleared_at` is shown read-only in the editor as "Reconciled: yes/no, as of {date}" for context. The field itself is read-only and only mutable via the reconciliation system.
- **VB-TXN-EDIT-10** — Editing the `description` (vendor/customer) does NOT trigger reconciliation_warnings (description is not a mutation per §6.5 table).

(Tally: 22 new REC IDs (REC-12 through REC-41) + 10 new TXN-EDIT IDs = **32 new behaviors**. Phase D's 15 + E.1's 11 + F1's 2 + these 32 = **60 active behaviors** once E.2 lands.)

---

*Spec author: Rusty ⚙️, from Patrick's 2026-07-04 walkthrough.*
