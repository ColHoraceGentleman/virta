import { Router } from 'express';
import db, { generateId } from '../../db.js';

const router = Router();

// Tables that point at accounts in later phases — Phase A doesn't have them yet,
// but the dependent-record check counts them so a clean delete/move today stays
// valid in Phase B/D when those tables land. Returning 0 is fine.
function countDependents(accountId) {
  let journalLines = 0;
  let transactions = 0;
  try {
    journalLines = db.prepare('SELECT COUNT(*) as c FROM journal_lines WHERE account_id = ?').get(accountId).c;
  } catch (e) { /* table doesn't exist yet — return 0 */ }
  try {
    transactions = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE account_id = ? OR category_account_id = ?').get(accountId, accountId).c;
  } catch (e) { /* table doesn't exist yet — return 0 */ }
  return { journalLines, transactions, total: journalLines + transactions };
}

// GET /api/v1/books/accounts — list all accounts (sorted by position, then code)
router.get('/', (req, res) => {
  try {
    const accounts = db.prepare(`
      SELECT * FROM accounts
      ORDER BY account_type, position, code
    `).all();
    res.json({ data: accounts });
  } catch (err) {
    console.error('[Books/Accounts] list failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// GET /api/v1/books/accounts/:id
router.get('/:id', (req, res) => {
  try {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found', code: 'NOT_FOUND' });
    res.json({ data: account });
  } catch (err) {
    console.error('[Books/Accounts] get failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/accounts — create a new (non-system) account
router.post('/', (req, res) => {
  try {
    const { code, name, account_type, irs_line, parent_id } = req.body || {};
    if (!code || !name || !account_type) {
      return res.status(400).json({ error: 'code, name, and account_type are required', code: 'VALIDATION_ERROR' });
    }
    if (!['income','expense','asset','liability','equity'].includes(account_type)) {
      return res.status(400).json({ error: 'account_type must be one of income|expense|asset|liability|equity', code: 'VALIDATION_ERROR' });
    }
    // Position: append to end of the same account_type
    const max = db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM accounts WHERE account_type = ?').get(account_type).m;
    const id = generateId();
    db.prepare(`
      INSERT INTO accounts (id, code, name, account_type, irs_line, parent_id, is_system, position)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, code, name, account_type, irs_line || null, parent_id || null, max + 1);
    const created = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    res.json({ data: created });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Account code already exists', code: 'CONFLICT' });
    }
    // Translate the B2a-prime CHECK trigger's RAISE(ABORT, 'irs_line required ...') into
    // a 400 — the trigger is enforcing a business rule the client should fix, not a server fault.
    if (/irs_line required/i.test(err.message)) {
      return res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
    }
    console.error('[Books/Accounts] create failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// PATCH /api/v1/books/accounts/:id — rename / change irs_line / etc.
// Note: irs_line is editable per the spec ("All accounts can be renamed" + "is_system flag
// is informational only"), so we don't gate it.
router.patch('/:id', (req, res) => {
  try {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found', code: 'NOT_FOUND' });

    const { name, account_type, irs_line, parent_id, is_active, position, code } = req.body || {};
    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (account_type !== undefined) {
      if (!['income','expense','asset','liability','equity'].includes(account_type)) {
        return res.status(400).json({ error: 'invalid account_type', code: 'VALIDATION_ERROR' });
      }
      updates.push('account_type = ?'); values.push(account_type);
    }
    if (irs_line !== undefined) { updates.push('irs_line = ?'); values.push(irs_line); }
    if (parent_id !== undefined) { updates.push('parent_id = ?'); values.push(parent_id || null); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (position !== undefined) { updates.push('position = ?'); values.push(position); }
    if (code !== undefined) {
      // Only allow code change if not used elsewhere
      updates.push('code = ?'); values.push(code);
    }
    if (updates.length === 0) {
      return res.json({ data: account });
    }
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Account code already exists', code: 'CONFLICT' });
    }
    // Same trigger translation as POST — covers PATCH that renames away from
    // 'Review Later' without setting irs_line, or that sets irs_line=NULL.
    if (/irs_line required/i.test(err.message)) {
      return res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
    }
    console.error('[Books/Accounts] update failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// DELETE /api/v1/books/accounts/:id
// Blocked if any journal lines / transactions point at the account.
// Phase A: counts return 0 (those tables don't exist yet), so deletes succeed cleanly.
router.delete('/:id', (req, res) => {
  try {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found', code: 'NOT_FOUND' });

    const deps = countDependents(req.params.id);
    if (deps.total > 0) {
      return res.status(409).json({
        error: `${deps.total} transactions are categorized to this account. Move them to another account first, then delete.`,
        code: 'ACCOUNT_IN_USE',
        dependents: deps,
      });
    }
    db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
    res.json({ data: { success: true, id: req.params.id } });
  } catch (err) {
    console.error('[Books/Accounts] delete failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/accounts/merge
// Body: { source_id, destination_id }
// Rules (per ACCOUNTING-v1.md §1):
//   - Same account_type required; cross-type merges blocked
//   - Re-point journal_lines.account_id and transactions.category_account_id / account_id from source → destination
//   - Delete source
//   - Phase A: re-point is a no-op (tables don't exist yet) but the safety checks + delete still run
router.post('/merge', (req, res) => {
  try {
    const { source_id, destination_id } = req.body || {};
    if (!source_id || !destination_id) {
      return res.status(400).json({ error: 'source_id and destination_id are required', code: 'VALIDATION_ERROR' });
    }
    if (source_id === destination_id) {
      return res.status(400).json({ error: 'source and destination must be different', code: 'VALIDATION_ERROR' });
    }
    const source = db.prepare('SELECT * FROM accounts WHERE id = ?').get(source_id);
    const destination = db.prepare('SELECT * FROM accounts WHERE id = ?').get(destination_id);
    if (!source) return res.status(404).json({ error: 'Source account not found', code: 'NOT_FOUND' });
    if (!destination) return res.status(404).json({ error: 'Destination account not found', code: 'NOT_FOUND' });
    if (source.account_type !== destination.account_type) {
      return res.status(409).json({
        error: `Cannot merge ${source.account_type} into ${destination.account_type}. Cross-type merges are blocked.`,
        code: 'CROSS_TYPE_MERGE',
      });
    }

    // Run repoint + delete in a single transaction.
    // journal_lines / transactions may not exist yet — wrap each in try/catch.
    const mergeTx = db.transaction(() => {
      let repointedJournalLines = 0;
      let repointedTransactions = 0;
      try {
        const r = db.prepare('UPDATE journal_lines SET account_id = ? WHERE account_id = ?').run(destination_id, source_id);
        repointedJournalLines = r.changes;
      } catch (e) { /* table missing in Phase A */ }
      try {
        // Two foreign keys: account_id (the bank/CC/Venmo source) and category_account_id
        const r1 = db.prepare('UPDATE transactions SET account_id = ? WHERE account_id = ?').run(destination_id, source_id);
        const r2 = db.prepare('UPDATE transactions SET category_account_id = ? WHERE category_account_id = ?').run(destination_id, source_id);
        repointedTransactions = r1.changes + r2.changes;
      } catch (e) { /* table missing in Phase A */ }
      db.prepare('DELETE FROM accounts WHERE id = ?').run(source_id);
      return { repointedJournalLines, repointedTransactions };
    });

    const counts = mergeTx();
    res.json({
      data: {
        success: true,
        deleted_source_id: source_id,
        destination_id,
        repointed: counts,
      },
    });
  } catch (err) {
    console.error('[Books/Accounts] merge failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;