# CINDER BRIEF — Phase E.2: Reconciliation Process Redesign

**Builder:** Cinder 🔥
**Date:** 2026-07-04
**Parent spec:** `~/clawd/projects/task-manager/docs/books/ACCOUNTING-E2.md` (v4 — read in full first)
**Goal:** Ship Phase E.2 — the redesigned reconciliation workflow plus the mutation-detection layer plus a general-purpose transaction editor.

---

## TL;DR (what this build produces)

1. **New reconcile workflow** anchored to a single `as_of_date` (not a calendar-month period).
2. **Forward-only gate** per account (`accounts.last_reconciled_at`); 409 `RECON_DATE_NOT_FORWARD` if violated.
3. **Save vs. cancel explicit** for drafts; no auto-discard.
4. **Rollback** — single endpoint, single click, deletes the latest recon. Walk-back across many recons = N clicks (one decision per click).
5. **Mutation-detection layer** — any change (delete, amount, category, date) to a transaction that's cleared by a `reconciled` recon marks that recon `stale=1` with a pre-mutation snapshot in `stale_reason` (JSON). `accounts.last_reconciled_at` does NOT move. Response from the mutating endpoint includes `reconciliation_warnings: [...]`.
6. **Stale UI** — red `⚠ stale` pill on account list; red "Beginning balance is off" banner on the account reconcile page; "See what has changed" link expands a list of offending transactions with original + current amounts; each row opens the transaction editor.
7. **Transaction editor** — general-purpose in-line UI reachable from any transaction list AND from the stale-banner offending list. No restore button — user manually edits fields and Saves. `cleared_at` shown read-only.

## Estimated ETA

90-120 min. Three layers:
- L1 backend (db.js migration + reconcile.js rework + transactions.js mutation hooks): ~35-45 min
- L2 reconcile UI (banner, pill, rollback button + modal, include_past toggle, reconcile button gating): ~30-40 min
- L3 transaction editor (new component, integration into lists + stale banner): ~25-35 min

If L3 starts to run over, **stop** and surface to Rusty. The editor is the highest-risk piece — backend + reconcile UI shipping without the editor is acceptable (recovery flow via stale banner is degraded but not broken: user can still click through and... wait, that's blocked too. So actually the editor is load-bearing for the recovery UX — keep going on it).

---

## Read first, in this order

1. This brief (you're here).
2. The spec: `~/clawd/projects/task-manager/docs/books/ACCOUNTING-E2.md` — 406 lines. **Read it in full.**
3. `~/clawd/projects/process/ENGINEERING.md` — especially §4 Hard Rules (especially #6: visual confirmation required).
4. `~/clawd/projects/task-manager/docs/books/CINDER_REPORT_FIX_D_F1_E1.md` — what just shipped; mirror the structure and quality bar for your report.
5. `~/clawd/projects/task-manager/docs/books/ECHO_REPORT_D_F1_E1.md` — recent QA findings (mutation-detection gaps noted in §2.2 FAILs).
6. `~/clawd/projects/task-manager/docs/books/qa/templates/CINDER_BRIEF_TEMPLATE.md` — for the report structure / "Test coverage" section.
7. The existing transaction-edit story: `server/routes/books/transactions.js` (the existing PATCH and keep-* / DELETE handlers you'll be wiring hooks into). `client/src/books/Categorization.jsx` (recently fixed in XC-1; mirror its two `booksApi.X()` consumer pattern).

## Hard rules

1. **Backup before any change.** `cp data/tasks.db data/backups/tasks-pre-e2-$(date +%s).db` (and `-shm` / `-wal` if service is running).
2. **No FK-disable trick needed here.** All schema changes are additive (new columns, new tables). If you find yourself needing a `PRAGMA foreign_keys=OFF` block, STOP and surface — the spec is supposed to avoid that.
3. **Idempotent migrations.** Every `ALTER TABLE` / `CREATE TABLE` is guarded by `PRAGMA table_info` / `sqlite_master`. E.2 must run cleanly on fresh DB and on a DB that's already at E.1.
4. **Atomic writes wrap in `db.transaction(...)`.** The rollback endpoint in particular is a multi-statement operation: clear-deactivation + recon DELETE + accounts.revert. Wrap the whole thing. The mutation hook also writes multiple rows; wrap per-call.
5. **Visual confirmation required** for every UI change. Curl-only is not enough (this is the third lesson from the BROKEN-but-curl-passed code in this project). For E.2 specifically, the stale banner, the rollback modal, the editor — all need to be exercised in the browser before declaring done.
6. **Don't refactor unrelated areas.** If you spot a bug or improvement outside E.2 scope, log it in your report's "Open follow-ups" section and DO NOT fix it.

---

## L1 — Backend

### 1.1 Schema migration (`server/db.js`)

Add the new columns idempotently. Each ALTER guarded by `PRAGMA table_info`. The complete list:

```js
// 1. reconciliations.as_of_date
const reconCols = db.prepare('PRAGMA table_info(reconciliations)').all().map(c => c.name);
if (!reconCols.includes('as_of_date')) {
  try { db.exec('ALTER TABLE reconciliations ADD COLUMN as_of_date TEXT'); } catch {}
}
// 2. Backfill: every existing row gets as_of_date = period_end (or '1970-01-01' if NULL)
db.prepare(`UPDATE reconciliations SET as_of_date = COALESCE(period_end, '1970-01-01') WHERE as_of_date IS NULL`).run();

// 3. reconciliations stale-detection columns
if (!reconCols.includes('stale')) {
  try { db.exec('ALTER TABLE reconciliations ADD COLUMN stale INTEGER DEFAULT 0'); } catch {}
}
if (!reconCols.includes('stale_reason')) {
  try { db.exec('ALTER TABLE reconciliations ADD COLUMN stale_reason TEXT'); } catch {}
}
if (!reconCols.includes('stale_at')) {
  try { db.exec('ALTER TABLE reconciliations ADD COLUMN stale_at TEXT'); } catch {}
}

// 4. accounts.last_reconciled_* columns
const acctCols = db.prepare('PRAGMA table_info(accounts)').all().c => c.name);
if (!acctCols.includes('last_reconciled_at')) {
  try { db.exec('ALTER TABLE accounts ADD COLUMN last_reconciled_at TEXT'); } catch {}
}
if (!acctCols.includes('last_reconciled_balance')) {
  try { db.exec('ALTER TABLE accounts ADD COLUMN last_reconciled_balance REAL'); } catch {}
}

// 5. Indexes
db.exec('CREATE INDEX IF NOT EXISTS idx_reconciliations_as_of ON reconciliations(account_id, as_of_date)');
db.exec('CREATE INDEX IF NOT EXISTS idx_reconciliations_stale ON reconciliations(account_id, stale)');
```

**Verify:** after migration, `PRAGMA table_info(reconciliations)` shows the new columns; `PRAGMA table_info(accounts)` shows the two new columns; existing E.1 rows have `as_of_date` populated. Smoke: `SELECT COUNT(*) FROM reconciliations WHERE as_of_date IS NULL` returns 0.

### 1.2 `server/services/reconciliation.js` (NEW file)

Extract the recon logic into a service module so the routes file is just thin handlers. The exports:

```js
// listAccountsWithReconStatus(db) — like the existing LIST endpoint
export function listAccountsWithReconStatus() { ... }

// getOrCreateRecon(db, accountId, asOfDate) — POST behavior
//   - rejects if asOfDate <= accounts.last_reconciled_at with error code RECON_DATE_NOT_FORWARD
//   - returns existing draft if any (idempotent)
//   - creates new recon row otherwise; computes books_balance at asOfDate
export function getOrCreateRecon(accountId, asOfDate) { ... }

// getReconDetail(db, reconId, includePast) — GET behavior
//   - returns uncleared txns (txn_date <= as_of_date, not cleared by any prior reconciled recon)
//   - returns cleared txns (the reconciliation_clears rows for this recon)
//   - if includePast, expands uncleared to include transactions with txn_date > as_of_date
export function getReconDetail(reconId, includePast = false) { ... }

// closeRecon(db, reconId, statementBalance) — POST /close behavior
//   - sets statement_balance
//   - computes diff
//   - if diff != 0, throw DIFF_NOT_ZERO 409
//   - atomically: status='reconciled', reconciliation_clears already exist; transactions.cleared_at set;
//     accounts.last_reconciled_at = as_of_date; accounts.last_reconciled_balance = books_balance
export function closeRecon(reconId, statementBalance) { ... }

// rollbackRecon(db, reconId) — POST /rollback behavior
//   - reject if not the latest recon for the account (ROLLBACK_NOT_LATEST 404)
//   - reject if status != 'reconciled' (CANNOT_ROLLBACK_DRAFT — drafts use DELETE not rollback)
//   - atomically: cascade-delete reconciliation_clears, null transactions.cleared_at on cleared set,
//     DELETE the recon row, revert accounts.last_reconciled_at/_balance to prior recon's values (or NULL)
//   - returns the new "latest" recon (or null if account has no prior recons)
export function rollbackRecon(reconId) { ... }

// cancelDraft(db, reconId) — DELETE behavior (same as before but moved here)
//   - status must be 'draft' or 'investigating' (the latter from old E.1 rows; new code never writes it)
//   - cascade-deletes clears, nulls transactions.cleared_at on cleared set, DELETE the row
export function cancelDraft(reconId) { ... }

// invalidateReconciliationOnMutation(db, txnId, mutationType, before, after)
//   - finds all reconciled recons that cleared this txn via reconciliation_clears
//   - marks each as stale=1 with stale_reason JSON blob and stale_at timestamp
//   - returns array of stale_recons (each: {recon_id, account_id, as_of_date}) for the API response
export function invalidateReconciliationOnMutation(txnId, mutationType, before, after) { ... }
```

**For `computeBooksBalance`:** the existing function in `server/routes/books/reconcile.js` (per E.1) is correct for the as_of_date model: sum of `journal_lines` for the account where `je.txn_date <= as_of_date`, MINUS any prior reconciled recon's `books_balance` for this account (so the current recon is responsible for only its own delta). Move this function into `reconciliation.js`.

**For `invalidateReconciliationOnMutation`:** here's the pre-mutation snapshot JSON shape (per spec §6.5):

```js
{
  type: 'amount_changed' | 'category_changed' | 'transaction_date_changed' | 'transaction_deleted',
  txn_id: 'abc...',
  before: { amount: -45.00, category_account_id: '6100', txn_date: '2026-06-15', ... other mutation-relevant fields },
  after:  { amount: -89.43, category_account_id: '6100', txn_date: '2026-06-15', ... } | null,
  at: '2026-07-04T18:00:00Z'
}
```

For each stale recon already flagged, the hook should **append** to existing `stale_reason` (comma-separated JSON blobs) rather than overwrite — multiple mutations on the same recon can accumulate. (Use a JSON-array envelope stored as TEXT, parse and re-stringify.)

### 1.3 `server/routes/books/reconcile.js` — rewrite

All handlers become thin wrappers around the service. Endpoints:

| Method | Path | Handler | New in E.2? |
|---|---|---|---|
| GET | `/reconcile` | `listAccountsWithReconStatus()` | modified — adds `last_reconciled_at`, `last_reconciled_balance` per account; `stale` flag; open-draft indicator |
| POST | `/reconcile` | `getOrCreateRecon()` | **modified** — body changes from `{account_id, period_start, period_end}` to `{account_id, as_of_date}` |
| GET | `/reconcile/:id` | `getReconDetail()` | **modified** — accepts `?include_past=1`; uses as_of_date for the filter (instead of period_end) |
| PATCH | `/reconcile/:id` | inline — updates statement_balance, notes only | status transitions REMOVED (no more 'investigating'); reconciliation is a clean state machine |
| POST | `/reconcile/:id/close` | `closeRecon()` | **NEW** |
| POST | `/reconcile/:id/rollback` | `rollbackRecon()` | **NEW** |
| DELETE | `/reconcile/:id` | `cancelDraft()` | **modified** — only valid for drafts (returns 404 for reconciled recons, telling caller to use rollback) |
| POST | `/reconcile/:id/clear` | inline | unchanged |
| DELETE | `/reconcile/:id/clear/:txn_id` | inline | unchanged |

**Backward-compat shim:** the E.1 server may have in-flight clients using `period_start` / `period_end` request bodies. Read code reads `as_of_date` only, write code rejects `period_start`/`period_end` outright (these are now deprecated). Document in your report: "old client paths will get 400 — the recent client fixes already use the new endpoint shape."

### 1.4 `server/routes/books/transactions.js` — mutation hooks

Wire `invalidateReconciliationOnMutation()` into every write path:

| Route | Mutation type | Pre-snapshot |
|---|---|---|
| `PATCH /transactions/:id` | `amount_changed` if `amount` differs, `category_changed` if `category_account_id` differs, `transaction_date_changed` if `txn_date` differs | the existing row's `{amount, category_account_id, txn_date}` |
| `POST /transactions/:id/keep-this` | `transaction_deleted` (for each txn deleted) | full txn row |
| `POST /transactions/:id/keep-original` | `transaction_deleted` (for each txn deleted) | full txn row |
| `DELETE /transactions/:id` (if exists) | `transaction_deleted` | full txn row |

Implementation pattern in each handler:

```js
// Before mutation:
const before = db.prepare('SELECT ... FROM transactions WHERE id = ?').get(txnId);

// Apply mutation:
db.prepare('UPDATE transactions SET ... WHERE id = ?').run(...);

// After mutation:
const warnings = invalidateReconciliationOnMutation(txnId, 'amount_changed', before, after);
// Or for deletes:
const warnings = invalidateReconciliationOnMutation(txnId, 'transaction_deleted', before, null);

return res.json({ ...updatedTxn, reconciliation_warnings: warnings });
```

**Edge case: FK-cascade deletion.** When `keep-this` / `keep-original` deletes a parent txn that has child txns (via FK CASCADE), the mutation hook must run for EACH deleted child. Implementation: write a small helper that takes a list of deleted txn IDs and runs the hook per ID.

**Important: do not double-fire.** If the existing logic does its own UPDATE/DELETE chain internally (e.g., clears FK pointers before deleting), the hook should only fire for the *final* state — after all the logic settles. Read the existing `keep-this` / `keep-original` code carefully.

---

## L2 — Reconcile UI (`client/src/books/Reconcile.jsx`)

This is a substantial rewrite. Map the spec's §7 and §6.5 (stale UI) onto the existing component.

### 2.1 Account select screen (`/books/reconcile`)

- Each account row shows: account name/code, **last_reconciled_at** + **last_reconciled_balance** (from the API's `last_reconciled_at` field), status pill, Reconcile button.
- Status pill states: `Reconciled as of {date}` (green) | `In progress` (slate) | `⚠ stale` (red). The stale pill appears when ANY recon for the account is stale (use the existing GET response field).
- "Reconcile" button on a stale account still works (the user can click it to see the banner) — but the form below is gated.

### 2.2 Start reconciliation form

- New recon: as_of_date input (date picker), optional statement_balance input, **Start reconciliation** button.
- Existing draft for this account: "Continue reconciliation or Cancel and delete" choice.
- Existing reconciled recon (not stale): "Reconciliation up to {as_of_date}. Start new reconciliation." with last_reconciled_balance shown.

### 2.3 Working reconciliation view

The existing two-pane layout stays:
- **Left (Uncleared):** txns with txn_date <= as_of_date not covered by any prior reconciled recon.
- **Right (Cleared + running balance):** reconciliation_clears rows for this recon.

**New in this view:**
- **Include past as_of_date toggle** — when on, also show txns with txn_date > as_of_date in the left pane.
- **Reconcile button** gated on diff == 0. Disabled otherwise, with tooltip "Statement balance must match books balance." Click → POST /close → on success, navigate back to account list; on failure (DIFF_NOT_ZERO), surface error inline.

### 2.4 Stale banner (the load-bearing UI)

Shown at the top of the reconcile page when the account's latest recon has `stale=1`:

```
┌─────────────────────────────────────────────────────────┐
│ ⚠ Beginning balance is off                              │
│ Recent changes have created a discrepancy in this       │
│ account's beginning balance.                             │
│ [See what has changed]    (link, expansion toggle)        │
└─────────────────────────────────────────────────────────┘
```

When the link is clicked, expand below:

```
┌─────────────────────────────────────────────────────────┐
│ ⚠ Beginning balance is off                              │
│ Recent changes have created a discrepancy in this       │
│ account's beginning balance.                             │
│ [Hide what has changed]                                  │
│                                                          │
│ Date        Description       Original    Current        │
│ 2026-06-15  JOANN STORE        -45.00     -89.43  ▶     │  ← click row → editor
│ 2026-06-20  PAYMENT            -100.00    (deleted) ▶    │
└─────────────────────────────────────────────────────────┘
```

Each row in the expanded list is `button`-ish (cursor: pointer, hover state), and clicking opens the transaction editor (§L3) pre-populated.

### 2.5 Rollback button + modal

**When to show:** only on the account select screen (or top of the page when the latest recon is `reconciled`).

**Visibility rule:**
- Latest recon is `reconciled` AND `stale=0`: show "Roll back previous reconciliation" button.
- Latest recon is `reconciled` AND `stale=1`: still show the button (rollback resolves staleness too — rollback then walk-back if needed).
- Latest recon is `draft`: don't show (use the cancel-and-delete path).
- No recon: don't show.

**Click → confirmation modal:**
- Heading: "Roll back reconciliation"
- Body: "This will remove the reconciliation as of {as_of_date}. {N} cleared transactions will be marked uncleared. The account's last reconciliation will revert to {previous_as_of_date} (balance: ${X.XX}). You will need to redo this reconciliation from scratch."
- Buttons: **Confirm rollback** (primary, red) / **Cancel**

On confirm → POST /rollback → on success, refetch the account list (the prior recon is now visible as the latest). On error, surface the error inline.

### 2.6 Walk-back (covered implicitly)

No special UI for walk-back — the user just clicks "Roll back previous reconciliation" again on the now-revealed prior recon. Each click is one decision. No chained rollback needed.

---

## L3 — Transaction Editor (NEW component)

**Where:** `client/src/books/TransactionEditor.jsx` (new file). Reusable; not a page.

**Entry points:**

1. **From any transaction list** — Categorization (Pending/Auto-categorized/Excluded tabs), Reconcile working view, future per-account transaction lists. Pass the txn id; the row expands inline with the editor below.
2. **From stale banner offending list** — same component, opened by clicking a row in the expanded list.

**Behavior:**

- Renders inline (not a modal) below the row.
- Form fields: txn_date, vendor/customer, amount, account dropdown, memo, near_duplicate_of, status.
- Read-only: cleared_at shown as "Reconciled: yes, as of 2026-06-30" / "no".
- **Save** button → PATCH /transactions/:id; on success, collapses the row, refreshes the parent list (so the user sees the new value).
- **Discard** button → reverts the form to last-saved values, no server call.
- **No "restore" or "revert" button.** The user manually types the correct value. (Per Patrick 2026-07-04 17:56 MDT.)

**Mutation-triggered warning UI:**

When Save returns non-empty `reconciliation_warnings`, the editor shows an inline alert panel:

```
┌─────────────────────────────────────────────────────────┐
│ ⚠ This change affects reconciliation                    │
│ Reconciliation for "Chase Business Checking" as of       │
│ 2026-06-30 has been marked stale.                        │
│ [View reconciliation]                                    │
└─────────────────────────────────────────────────────────┘
```

User can dismiss the alert (acknowledging) or click through to the affected account's reconcile page.

**Component API (just enough — extend as needed):**

```jsx
<TransactionEditor
  txnId={txn.id}
  onSave={(updatedTxn) => { /* parent re-renders with new data */ }}
  onCancel={() => { /* parent collapses the editor */ }}
  showMutationContext={boolean}  // when true, show the read-only "Reconciled: yes/no, as of {date}" line
  preMutationSnapshot={object|null}  // when provided (stale-banner entry), show side-by-side comparison
/>
```

If `preMutationSnapshot` is provided, render a small comparison strip above the editor showing the snapshot vs current in muted text: "Original amount: -45.00. Current amount: -89.43. Editing amount to restore: -45.00." This is informational only — no button.

---

## L4 — Visual confirmation (smoke tests)

All L2/L3 UI changes need browser-driven smoke. Save Playwright artifacts at `~/clawd/projects/task-manager/docs/books/qa/runs/2026-07-04/VB-REC-STALE/` (banner/pill tests) and `VB-TXN-EDIT/` (editor tests).

Required smoke (subset; full behaviors in QA.md):

- [ ] Account list shows last_reconciled_at + last_reconciled_balance for reconciled accounts.
- [ ] Account list shows stale pill on an account with stale=1 recons.
- [ ] Open account → see banner if stale → expand → click row → editor opens.
- [ ] Editor: edit amount → Save → parent list shows new amount; reconciliation_warnings alert visible if any.
- [ ] Editor: Discard → form reverts, no server call.
- [ ] Editor: cleared_at shown read-only as "Reconciled: yes, as of {date}".
- [ ] Reconcile button disabled when diff != 0; enabled when diff == 0.
- [ ] Rollback button + modal: confirm → recon gone, account list updated.
- [ ] Walk-back: two reconciled recons for an account → rollback → second is now latest → rollback again → prior is latest.
- [ ] `include_past` toggle adds late-posting txns to left pane.
- [ ] Mutation hook: edit a cleared txn's amount via editor → PATCH response includes reconciliation_warnings → stale=1 on the recon.
- [ ] Mutation hook: delete via keep-this → same.
- [ ] Mutation hook: edit description (vendor) → no warnings come back (description is not a mutation).

---

## L5 — Backup, build, restart

Pre-flight (Hard Rule #3 + #1):

```bash
cd ~/clawd/projects/task-manager
cp data/tasks.db data/backups/tasks-pre-e2-$(date +%s).db
cp data/tasks.db-shm data/backups/tasks-pre-e2-$(date +%s).db-shm 2>/dev/null || true
cp data/tasks.db-wal data/backups/tasks-pre-e2-$(date +%s).db-wal 2>/dev/null || true
```

Build:
```bash
cd client && npm run build
```

Service: dev server is running (HMR); client picks up changes. Restart only if needed.

---

## L6 — Report

Write `docs/books/CINDER_REPORT_E2.md`. Required sections:

1. **TL;DR + verdict** (SHIP or NEEDS-FIX).
2. **Backup & rollback trail** — what backups exist, how to restore.
3. **Migration diff** — db.js schema changes (inline), reconcile.js rewrite (line counts + key logic excerpts), transactions.js mutation hooks (per-route summary).
4. **Per-layer build details** — L1 (services + routes), L2 (Reconcile.jsx), L3 (TransactionEditor.jsx). Inline code excerpts for any non-trivial logic.
5. **Smoke tests** — Playwright + curl outputs.
6. **Test coverage** — REQUIRED. Use the format from `qa/templates/CINDER_BRIEF_TEMPLATE.md`. List every VB-REC-* (REC-12 through REC-41) and VB-TXN-EDIT-* (TXN-EDIT-01 through TXN-EDIT-10) that this build addresses. Rusty folds these into qa/QA.md after delivery.
7. **Open follow-ups** — anything you noticed but didn't fix.

---

## Estimated ETA: 90-120 min

If you run over, **stop and surface** rather than shipping something half-broken. Worst case: backend ships, Reconcile UI ships, TransactionEditor ships as a stub that re-uses the existing PATCH endpoint without the inline-edit polish — and the report flags what's degraded. But the gate logic, mutation hook, and stale UI are non-negotiable for this build to count as E.2.

---

## What gets verified by Echo + Wren after this lands

This is a big build, so the post-Cinder gate is similarly larger:

- **Wren spot-check** — light review (15-20 min) covering: schema migration idempotency, mutation hook firing on every write path, the rollback atomicity (especially the cascade-revert of accounts.last_reconciled_*).
- **Echo full pass** — VB-REC-12 through VB-REC-41 (22 behaviors) + VB-TXN-EDIT-01 through TXN-EDIT-10 (10 behaviors). 32 behaviors total in this scope.

This is the largest Wren + Echo backfill in the project so far. Plan for it.

---

*Brief author: Rusty ⚙️ | Spec: ACCOUNTING-E2.md v4*
