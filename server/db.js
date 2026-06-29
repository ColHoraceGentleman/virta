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