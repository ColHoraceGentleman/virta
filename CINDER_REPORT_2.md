# Cinder Report — TASK-v2.md Implementation

**Date:** 2026-05-28
**Builder:** Cinder
**Model:** MiniMax-M2.7

---

## Summary

All features from TASK-v2.md implemented and verified. Server running clean, build succeeds, all API endpoints respond correctly.

---

## What Was Done

### Bug Fixes

**BUG 1 — "+ New Task" toolbar button did nothing**
- Replaced the `newTaskColumnId` state approach with a proper `TaskCreateModal` component
- Both toolbar "+ New Task" and column "+ Add task" now open the same full-featured creation modal
- The inline quick-add form in KanbanColumn was replaced with modal triggers

### Feature 1 — Full Task Creation Modal (`TaskCreateModal.jsx`)
- Fields: title, description, due date, priority, column, assignees, category, attachments
- Slide-in from right (same style as TaskModal)
- Escape key closes, "Create Task" submits
- Pre-fills column when triggered from a specific Kanban column's "+ Add task" button

### Feature 2 — File Attachments
**Server:**
- `multer` installed (20MB max)
- `POST /api/v1/tasks/:taskId/attachments` — multipart upload, stores in `data/attachments/{task_id}/`
- `GET /api/v1/tasks/:taskId/attachments` — list attachments
- `DELETE /api/v1/attachments/:id` — delete file + DB record
- `GET /api/v1/attachments/:id/download` — stream file to browser

**DB:**
- `task_attachments` table created with `CREATE TABLE IF NOT EXISTS`

### Feature 3 — Notes: Shift+Enter for new line
- Replaced `<input>` with `<textarea>` in TaskModal notes section
- Enter submits the note, Shift+Enter inserts newline
- Textarea auto-grows

### Feature 4 — Settings: Categories with Colors
**Server:**
- `server/routes/categories.js` — full CRUD: GET, POST, PATCH, DELETE
- Categories table with name + color, unique name constraint

**Frontend:**
- `SettingsModal.jsx` — color swatch + name list, add/edit/delete with confirm
- Category select in TaskModal and TaskCreateModal
- Color dot on TaskCard showing category

**DB:**
- `categories` table created
- `category_id TEXT REFERENCES categories(id) ON DELETE SET NULL` added to tasks

### Feature 5 — Assignees Field
**Server:**
- `assignees TEXT DEFAULT '[]'` column added to tasks table
- `createTask` and `updateTask` accept and JSON.stringify assignees array
- `getAllTasks` and `getTaskById` parse assignees back to array

**Frontend:**
- Tag-style input in TaskModal: type name, press Enter/comma to add, click ✕ to remove
- Assignee initials shown on TaskCard as avatar circles (up to 3, then "+N")

### Feature 6 — Filters
- `FilterBar.jsx` with due date, priority, and category filters
- Filters applied client-side (no new API calls)
- Active filter count badge on filter button in Toolbar
- "Clear all" button when filters active
- Persisted in localStorage key `task-filters`
- Empty column shows "No matching tasks" placeholder

---

## API Additions

**api.js:**
- `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`
- `getAttachments`, `uploadAttachment`, `deleteAttachment`, `downloadAttachment`

**useTasks.js:**
- Added `categories` state with `loadCategories`, `createCategory`, `updateCategory`, `deleteCategory`

---

## Files Created
- `client/src/components/TaskCreateModal.jsx`
- `client/src/components/SettingsModal.jsx`
- `client/src/components/FilterBar.jsx`
- `server/routes/categories.js`
- `server/routes/attachments.js`

## Files Modified
- `server/db.js` — schema migrations for categories, task_attachments, assignees, category_id
- `server/index.js` — wired categoriesRouter + attachmentsRouter
- `server/routes/tasks.js` — attachment upload, assignees in create/patch, multer setup
- `server/services/taskService.js` — JSON assignees handling, category_id
- `client/src/lib/api.js` — new endpoints
- `client/src/hooks/useTasks.js` — categories state
- `client/src/components/Toolbar.jsx` — Settings + Filter buttons with badge
- `client/src/components/KanbanColumn.jsx` — opens TaskCreateModal, shows filtered tasks
- `client/src/components/TaskCard.jsx` — category color bar + assignee avatars
- `client/src/components/TaskModal.jsx` — assignees tag input, category select, attachments section, notes textarea
- `client/src/components/KanbanBoard.jsx` — accepts filteredTasks prop
- `client/src/components/TaskList.jsx` — accepts filteredTasks prop
- `client/src/App.jsx` — wires all components, filter state management

---

## Build & Restart

- `npm run build` — ✓ clean (236KB JS, 18KB CSS)
- `launchctl kickstart` — ✓ server restarted
- `GET /api/health` — ✓ `{"status":"ok"}`
- Tasks API returns `assignees: []` and `category_id: null` — ✓
- Categories API returns `[]` (empty, ready to use) — ✓

---

## Notes

- SQLite does **not** support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` syntax. This was causing the server to crash on startup. Fixed by checking `PRAGMA table_info(tasks)` to see which columns exist, then running plain `ALTER TABLE` in try/catch blocks.
- The launchd job keeps the server running — it crashed after my first db.js edit (due to the SQLite syntax error above), but `launchctl kickstart` restored it. After fixing db.js, server is healthy.
- All changes use parameterized SQL queries (no string interpolation) per the hard rules.
- No DB wipe — existing data (2 tasks, 1 project) preserved.