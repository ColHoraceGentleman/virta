# Echo 🔍 — QA Report #4
**Task Manager v4** — Column Management, Settings Restructure, Default Columns
**App:** http://127.0.0.1:3001
**Tested:** 2026-06-26
**Project root:** `/Users/colonelhoracegentleman/clawd/projects/task-manager/`

---

## Summary

v4 fixes are mostly solid. The `deleteColumn` last-column guard works correctly (returns 400 LAST_COLUMN), `createProject` is transactional with the 5 default columns seeding cleanly, dead `window.__firstColumnName` code is gone, all position/reorder endpoints work, darkMode continues to honor on POST and PATCH, and the empty-state SettingsModal is rendered.

**ONE REGRESSION FOUND (MODERATE):** The `categories.name UNIQUE` constraint from v3 has regressed — it's globally unique again, not per-project. Creating "Work" in Project B after "Work" exists in Project A returns 409. This is exactly the MODERATE-1 bug from v3's review. Root cause: the table was originally created with `name TEXT NOT NULL UNIQUE`, and SQLite does not allow dropping that constraint without rebuilding the table. The `safeExec('DROP INDEX IF EXISTS sqlite_autoindex_categories_*')` calls silently no-op because those auto-indexes back UNIQUE constraints.

The data layer has the correct composite `UNIQUE INDEX idx_categories_name_project ON categories(name, project_id)` in addition — but the legacy UNIQUE on `name` is also still active, so the composite index is shadowed by the stricter global UNIQUE.

---

## Setup

- Service: `ai.openclaw.task-manager` launchd on port 3001
- Test DB: `~/clawd/projects/task-manager/data/tasks.db` (read-only — no migrations run)
- Existing project: `Green Seed` (`ca272e5f2aa23e801b54fa09e48852a7`)
- All test projects/categories cleaned up at end of each scenario

---

## A. v4 Fixes (from CINDER_FIXES_4.md)

| Sub-test | Result | Details |
|---|---|---|
| A.1 `deleteColumn` last-column guard | ✅ PASS | Create project → delete 4 of 5 columns (all 200) → delete last → `400 {"error":"Cannot delete the last column in a project","code":"LAST_COLUMN"}`. Throws in `taskService.deleteColumn()` (line 122), caught in `routes/columns.js` line 24-26. |
| A.2 `createProject` is transactional | ✅ PASS | `createProject()` wraps INSERT + 5 `createColumn()` in `db.transaction()` (taskService.js:11-23). Created project, confirmed 5 default columns, deleted project cleanly with cascade. |
| A.3 Dead code `window.__firstColumnName` removed | ✅ PASS | `grep -rn "window.__firstColumnName" client/src/ server/` → zero matches. `firstColName` is now a prop passed from parent to `ColumnRow` (SettingsModal.jsx:142, 287). Double-confirm dialog also removed. |

---

## B. v4 Functionality

| Sub-test | Result | Details |
|---|---|---|
| B.4 Auto-default-columns on new project | ✅ PASS | `POST /api/v1/projects` then `GET /projects/:id` returns exactly 5 columns in order: Backlog (0), Prioritized (1), Active (2), On Hold (3), Completed (4). |
| B.5 Position field on projects | ⚠️ PARTIAL | Field exists and is PATCH-able, but `createProject()` does NOT auto-assign sequential positions — new projects all default to `position=0` (no INSERT into position column). Order in `GET /projects` falls back to created_at, which is fine. The QA spec asked for "sequential 0, 1, 2" but `createProject()` only writes the schema-default position. See issue M-1. |
| B.6 Reorder projects | ✅ PASS | `PATCH /projects/:id` with `{position: <float>}` works. Simulating `reorderProjects()` from useTasks.js (re-index all to 0, 1, 2 after swap) moves the project correctly. |
| B.7 Set project as default | ✅ PASS | Star button in SettingsModal calls `localStorage.setItem('virta-default-project', id)` and `onReorder(id, 'up')` (which re-indexes positions). API-side: PATCH `{position: 0}` after re-indexing 0/1/2 puts the chosen project first. |
| B.8 Position field on categories | ✅ PASS | Categories have `position` field. New category appends to end (`position: 5`). PATCH `{position: 0}` moves to front. `updateCategory` service correctly uses `position !== undefined` so explicit `0` works (not falsy-coalesced). |
| B.9 Reorder columns ↑↓ | ✅ PASS | `PATCH /columns/:id` with `{position: N}` reorders. Simulated: swap positions of first two columns → GET shows Prioritized at 0, Backlog at 1. |

---

## C. Regressions from v3 (must still work)

| Sub-test | Result | Details |
|---|---|---|
| C.10 `POST /projects` honors `darkMode` | ✅ PASS | CRITICAL-2 from v3 — stays fixed. `darkMode: false` → `dark_mode: 0`. `darkMode: true` → `dark_mode: 1`. Works on POST and PATCH. Route at `routes/projects.js:18` correctly destructures `darkMode` from body. |
| C.11 Empty-state renders SettingsModal | ✅ PASS | CRITICAL-1 from v3 — stays fixed. `client/src/App.jsx:188-196` shows "Create your first project" button, line 196 conditionally renders `<SettingsModal>` with full prop set (lines 199-216). |
| C.12 Categories UNIQUE constraint is per-project | ❌ **FAIL — REGRESSION** | Same name in different projects → **409 CONFLICT**. Same name twice in same project → 409. Composite index exists (`idx_categories_name_project`) but legacy UNIQUE on `name` is still active because SQLite can't drop a UNIQUE constraint without rebuilding the table. See issue **MODERATE-R1**. |
| C.13 `GET /api/v1/categories/:id` returns JSON | ✅ PASS | Echo's v3 report flagged this missing — fixed. Returns `200 application/json` with category body; non-existent returns `404 NOT_FOUND`. |

---

## D. Security

| Sub-test | Result | Details |
|---|---|---|
| D.14 Path traversal on attachments | ✅ PASS (with caveat) | Upload with `filename="../../../etc/passwd"` → server stored as `passwd` only, at `data/attachments/<taskId>/<id>-passwd`. File did NOT escape the attachments directory. Why it works: **busboy** (multer's underlying parser) at `node_modules/busboy/lib/types/multipart.js:322` calls `basename(filename)` by default, stripping any path. ⚠️ Caveat: the route at `tasks.js:127` uses `path.join(taskDir, ${id}-${req.file.originalname})` which is fragile — if `preservePath: true` were ever set on multer, the `..` traversal would land outside `attachmentsDir`. The download route (`routes/attachments.js:13-17`) has a proper guard (`resolvedPath.startsWith(attachmentsBaseDir)`) for the read path, but the write path relies on busboy's basename. Recommend adding `path.basename(req.file.originalname)` explicitly in the route for defense-in-depth. |
| D.15 SQL injection on category lookup | ✅ PASS | `GET /categories/' OR 1=1 --`, `' OR '1'='1`, `1; DROP TABLE categories; --`, `' UNION SELECT * FROM projects --` — all return `404 NOT_FOUND` with proper error JSON. Parameterized queries in `routes/categories.js:7-8` (`db.prepare('SELECT * FROM categories WHERE id = ?').get(...)`). |

---

## E. API Contract

| Sub-test | Result | Details |
|---|---|---|
| E.16 All routes have handlers | ✅ PASS | Audit of `server/routes/*.js` confirmed all endpoints used by client `api.js` have matching handlers. Routes mounted in `server/index.js:23-32`. No undocumented or missing routes. |

**Route inventory:**

```
projects:    GET POST /                  → GET PATCH DELETE /:id → POST /:id/columns
columns:     PATCH DELETE /:id
tasks:       GET POST /, GET PATCH DELETE /:id, PATCH /:id/move
             GET POST /:taskId/notes, POST /:taskId/attachments, GET /:taskId/attachments
notes:       DELETE /:id
categories:  GET POST /, GET PATCH DELETE /:id
attachments: GET /:id/download, DELETE /:id
calendar:    GET /auth/google[/:callback], GET /auth/status,
             GET /calendars, GET POST /calendars/:calendarId/events,
             DELETE /calendars/:calendarId/events/:eventId,
             GET /tasks/:taskId/calendar-events
events:      GET /                            (SSE)
gmail:       GET /summary, GET /unread, POST /:messageId/read
```

---

## Issues Found

| ID | Severity | Issue | Location |
|---|---|---|---|
| **MODERATE-R1** | MODERATE — feature broken for some workflows | `categories.name UNIQUE` constraint is global, not per-project. Two different projects cannot share a category name (e.g., "Work" in Project A blocks "Work" in Project B). REGRESSION of v3 MODERATE-1. | `server/db.js:90-100` (table def with `name TEXT NOT NULL UNIQUE` + composite index that doesn't override it) |
| MINOR-1 | MINOR — non-blocking data hygiene | `createProject()` does not assign sequential positions to new projects — all start at `position=0`. Tests 5 spec said sequential 0,1,2 but only backfill of EXISTING rows was specified. List ordering still works (falls back to created_at). | `server/services/taskService.js:13-17` (INSERT does not set position) |
| MINOR-2 | MINOR — defense-in-depth | `path.join(taskDir, ${id}-${req.file.originalname})` in upload route relies on busboy's `basename()` for path-traversal safety. Recommend `path.basename(req.file.originalname)` explicitly. | `server/routes/tasks.js:127` |

---

## MODERATE-R1 Details (Blocking — Must Fix)

**Test sequence:**
```
POST /projects "EchoQA-ConstTest-A" → id=A
POST /projects "EchoQA-ConstTest-B" → id=B
POST /categories {"name":"TestCat","projectId":A} → 200 ✓
POST /categories {"name":"TestCat","projectId":B} → 409 CONFLICT ✗  (should be 200)
POST /categories {"name":"TestCat","projectId":A} → 409 ✓ (correct — duplicate in same project)
```

**DB schema:**
```sql
CREATE TABLE categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,   -- ← legacy global UNIQUE still active
    color      TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now'))
    , project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, position REAL DEFAULT 0
);
CREATE UNIQUE INDEX idx_categories_name_project ON categories(name, project_id);
```

**Why the fix in `db.js:85-86` doesn't work:**
```js
safeExec('DROP INDEX IF EXISTS sqlite_autoindex_categories_1');
safeExec('DROP INDEX IF EXISTS sqlite_autoindex_categories_2');
```
`sqlite_autoindex_categories_*` are auto-indexes backing the PRIMARY KEY and UNIQUE constraints. SQLite refuses to drop them: `Error: index associated with UNIQUE or PRIMARY KEY constraint cannot be dropped`. So the `safeExec` no-ops silently.

**Recommended fix:** Recreate the table without the UNIQUE constraint. Since this is a production DB with existing data, the migration needs to preserve all rows. Pattern:
```js
// Backup
db.exec('ALTER TABLE categories RENAME TO categories_old');
// Recreate without UNIQUE on name
db.exec(`
  CREATE TABLE categories (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now')),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    position REAL DEFAULT 0
  )
`);
// Copy data
db.exec('INSERT INTO categories (id, name, color, created_at, project_id, position) SELECT id, name, color, created_at, project_id, position FROM categories_old');
db.exec('DROP TABLE categories_old');
// Recreate composite index
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_project ON categories(name, project_id)');
```
This requires a maintenance window / brief downtime. Alternatively, for an in-place fix without table rebuild, drop the legacy index by hacking the sqlite_master (very fragile — not recommended).

---

## Final Verdict

**❌ OVERALL: FAIL — 1 MODERATE regression blocks ship**

13/15 test categories passed, 1 had a sub-issue (MINOR), 1 has a blocking MODERATE regression.

The MODERATE-R1 categories UNIQUE constraint is the same bug from v3 — fixing it requires a DB migration (table rebuild). v4 spec didn't address it; assumed v3 had fixed it. Needs explicit Cinder work item: rebuild `categories` table to drop the legacy global UNIQUE.

**What's good:**
- deleteColumn last-column guard works correctly with proper 400/LAST_COLUMN
- createProject transaction wraps the 5 default columns
- All position fields exist and are reorder-able (categories, columns, projects)
- darkMode POST + PATCH both work
- Empty-state renders SettingsModal
- API contract complete
- SQL injection parameterized correctly
- Path traversal blocked at busboy layer (with implicit caveat)

**What needs work before ship:**
1. **MODERATE-R1**: Rebuild `categories` table to drop legacy `name UNIQUE` constraint so composite `(name, project_id)` index takes effect.
2. **MINOR-1** (low priority): Have `createProject()` assign next sequential position so new projects sort cleanly without requiring user reorder.
3. **MINOR-2** (defense-in-depth): Explicit `path.basename(req.file.originalname)` in upload route so the route doesn't depend on busboy's implicit basename behavior.

**Out of scope / not tested:**
- Visual rendering of SettingsModal restructure (no headless browser in this QA session; would need Playwright)
- Real-time SSE event delivery to all clients
- Multi-user concurrent edits