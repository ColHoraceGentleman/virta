// Virta Books — F1 helper: orphan-safe delete for a transaction and its
// journal entries.
//
// The actual safety is the FK CASCADE on journal_entries.source_id (added
// in the F1 migration): deleting a transactions row cascades to its
// journal_entries, which in turn cascade to their journal_lines. This
// helper is a thin discoverable wrapper so future delete paths can call
// `deleteTransaction(id)` instead of hand-rolling loops over journal_entries.
//
// The wrapper also opens the door to future audit logging, soft-delete, or
// pre-delete hooks without touching every call site.
//
// Wrapped in db.transaction() to make the DELETE atomic at the better-sqlite3
// layer (single statement today, multi-statement when hooks are added).
import db from '../db.js';

export function deleteTransaction(id) {
  const tx = db.transaction(() => {
    const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return result.changes;
  });
  return tx();
}
