# Cinder Brief — F1: Orphan-safe delete for journal_entries

**Goal:** Make `journal_entries.source_id` a real FK so any delete of a transaction (or invoice) automatically cascades its journal entry, preventing future manual delete paths from leaking orphans. Provide one helper that all delete sites use going forward.

**Read first:**
1. This brief (you're here).
2. `~/clawd/projects/accounting-app/ECHO_REPORT_C_DEDUPE.md` — finding **F1** is the rationale (~mid-report, "Findings Not Blocking Ship").
3. `~/clawd/projects/task-manager/server/db.js` lines 95-130 (`categories` migration, your prior pattern for adding constraints via DROP/CREATE/RENAME).
4. `~/clawd/projects/accounting-app/server/routes/books/transactions.js` lines 257-296 (current resolve-duplicate delete logic).

**Why this matters:**
- Right now, `journal_entries.source_id` is `TEXT` with no FK. Deleting a transaction works *only* because `transactions.js` resolve-duplicate carefully does `SELECT id FROM journal_entries WHERE source='transaction_import' AND source_id=?` then deletes them. The `journal_lines` cascade from there.
- If anyone tomorrow writes a new "delete a transaction" path (e.g., bulk cleanup, restore, sync-delete from CSV re-import), they'll forget the journal step and leave orphan journal entries that Phase D's reports will pick up.
- The fix: real FK + ON DELETE CASCADE on the FK, plus one helper that everyone uses. Then there's no way to delete a transaction without also cleaning up its journal entries.

**Constraint to honor:**
- Follow your existing migration pattern (`db.js` ~L95-130, the `categories` table rebuild for UNIQUE → per-project UNIQUE). Same shape: detect old schema → DROP TABLE → CREATE TABLE _new → INSERT → RENAME → COMMIT.

**Scope and what NOT to touch:**
- ✅ Add FK constraint on `journal_entries.source_id` (typed appropriately per source).
- ✅ Provide `deleteTransaction(id)` and `deleteInvoice(id)` helpers (or a single `deleteSourceRow(source, id)`) in a new service file or `server/services/`.
- ✅ Convert the two existing delete sites to use the helper: `transactions.js` lines 268 and 280.
- ❌ Don't rewrite `transactions.js`. Don't change the resolve-duplicate API. Don't add new features. Don't refactor unrelated code.

---

## Migration spec

### Constraint

Add to `journal_entries.source_id`:
```sql
REFERENCES transactions(id) ON DELETE CASCADE
```
Conditional: only applies when `source = 'transaction_import'`. SQLite doesn't support partial FKs in CHECK-form the way Postgres does — but **better-sqlite3 does honor partial FKs via the column CHECK with a trigger**, or we can use a separate column.

**Decision:** use the simplest pattern that *works* — make `source_id` a real FK to `transactions(id)` always. But that breaks invoice-payments, because invoice IDs live in `invoices.id`, not `transactions.id`.

Three options:

**Option A (recommended).** Two FK columns via a row-id discriminator. Probably overkill for one column.

**Option B (cleanest practical).** Keep `source_id` as TEXT (no FK), but add a **trigger** that prevents `DELETE FROM transactions` unless all `journal_entries WHERE source='transaction_import' AND source_id=?` rows are deleted in the same transaction. This forces the helper to be used and makes "manual deletes" fail loudly instead of silently leaking.

**Option C (real FK, two columns).** Add `transaction_source_id TEXT REFERENCES transactions(id) ON DELETE CASCADE` and an `invoice_source_id TEXT REFERENCES invoices(id) ON DELETE CASCADE`. Migrate existing `source_id` data into the right column based on `source` enum. App code reads from the right one based on `source`.

**Recommended: Option B.** It's the smallest migration, catches the failure mode (orphan journal entries), and is one trigger + one helper. Two reasons B beats C: (1) invoices have their own ON DELETE cascade potential to be wired separately when needed, (2) Option C breaks every existing read of `source_id` in the codebase.

### Migration body (drop into `db.js` next to the existing `journal_entries` safeExec)

```js
// F1 migration: orphan-safe delete for journal_entries.
// Detect via PRAGMA — if the trigger doesn't exist, add it.
{
  const triggers = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='trigger' AND name='journal_entries_block_orphan_txn'
  `).all();
  if (triggers.length === 0) {
    safeExec(`
      CREATE TRIGGER journal_entries_block_orphan_txn
      BEFORE DELETE ON transactions
      BEGIN
        SELECT RAISE(ABORT, 'Cannot DELETE from transactions: use deleteTransaction() helper. Orphan journal_entries would result.')
        WHERE EXISTS (
          SELECT 1 FROM journal_entries
          WHERE source = 'transaction_import' AND source_id = OLD.id
        );
      END;
    `);
  }
}
```

Wait — better to *not* block the delete but to *automatically cascade*. Add a real cascade via separate FK column. Reconsidering:

**Option D (the right one).** Use the categories pattern: rebuild `journal_entries` with the FK constraint baked in.

```js
// F1 migration: make source_id a real FK (when source='transaction_import').
// Detect by checking if the existing table lacks FK on source_id.
{
  const journalSchema = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'
  `).get();
  const hasFK = journalSchema && /source_id\s+TEXT\s+REFERENCES\s+transactions/i.test(journalSchema.sql);
  if (!hasFK) {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE journal_entries_new (
        id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        txn_date     TEXT NOT NULL,
        description  TEXT NOT NULL,
        source       TEXT NOT NULL CHECK (source IN ('transaction_import','manual','invoice_payment')),
        source_id    TEXT REFERENCES transactions(id) ON DELETE CASCADE,
        created_at   TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO journal_entries_new (id, txn_date, description, source, source_id, created_at)
        SELECT id, txn_date, description, source, source_id, created_at
        FROM journal_entries;
      DROP TABLE journal_entries;
      ALTER TABLE journal_entries_new RENAME TO journal_entries;
      CREATE INDEX idx_journal_entries_source ON journal_entries(source, source_id);
      COMMIT;
    `);
  }
}
```

The `journal_lines.entry_id REFERENCES journal_entries(id) ON DELETE CASCADE` is already in place (verified — line ~30 of `journal_lines` schema), so once `journal_entries` cascade-deletes, the lines cascade too. Three-table cascade: txn delete → journal_entries cascade → journal_lines cascade.

**Why this works:**
- ON DELETE CASCADE is the SQLite-native mechanism.
- Migration is wrapped in a transaction (your established pattern).
- It auto-runs `db.transaction()` so the helper can become a simple `DELETE FROM transactions WHERE id = ?`.
- A delete that "forgets" the journal entries is now structurally impossible — DB rejects it.

**Tradeoff noted for Patrick's awareness:** SQLite only enforces FKs when `PRAGMA foreign_keys = ON`. That pragma is already set in `db.js` (line 18). Verify it's still set after your change.

**Verification sanity:**
- `PRAGMA foreign_keys;` → 1 (ON)
- `PRAGMA foreign_key_list(journal_entries);` → shows `transactions` table with `ON DELETE CASCADE`

---

## New helper

Create `server/services/journalHelpers.js` (or `server/services/transactions.js` if it fits your existing layout — your call, match your convention):

```js
// F1 helper: delete a transaction and atomically clean up its journal entries.
// Wraps both in db.transaction() for atomicity; lines cascade via FK from journal_entries.
export function deleteTransaction(id) {
  const tx = db.transaction(() => {
    const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return result.changes;
  });
  return tx();
}
```

Then add a parallel one for invoice payments when that becomes relevant (not in this scope).

Replace the two sites in `transactions.js`:

```js
// Around L268 (keep_this branch):
db.prepare(`DELETE FROM transactions WHERE id = ?`).run(originalId);
// becomes:
deleteTransaction(originalId);

// Around L280 (keep_original branch):
db.prepare(`DELETE FROM transactions WHERE id = ?`).run(req.params.id);
// becomes:
deleteTransaction(req.params.id);
```

Imports: add `import { deleteTransaction } from '../../services/journalHelpers.js'` at top of `transactions.js` (or wherever the import path resolves).

---

## What you test

1. **Pre-migration:** snapshot DB with `cp data/tasks.db data/backups/tasks-pre-f1-$(date +%s).db`.
2. **Run migration:** restart service (`launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager`).
3. **Verify schema:**
   - `sqlite3 data/tasks.db "PRAGMA foreign_key_list(journal_entries);"` → 1 row, `table=transactions`, `on_delete=CASCADE`.
   - `sqlite3 data/tasks.db "SELECT COUNT(*) FROM journal_entries;"` → 7 (preserved).
   - `PRAGMA foreign_keys;` → 1.
4. **Smoke tests:**
   - Pick a transaction (any of the 13) that has a `source='transaction_import'` journal entry. Run `deleteTransaction(id)`. Verify: txn gone + journal_entries gone + journal_lines gone.
   - Pick a *categorize-only* transaction (one with a journal entry but no near-dup action). Update its category, then `deleteTransaction(id)`. Same — all three cascade.
   - Hit `POST /api/v1/books/transactions/:id/resolve-duplicate` with `action=keep_this` on a synthetic near-dup pair (use the existing near-dup test setup from Echo's session, or create one with `near_duplicate_of`). Verify the original + its journal entries vanish cleanly.
5. **Negative test:** directly run `DELETE FROM transactions WHERE id='whatever'`. Should still work (DELETE alone doesn't fail; cascade kicks in). This proves the migration works for *any* future code path.

## Out of scope

- Don't add a delete for invoice payments; not needed yet.
- Don't change `keep_both` — it doesn't delete anything.
- Don't refactor the resolve-duplicate endpoint beyond the helper swap.

## Deliverable

Apply the changes. Run smoke tests. Report back via `CINDER_REPORT_F1.md` with:
- Migration diff (lines added/removed in `db.js`, `transactions.js`, new service file).
- Output of `PRAGMA foreign_key_list(journal_entries);`
- Output of 3 smoke tests.
- One-line summary at the top: "F1 done; deleteTransaction() helper live; FK verified."

Use `minimax/MiniMax-M3` (your default). Take a backup first. Stay focused: this is a 20-30 min pass for you, not a feature build.

If you find any incompatibilities or the migration breaks something unexpected, STOP and surface to Rusty before proceeding.
