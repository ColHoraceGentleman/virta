import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'tasks.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function safeExec(sql) {
  try { db.exec(sql); } catch (e) { console.warn('[DB] safeExec ignored:', e.message); }
}

// Core schema — only CREATE IF NOT EXISTS
safeExec(`
  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL,
    description TEXT,
    color       TEXT DEFAULT '#6366f1',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  )
`);
safeExec(`
  CREATE TABLE IF NOT EXISTS columns (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    position   REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);
safeExec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    column_id   TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    due_date    TEXT,
    priority    TEXT CHECK(priority IN ('low','medium','high','urgent')) DEFAULT 'medium',
    position    REAL NOT NULL DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  )
`);
safeExec(`
  CREATE TABLE IF NOT EXISTS task_notes (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);
safeExec(`
  CREATE TABLE IF NOT EXISTS calendar_events (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    google_event_id TEXT NOT NULL,
    calendar_id     TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now'))
  )
`);
safeExec(`
  CREATE TABLE IF NOT EXISTS google_credentials (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    access_token  TEXT,
    refresh_token TEXT,
    token_expiry  TEXT
  )
`);

// Categories table — drop old per-column auto-indexes first (legacy from when name was UNIQUE).
// SQLite can't DROP CONSTRAINT, so we handle indexes directly.
safeExec('DROP INDEX IF EXISTS sqlite_autoindex_categories_1');
safeExec('DROP INDEX IF EXISTS sqlite_autoindex_categories_2');

// Migration: drop global UNIQUE on categories.name, enforce UNIQUE(name, project_id).
// Old schema had `name TEXT NOT NULL UNIQUE` (table-level). The table-level UNIQUE
// is implemented as an auto-index that SQLite refuses to drop explicitly. We avoid
// that pitfall by NOT touching the auto-indexes — they go away when we DROP TABLE
// the old categories table. One-shot: re-runs are skipped because the conditional
// no longer matches.
{
  const categoriesSchema = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type='table' AND name='categories'
  `).get();
  if (categoriesSchema && /name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(categoriesSchema.sql)) {
    console.log('Migrating categories: removing global UNIQUE on name, enforcing per-project UNIQUE');
    db.exec(`
      BEGIN TRANSACTION;

      -- Drop our own composite index (safe). Auto-indexes backing the table-level UNIQUE
      -- are NOT dropped here — they will be removed implicitly when we DROP TABLE categories.
      DROP INDEX IF EXISTS idx_categories_name_project;

      -- Recreate table without UNIQUE on name
      CREATE TABLE categories_new (
        id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name       TEXT NOT NULL,
        color      TEXT NOT NULL DEFAULT '#6366f1',
        created_at TEXT DEFAULT (datetime('now')),
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        position   REAL DEFAULT 0
      );

      -- Preserve all rows. Any existing NULL project_id is backfilled to the Personal project
      -- (ca272e5f2aa23e801b54fa09e48852a7) so the composite UNIQUE has a value for every row.
      INSERT INTO categories_new (id, name, color, created_at, project_id, position)
        SELECT id, name, color, created_at,
               COALESCE(project_id, 'ca272e5f2aa23e801b54fa09e48852a7'),
               COALESCE(position, 0)
        FROM categories;

      DROP TABLE categories;
      ALTER TABLE categories_new RENAME TO categories;

      -- Per-project unique index (the only UNIQUE on categories now)
      CREATE UNIQUE INDEX idx_categories_name_project ON categories(name, project_id);

      COMMIT;
    `);
  }
}

// Categories table (fresh DBs land here; existing DBs are handled by the migration above)
safeExec(`
  CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now')),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    position   REAL DEFAULT 0
  )
`);

// Composite unique on (name, project_id) — allows same category name across projects
safeExec('CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_project ON categories(name, project_id)');

// Task attachments table
safeExec(`
  CREATE TABLE IF NOT EXISTS task_attachments (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    mimetype    TEXT,
    size_bytes  INTEGER,
    stored_path TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  )
`);

// Subtasks table — first-class children of tasks. v6.
// Idempotent: safe on every server boot. NO recurring / parent_subtask_id yet,
// but the schema leaves room (a subtask is just a row keyed by task_id).
safeExec(`
  CREATE TABLE IF NOT EXISTS subtasks (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    due_date     TEXT,
    completed    INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    position     REAL NOT NULL DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  )
`);

// =====================================================================
// Virta Books — Phase A (Foundation)
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Schema mirrors ACCOUNTING-v1.md §1 (accounts) and §2 (customers).
// =====================================================================

// Chart of accounts
safeExec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    code          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    account_type  TEXT NOT NULL CHECK (account_type IN ('income','expense','asset','liability','equity')),
    irs_line      TEXT,
    parent_id     TEXT REFERENCES accounts(id),
    is_active     INTEGER NOT NULL DEFAULT 1,
    is_system     INTEGER NOT NULL DEFAULT 0,
    position      REAL NOT NULL DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  )
`);
safeExec('CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(code)');
safeExec('CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type)');
safeExec('CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_id)');

// Customers
safeExec(`
  CREATE TABLE IF NOT EXISTS customers (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT NOT NULL,
    company         TEXT,
    email           TEXT,
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    state           TEXT,
    postal          TEXT,
    country         TEXT,
    payment_terms   TEXT DEFAULT 'Net 30',
    notes           TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  )
`);
safeExec('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)');
safeExec('CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)');

// =====================================================================
// Virta Books — Phase B (Invoicing)
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Schema mirrors ACCOUNTING-v1.md §3: invoices, line_items, payments.
// All CREATE TABLE / CREATE INDEX statements are idempotent.
// =====================================================================

// Invoices — see ACCOUNTING-v1.md §3
safeExec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    customer_id  TEXT NOT NULL REFERENCES customers(id),
    number       TEXT NOT NULL UNIQUE,
    issue_date   TEXT NOT NULL,
    due_date     TEXT NOT NULL,
    payment_terms TEXT NOT NULL DEFAULT 'Net 30',
    status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','void')),
    subtotal     REAL NOT NULL DEFAULT 0,
    tax          REAL NOT NULL DEFAULT 0,
    total        REAL NOT NULL DEFAULT 0,
    notes        TEXT,
    sent_at      TEXT,
    paid_at      TEXT,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  )
`);
safeExec('CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)');
safeExec('CREATE INDEX IF NOT EXISTS idx_invoices_status   ON invoices(status)');
safeExec('CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date)');

// Idempotent migration: add `overdue_notified_at` to invoices so the overdue cron can
// stamp each invoice after a successful notification email — B3 fix prevents re-emailing
// the same customer every day. SQLite has no `ADD COLUMN IF NOT EXISTS`, so we gate on a
// PRAGMA table_info check. Safe to run on every boot.
{
  const invCols = db.prepare('PRAGMA table_info(invoices)').all().map(c => c.name);
  if (!invCols.includes('overdue_notified_at')) {
    try { db.exec("ALTER TABLE invoices ADD COLUMN overdue_notified_at TEXT"); } catch { /* ignore */ }
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_invoices_overdue_notified ON invoices(overdue_notified_at)"); } catch { /* ignore */ }
  }
}

// Line items — see ACCOUNTING-v1.md §3
safeExec(`
  CREATE TABLE IF NOT EXISTS line_items (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    invoice_id  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    position    REAL NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    quantity    REAL NOT NULL,
    unit_price  REAL NOT NULL,
    amount      REAL NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  )
`);
safeExec('CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON line_items(invoice_id)');

// Payments — see ACCOUNTING-v1.md §3
safeExec(`
  CREATE TABLE IF NOT EXISTS payments (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    invoice_id  TEXT NOT NULL REFERENCES invoices(id),
    paid_on     TEXT NOT NULL,
    method      TEXT,
    amount      REAL NOT NULL,
    reference   TEXT,
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )
`);
safeExec('CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id)');

// Settings — single-row table (id = 1). Captures invoicing settings:
// auto-mark-overdue toggle, overdue notification message, business identity,
// and SMTP config (host/port/user/from_email — NOT password; password lives
// in macOS Keychain via security find-generic-password).
// Idempotent: idempotent CREATE TABLE.
safeExec(`
  CREATE TABLE IF NOT EXISTS settings_invoices (
    id                       INTEGER PRIMARY KEY CHECK (id = 1),
    auto_mark_overdue        INTEGER NOT NULL DEFAULT 0,
    overdue_message          TEXT,
    business_name            TEXT,
    business_email           TEXT,
    social_handle            TEXT,
    smtp_host                TEXT,
    smtp_port                INTEGER,
    smtp_user                TEXT,
    smtp_from_email          TEXT,
    smtp_keychain_service    TEXT DEFAULT 'com.virta.books.smtp',
    updated_at               TEXT DEFAULT (datetime('now'))
  )
`);
// Seed the single settings row if it doesn't exist.
{
  const settingsExists = db.prepare('SELECT COUNT(*) as c FROM settings_invoices WHERE id = 1').get().c;
  if (settingsExists === 0) {
    db.prepare(`
      INSERT INTO settings_invoices (id) VALUES (1)
    `).run();
  }
}

// =====================================================================
// Virta Books — Phase C (Import + Categorization)
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Schema mirrors ACCOUNTING-v1.md §5 + §6:
//   transactions, vendor_rules, csv_source_mappings, journal_entries, journal_lines
// All CREATE TABLE / CREATE INDEX statements are idempotent.
// =====================================================================

// Transactions — imported bank/CC/PayPal/Venmo rows, before categorization.
safeExec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    account_id          TEXT NOT NULL REFERENCES accounts(id),
    imported_at         TEXT DEFAULT (datetime('now')),
    txn_date            TEXT NOT NULL,
    description         TEXT NOT NULL,
    amount              REAL NOT NULL,
    raw_source          TEXT,
    raw_csv_row         TEXT,
    dedupe_hash         TEXT NOT NULL UNIQUE,
    category_account_id TEXT REFERENCES accounts(id),
    vendor_normalized   TEXT,
    notes               TEXT,
    status              TEXT NOT NULL DEFAULT 'uncategorized'
                        CHECK (status IN ('uncategorized','categorized','excluded')),
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
  )
`);
safeExec('CREATE INDEX IF NOT EXISTS idx_transactions_account   ON transactions(account_id)');
safeExec('CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions(txn_date)');
safeExec('CREATE INDEX IF NOT EXISTS idx_transactions_status    ON transactions(status)');
safeExec('CREATE INDEX IF NOT EXISTS idx_transactions_category  ON transactions(category_account_id)');
safeExec('CREATE INDEX IF NOT EXISTS idx_transactions_vendor    ON transactions(vendor_normalized)');

// Idempotent Phase C-Fix migration: near-duplicate detection (R8 dedupe upgrade).
// Same vendor_normalized + same amount + txn_date within ±3 days on the same account →
// candidate near-duplicate. The user resolves via the Categorization UI (keep both /
// keep this / keep original). near_duplicate_of references transactions(id) but is not
// a hard FK so deletes don't cascade unexpectedly.
{
  const txnCols = db.prepare('PRAGMA table_info(transactions)').all().map(c => c.name);
  if (!txnCols.includes('near_duplicate_of')) {
    safeExec('ALTER TABLE transactions ADD COLUMN near_duplicate_of TEXT REFERENCES transactions(id)');
  }
}
safeExec('CREATE INDEX IF NOT EXISTS idx_transactions_near_dup ON transactions(near_duplicate_of)');

// Vendor rules — auto-categorization rules.
safeExec(`
  CREATE TABLE IF NOT EXISTS vendor_rules (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    vendor_pattern       TEXT NOT NULL,
    category_account_id  TEXT NOT NULL REFERENCES accounts(id),
    match_count          INTEGER NOT NULL DEFAULT 0,
    is_active            INTEGER NOT NULL DEFAULT 1,
    created_at           TEXT DEFAULT (datetime('now'))
  )
`);
safeExec('CREATE INDEX IF NOT EXISTS idx_vendor_rules_pattern ON vendor_rules(vendor_pattern)');
safeExec('CREATE INDEX IF NOT EXISTS idx_vendor_rules_active  ON vendor_rules(is_active)');

// CSV source mappings — saved per-source column mappings.
safeExec(`
  CREATE TABLE IF NOT EXISTS csv_source_mappings (
    id                     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    source_key             TEXT NOT NULL,
    header_signature       TEXT NOT NULL,
    date_col               TEXT NOT NULL,
    description_col        TEXT NOT NULL,
    amount_col             TEXT NOT NULL,
    amount_sign_convention TEXT NOT NULL DEFAULT 'negative_outflow'
                           CHECK (amount_sign_convention IN ('negative_outflow','positive_outflow')),
    memorized_account_id   TEXT REFERENCES accounts(id),
    created_at             TEXT DEFAULT (datetime('now')),
    last_used_at           TEXT DEFAULT (datetime('now'))
  )
`);
safeExec('CREATE UNIQUE INDEX IF NOT EXISTS idx_csv_source_mappings_sig ON csv_source_mappings(source_key, header_signature)');

// Journal entries — double-entry bookkeeping for categorized transactions
// (and future sources: manual journal entries, invoice payments).
safeExec(`
  CREATE TABLE IF NOT EXISTS journal_entries (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    txn_date     TEXT NOT NULL,
    description  TEXT NOT NULL,
    source       TEXT NOT NULL
                 CHECK (source IN ('transaction_import','manual','invoice_payment')),
    source_id    TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  )
`);
safeExec('CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries(source, source_id)');

// Journal lines — debit/credit sides of each entry.
safeExec(`
  CREATE TABLE IF NOT EXISTS journal_lines (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    entry_id   TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    debit      REAL NOT NULL DEFAULT 0,
    credit     REAL NOT NULL DEFAULT 0,
    position   REAL NOT NULL DEFAULT 0
  )
`);
safeExec('CREATE INDEX IF NOT EXISTS idx_journal_lines_entry   ON journal_lines(entry_id)');
safeExec('CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id)');

// F1 migration: make journal_entries.source_id a real FK to transactions(id) with ON DELETE CASCADE.
// Pre-F1: source_id is a soft reference (TEXT). The resolve-duplicate endpoint manually deleted
// journal entries before deleting transactions. Any other delete path that "forgot" the cleanup
// would leak orphan journal entries that Phase D reports would pick up.
// Post-F1: deleting a transaction cascades to its journal entries (and via journal_lines.entry_id
// to the lines). Any delete path that forgets the helper is structurally safe — the DB does it.
// Tradeoff: invoice-payments and manual sources still use the same column without FK enforcement
// (their IDs live in different tables). When invoice-payments need cascade, add a separate FK column.
// Detect via PRAGMA — if the source_id column lacks REFERENCES transactions, rebuild.
// SQLite only enforces FKs when PRAGMA foreign_keys=ON (already set at top of file).
// IMPORTANT: with FK enforcement on, `DROP TABLE journal_entries` cascade-deletes the 14
// journal_lines rows that reference it. So we temporarily disable FKs across the rebuild,
// then re-enable. The data itself (hex IDs in journal_lines.entry_id) survives because we
// INSERT all journal_entries rows into the new table with their original IDs.
{
  const journalSchema = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'
  `).get();
  const hasFK = journalSchema && /source_id\s+TEXT\s+REFERENCES\s+transactions/i.test(journalSchema.sql);
  if (!hasFK) {
    console.log('[F1] Migrating journal_entries: adding FK on source_id with ON DELETE CASCADE');
    db.pragma('foreign_keys = OFF');
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE journal_entries_new (
        id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        txn_date     TEXT NOT NULL,
        description  TEXT NOT NULL,
        source       TEXT NOT NULL
                     CHECK (source IN ('transaction_import','manual','invoice_payment')),
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
    db.pragma('foreign_keys = ON');
  }
}

// =====================================================================
// Virta Books — Phase E.1 (Account Reconciliation)
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Schema mirrors ACCOUNTING-v1.md §13:
//   transactions.cleared_at — canonical "did the bank confirm this posted" flag
//   reconciliations — one row per (account, period) reconciliation attempt
//   reconciliation_clears — many-to-many between reconciliations and transactions
// All three changes are NEW additions: ALTER TABLE ADD COLUMN for cleared_at,
// CREATE TABLE IF NOT EXISTS for the two new tables. No DROP/CREATE/RENAME needed
// (Hard Rule #2 / FK-disable trick is NOT required here because we're not rebuilding
// any existing table — the children of transactions reference it, but we don't
// touch the parent table shape).

// 1. transactions.cleared_at — null = uncleared, timestamp = cleared
{
  const txnCols = db.prepare('PRAGMA table_info(transactions)').all().map(c => c.name);
  if (!txnCols.includes('cleared_at')) {
    try { db.exec('ALTER TABLE transactions ADD COLUMN cleared_at TEXT'); } catch { /* ignore */ }
  }
}
safeExec('CREATE INDEX IF NOT EXISTS idx_transactions_cleared ON transactions(cleared_at)');

// 2. reconciliations — one per (account_id, period) per status='draft'
safeExec(`
  CREATE TABLE IF NOT EXISTS reconciliations (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    account_id        TEXT NOT NULL REFERENCES accounts(id),
    period_start      TEXT NOT NULL,
    period_end        TEXT NOT NULL,
    statement_balance REAL,
    books_balance     REAL NOT NULL,
    diff              REAL,
    cleared_count     INTEGER,
    status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'reconciled', 'investigating')),
    notes             TEXT,
    reconciled_at     TEXT,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  )
`);
safeExec('CREATE INDEX IF NOT EXISTS idx_reconciliations_account ON reconciliations(account_id)');
safeExec('CREATE INDEX IF NOT EXISTS idx_reconciliations_period ON reconciliations(period_start, period_end)');

// 3. reconciliation_clears — which transactions have been cleared in which recon.
// ON DELETE CASCADE on reconciliation_id: deleting a recon nukes its clears (the
// transactions themselves are NOT touched — `cleared_at` on transactions stays
// unless we explicitly clear it; this is per spec).
safeExec(`
  CREATE TABLE IF NOT EXISTS reconciliation_clears (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    reconciliation_id  TEXT NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
    transaction_id     TEXT NOT NULL REFERENCES transactions(id),
    cleared_at         TEXT DEFAULT (datetime('now')),
    UNIQUE(reconciliation_id, transaction_id)
  )
`);
safeExec('CREATE INDEX IF NOT EXISTS idx_reconciliation_clears_recon ON reconciliation_clears(reconciliation_id)');
safeExec('CREATE INDEX IF NOT EXISTS idx_reconciliation_clears_txn  ON reconciliation_clears(transaction_id)');

// Indexes
safeExec('CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks(column_id)');
safeExec('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)');
safeExec('CREATE INDEX IF NOT EXISTS idx_columns_project_id ON columns(project_id)');
safeExec('CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id)');
safeExec('CREATE INDEX IF NOT EXISTS idx_subtasks_due_date ON subtasks(due_date)');

// Add new columns to tasks — use try/catch per column since SQLite doesn't support IF NOT EXISTS for ALTER
const taskCols = db.prepare('PRAGMA table_info(tasks)').all().map(c => c.name);
if (!taskCols.includes('assignees')) {
  try { db.exec("ALTER TABLE tasks ADD COLUMN assignees TEXT DEFAULT '[]'"); } catch { /* ignore */ }
}
if (!taskCols.includes('category_id')) {
  try { db.exec('ALTER TABLE tasks ADD COLUMN category_id TEXT'); } catch { /* ignore */ }
}

// Add dark_mode column to projects
const projectCols = db.prepare('PRAGMA table_info(projects)').all().map(c => c.name);
if (!projectCols.includes('position')) {
  try { db.exec('ALTER TABLE projects ADD COLUMN position REAL DEFAULT 0'); } catch { /* ignore */ }
  // Backfill: assign sequential positions based on created_at order
  try { db.exec("UPDATE projects SET position = (SELECT COUNT(*) FROM projects p2 WHERE p2.created_at < projects.created_at)"); } catch { /* ignore */ }
}
if (!projectCols.includes('dark_mode')) {
  try { db.exec('ALTER TABLE projects ADD COLUMN dark_mode INTEGER DEFAULT 1'); } catch { /* ignore */ }
}
if (!projectCols.includes('default_add_to_calendar')) {
  try { db.exec('ALTER TABLE projects ADD COLUMN default_add_to_calendar INTEGER DEFAULT 0'); } catch { /* ignore */ }
}

// Note: google_credentials table is kept for schema compatibility but is no longer used.
// Calendar integration moved to iCal feed subscriptions (calendar_feeds table).

// Calendar feeds (iCal subscriptions)
safeExec(`
  CREATE TABLE IF NOT EXISTS calendar_feeds (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name       TEXT NOT NULL,
    url        TEXT NOT NULL,
    color      TEXT DEFAULT '#6366f1',
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    last_fetched_at TEXT,
    last_error TEXT
  )
`);

// Add project_id column to categories
const categoryCols = db.prepare('PRAGMA table_info(categories)').all().map(c => c.name);
if (!categoryCols.includes('project_id')) {
  try { db.exec('ALTER TABLE categories ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE'); } catch { /* ignore */ }
  // Migrate existing categories to Personal project
  try { db.exec("UPDATE categories SET project_id = 'ca272e5f2aa23e801b54fa09e48852a7' WHERE project_id IS NULL"); } catch { /* ignore */ }
}
if (!categoryCols.includes('position')) {
  try { db.exec('ALTER TABLE categories ADD COLUMN position REAL DEFAULT 0'); } catch { /* ignore */ }
  // Backfill: assign positions based on rowid order
  try { db.exec('UPDATE categories SET position = rowid'); } catch { /* ignore */ }
}

// Seed default project if none exist
const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get();
if (projectCount.count === 0) {
  const projectId = generateId();
  const insertProject = db.prepare(
    'INSERT INTO projects (id, name, description, color, dark_mode) VALUES (?, ?, ?, ?, ?)'
  );
  insertProject.run(projectId, 'Personal', 'Default personal task project', '#6366f1', 1);

  const insertColumn = db.prepare(
    'INSERT INTO columns (id, project_id, name, position) VALUES (?, ?, ?, ?)'
  );
  const defaultColumns = ['Backlog', 'Prioritized', 'Active', 'Completed'];
  defaultColumns.forEach((name, index) => {
    insertColumn.run(generateId(), projectId, name, index);
  });
}

// =====================================================================
// Seed chart of accounts on first boot — Phase A.
// Only seeds if `accounts` table is empty. Exact 32 accounts from
// ACCOUNTING-v1.md §1. Position is used for stable ordering in the UI.
// Idempotent on every boot.
// =====================================================================
const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
if (accountCount.count === 0) {
  console.log('[Books] Seeding 32 chart of accounts');
  const SEED_ACCOUNTS = [
    // Income (4)
    { code: '4000', name: 'Wholesale Sales',          account_type: 'income',    irs_line: 'Part I Gross receipts' },
    { code: '4010', name: 'Etsy Sales',               account_type: 'income',    irs_line: 'Part I Gross receipts' },
    { code: '4020', name: 'Pattern/License Sales',    account_type: 'income',    irs_line: 'Part I Gross receipts' },
    { code: '4900', name: 'Other Income',             account_type: 'income',    irs_line: 'Part I Other income' },
    // Operating Expenses (16)
    { code: '6000', name: 'Advertising & Marketing',  account_type: 'expense',   irs_line: 'Line 8' },
    { code: '6010', name: 'Software Subscriptions',   account_type: 'expense',   irs_line: 'Line 18 or Line 27a' },
    { code: '6020', name: 'Website & Hosting',        account_type: 'expense',   irs_line: 'Line 18' },
    { code: '6100', name: 'Office Supplies',          account_type: 'expense',   irs_line: 'Line 18' },
    { code: '6200', name: 'Shipping & Postage',       account_type: 'expense',   irs_line: 'Line 18' },
    { code: '6210', name: 'Merchant Fees',            account_type: 'expense',   irs_line: 'Line 18' },
    { code: '6300', name: 'Rent / Studio',            account_type: 'expense',   irs_line: 'Line 20' },
    { code: '6400', name: 'Utilities',                account_type: 'expense',   irs_line: 'Line 25 (Utilities)' },
    { code: '6410', name: 'Phone & Internet',         account_type: 'expense',   irs_line: 'Line 25' },
    { code: '6500', name: 'Insurance',                account_type: 'expense',   irs_line: 'Line 15' },
    { code: '6510', name: 'Professional Fees',        account_type: 'expense',   irs_line: 'Line 17' },
    { code: '6600', name: 'Travel',                   account_type: 'expense',   irs_line: 'Line 24a' },
    { code: '6610', name: 'Meals',                    account_type: 'expense',   irs_line: 'Line 24b' },
    { code: '6700', name: 'Education & Training',     account_type: 'expense',   irs_line: 'Line 27a' },
    { code: '6800', name: 'Home Office',              account_type: 'expense',   irs_line: 'Line 30' },
    { code: '6900', name: 'Other Expenses',           account_type: 'expense',   irs_line: 'Line 27a' },
    // Assets (4)
    { code: '1000', name: 'Business Checking',        account_type: 'asset',     irs_line: 'Balance sheet' },
    { code: '1010', name: 'PayPal',                   account_type: 'asset',     irs_line: 'Balance sheet' },
    { code: '1020', name: 'Venmo',                    account_type: 'asset',     irs_line: 'Balance sheet' },
    { code: '1100', name: 'Equipment',                account_type: 'asset',     irs_line: 'Line 13 (depreciation)' },
    { code: '1200', name: 'Materials Inventory',      account_type: 'asset',     irs_line: 'Balance sheet' },
    // Liabilities (3)
    { code: '2000', name: 'Business Credit Card',     account_type: 'liability', irs_line: 'Balance sheet' },
    { code: '2100', name: 'Sales Tax Payable',        account_type: 'liability', irs_line: 'n/a' },
    { code: '2200', name: 'Owner Draws / Equity',     account_type: 'liability', irs_line: 'n/a' },
    // Equity (1)
    { code: '3000', name: "Owner\u2019s Equity",      account_type: 'equity',    irs_line: 'n/a' },
  ];

  const insertAccount = db.prepare(`
    INSERT INTO accounts (id, code, name, account_type, irs_line, is_system, position)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, 1, ?)
  `);
  const seedTx = db.transaction((rows) => {
    rows.forEach((row, idx) => {
      insertAccount.run(row.code, row.name, row.account_type, row.irs_line, idx);
    });
  });
  seedTx(SEED_ACCOUNTS);
}

export default db;
export { generateId };