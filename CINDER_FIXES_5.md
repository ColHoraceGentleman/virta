# CINDER_FIXES_5.md — Virta v5 Patch

**Date:** 2026-06-26
**Fix applied:** MODERATE-R1 (categories UNIQUE constraint is global, not per-project)

---

## Summary

`categories.name` had a table-level `UNIQUE` constraint that SQLite implements as an auto-index which **cannot be dropped without rebuilding the table**. The existing `safeExec('DROP INDEX IF EXISTS sqlite_autoindex_categories_*')` calls were no-ops (swallowed by `safeExec`), and the fallback `CREATE UNIQUE INDEX idx_categories_name_project` could not satisfy queries already failing on the global UNIQUE.

**Fix:** Added a one-shot migration in `server/db.js` that detects the legacy schema and rebuilds the `categories` table without the table-level UNIQUE, leaving only the composite `(name, project_id)` UNIQUE INDEX. Migration is wrapped in a single transaction. Auto-indexes backing the legacy UNIQUE are dropped implicitly via `DROP TABLE categories` (they cannot be dropped explicitly).

**Build:** ✅ Clean (`npm run build` — 462ms)
**Restart:** ✅ `launchctl kickstart` succeeded (PID 72108, HTTP 200)
**Functional test:** ✅ All three scenarios passed

---

## Migration Code (Diff)

**File:** `server/db.js`

```diff
-// Categories table — drop old per-column auto-indexes first (legacy from when name was UNIQUE).
-// SQLite can't DROP CONSTRAINT, so we handle indexes directly.
-safeExec('DROP INDEX IF EXISTS sqlite_autoindex_categories_1');
-safeExec('DROP INDEX IF EXISTS sqlite_autoindex_categories_2');
-
-// Categories table
-safeExec(`
-  CREATE TABLE IF NOT EXISTS categories (
-    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
-    name       TEXT NOT NULL,
-    color      TEXT NOT NULL DEFAULT '#6366f1',
-    created_at TEXT DEFAULT (datetime('now')),
-    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE
-  )
-`);
-
-// Composite unique on (name, project_id) — allows same category name across projects
-safeExec('CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_project ON categories(name, project_id)');
+// Categories table — drop old per-column auto-indexes first (legacy from when name was UNIQUE).
+// SQLite can't DROP CONSTRAINT, so we handle indexes directly.
+safeExec('DROP INDEX IF EXISTS sqlite_autoindex_categories_1');
+safeExec('DROP INDEX IF EXISTS sqlite_autoindex_categories_2');
+
+// Migration: drop global UNIQUE on categories.name, enforce UNIQUE(name, project_id).
+// Old schema had `name TEXT NOT NULL UNIQUE` (table-level). The table-level UNIQUE
+// is implemented as an auto-index that SQLite refuses to drop explicitly. We avoid
+// that pitfall by NOT touching the auto-indexes — they go away when we DROP TABLE
+// the old categories table. One-shot: re-runs are skipped because the conditional
+// no longer matches.
+{
+  const categoriesSchema = db.prepare(`
+    SELECT sql FROM sqlite_master WHERE type='table' AND name='categories'
+  `).get();
+  if (categoriesSchema && /name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(categoriesSchema.sql)) {
+    console.log('Migrating categories: removing global UNIQUE on name, enforcing per-project UNIQUE');
+    db.exec(`
+      BEGIN TRANSACTION;
+
+      -- Drop our own composite index (safe). Auto-indexes backing the table-level UNIQUE
+      -- are NOT dropped here — they will be removed implicitly when we DROP TABLE categories.
+      DROP INDEX IF EXISTS idx_categories_name_project;
+
+      -- Recreate table without UNIQUE on name
+      CREATE TABLE categories_new (
+        id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
+        name       TEXT NOT NULL,
+        color      TEXT NOT NULL DEFAULT '#6366f1',
+        created_at TEXT DEFAULT (datetime('now')),
+        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
+        position   REAL DEFAULT 0
+      );
+
+      -- Preserve all rows. Any existing NULL project_id is backfilled to the Personal project
+      -- (ca272e5f2aa23e801b54fa09e48852a7) so the composite UNIQUE has a value for every row.
+      INSERT INTO categories_new (id, name, color, created_at, project_id, position)
+        SELECT id, name, color, created_at,
+               COALESCE(project_id, 'ca272e5f2aa23e801b54fa09e48852a7'),
+               COALESCE(position, 0)
+        FROM categories;
+
+      DROP TABLE categories;
+      ALTER TABLE categories_new RENAME TO categories;
+
+      -- Per-project unique index (the only UNIQUE on categories now)
+      CREATE UNIQUE INDEX idx_categories_name_project ON categories(name, project_id);
+
+      COMMIT;
+    `);
+  }
+}
+
+// Categories table (fresh DBs land here; existing DBs are handled by the migration above)
+safeExec(`
+  CREATE TABLE IF NOT EXISTS categories (
+    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
+    name       TEXT NOT NULL,
+    color      TEXT NOT NULL DEFAULT '#6366f1',
+    created_at TEXT DEFAULT (datetime('now')),
+    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
+    position   REAL DEFAULT 0
+  )
+`);
+
+// Composite unique on (name, project_id) — allows same category name across projects
+safeExec('CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_project ON categories(name, project_id)');
```

### Key design choices

1. **Conditional trigger** — Regex `/name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i` matches the legacy schema. After migration, the schema no longer matches, so re-runs are silent no-ops.
2. **No explicit DROP of auto-indexes** — The auto-indexes backing the table-level UNIQUE cannot be dropped explicitly (`Error: index associated with UNIQUE or PRIMARY KEY constraint cannot be dropped`). They are removed implicitly when the table itself is dropped.
3. **Single transaction** — All operations wrapped in `BEGIN TRANSACTION` / `COMMIT` for atomicity.
4. **Data preservation** — All rows copied via `INSERT INTO categories_new SELECT ... FROM categories`. Any NULL `project_id` is backfilled to the Personal project (`ca272e5f2aa23e801b54fa09e48852a7`) so the composite UNIQUE has a value for every row.
5. **Fresh-DB compatibility** — The original `CREATE TABLE IF NOT EXISTS categories` block remains below the migration so fresh DBs still get the correct schema.

---

## Service-Layer Error Handling (Unchanged)

**File:** `server/routes/categories.js`

The existing UNIQUE error detection (`err.message.includes('UNIQUE')`) still works after the migration:
- Composite `(name, project_id)` UNIQUE INDEX violations raise `SqliteError: UNIQUE constraint failed: categories.name, categories.project_id`.
- Message still contains the substring `UNIQUE`, so the route returns `409 CONFLICT` correctly.
- No changes needed to the route or service layer.

Verified by Test 3 in the functional test suite (same name twice in same project → 409 with `code: "CONFLICT"` and `error: "Category name already exists"`).

---

## Schema Verification (Before / After)

### Before migration

```sql
CREATE TABLE categories (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name       TEXT NOT NULL UNIQUE,    -- ← legacy global UNIQUE
    color      TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now'))
  , project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, position REAL DEFAULT 0)
```

Indexes:
- `sqlite_autoindex_categories_1` (PRIMARY KEY)
- `sqlite_autoindex_categories_2` (backing the table-level UNIQUE on `name`) ← root cause
- `idx_categories_name_project` (`CREATE UNIQUE INDEX ... ON categories(name, project_id)`)

### After migration

```sql
CREATE TABLE "categories" (
        id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name       TEXT NOT NULL,        -- ← NO UNIQUE
        color      TEXT NOT NULL DEFAULT '#6366f1',
        created_at TEXT DEFAULT (datetime('now')),
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        position   REAL DEFAULT 0
      )
```

Indexes:
- `sqlite_autoindex_categories_1` (PRIMARY KEY only)
- `idx_categories_name_project` (`CREATE UNIQUE INDEX ... ON categories(name, project_id)`) ← only UNIQUE

✅ Schema verification PASS:
- Table SQL no longer contains `UNIQUE` on `name` alone.
- `idx_categories_name_project` is the only `UNIQUE INDEX`.

---

## Functional Test Results

Ran against the live service on `http://127.0.0.1:3001`.

| Test | Action | Expected | Got | Result |
|---|---|---|---|---|
| 1 | `POST /categories {name:"SameName", color:"#aaa", projectId:P1}` | 200 | `200 {"data":{"id":"7df23e8ca663eeb2acde780d5218e894","name":"SameName",...,"project_id":"ca272e5f2aa23e801b54fa09e48852a7","position":5}}` | ✅ PASS |
| 2 | `POST /categories {name:"SameName", color:"#bbb", projectId:P2}` (different project) | 200 | `200 {"data":{"id":"09af061b9e7cb893f7d2f29aa288e691","name":"SameName",...,"project_id":"9fa636b9dc7a6478c89587411c45e243","position":0}}` | ✅ PASS (was 409 before fix) |
| 3 | `POST /categories {name:"SameName", color:"#ccc", projectId:P2}` (same project) | 409 | `409 {"error":"Category name already exists","code":"CONFLICT"}` | ✅ PASS |

Cleanup performed: P2 deleted (cascade removed the test category in P2), test category in P1 deleted directly. Original 5 categories fully preserved.

### Row counts after test

| Table | Count |
|---|---|
| projects | 1 (Green Seed — only the original project) |
| columns | 5 (all original) |
| tasks | 16 (all original) |
| categories | 5 (all original: Green Seed, REDX, WAVV, Data Labs, United Angels) |

---

## Build & Restart

```bash
$ cd ~/clawd/projects/task-manager && npm run build
> task-manager@1.0.0 build
> vite build
vite v6.4.2 building for production...
✓ 46 modules transformed.
dist/index.html                   0.72 kB │ gzip:  0.39 kB
dist/assets/index-DzXv7j6D.css   24.85 kB │ gzip:  4.93 kB
dist/assets/index-ComxUgRO.js   258.62 kB │ gzip: 78.09 kB
✓ built in 462ms
```

```bash
$ launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3001/api/v1/projects
HTTP 200
```

Service running on PID 72108 (after final clean restart, no "Migrating categories" log message — conditional correctly skipped).

---

## Safety Notes

- **Backup:** `~/clawd/projects/task-manager/data/tasks.db.backup-1782501621` (timestamped, preserved).
- **No data loss:** All 5 categories, 1 project, 5 columns, 16 tasks intact after migration and cleanup.
- **No new tables:** The migration rebuilds `categories` in place; all other tables untouched.
- **No unrelated code changes:** Only `server/db.js` modified; route/service layer untouched.
- **No Atreyu files touched.**
- **3-iteration max respected:** The migration required one design iteration (initially included explicit `DROP INDEX` on auto-indexes which SQLite refused; corrected to let them drop with the table).

---

## Out of Scope (Not Addressed)

These were flagged in `qa-report-v4.md` but are MINOR severity and not part of this fix:

- **MINOR-1:** `createProject()` does not assign sequential positions to new projects (they all start at `position=0`). List ordering still works via `created_at` fallback.
- **MINOR-2:** `path.basename(req.file.originalname)` not explicit in upload route; relies on busboy's implicit basename.

These remain as separate work items for future iterations if desired.