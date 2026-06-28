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

// Indexes
safeExec('CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks(column_id)');
safeExec('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)');
safeExec('CREATE INDEX IF NOT EXISTS idx_columns_project_id ON columns(project_id)');

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
  const defaultColumns = ['Backlog', 'Prioritized', 'Active', 'On Hold', 'Completed'];
  defaultColumns.forEach((name, index) => {
    insertColumn.run(generateId(), projectId, name, index);
  });
}

export default db;
export { generateId };