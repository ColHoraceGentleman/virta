# TASK-v2.md — Task Manager Feature Pass

**Owner:** Rusty  
**Builder:** Cinder  
**Project root:** `/Users/colonelhoracegentleman/clawd/projects/task-manager/`  
**Last updated:** 2026-05-28

---

## Context

The app is already built and running as a production launchd service on port 3001. The stack is:
- React 18 + Vite (client/), Tailwind CSS v3, @dnd-kit
- Express + better-sqlite3 (server/)
- Production build served from `client/dist/`

**Do NOT change the stack, port, or launchd config.**  
After all changes, run `npm run build` so the production dist is updated.  
Then restart the server: `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager 2>&1`

---

## Bug Fixes

### BUG 1 — "+ New Task" toolbar button does nothing

**Root cause:** `handleNewTask()` in `App.jsx` sets `newTaskColumnId` state but nothing reads it. The `KanbanColumn` `isAdding` state is purely local.

**Fix:** Replace the `newTaskColumnId` approach with a proper `TaskCreateModal` component. When the toolbar "+ New Task" button is clicked, open this modal. The "+ Add task" button at the bottom of each Kanban column should ALSO open this same modal (pre-filled with that column's ID).

The modal is NOT the quick inline title-only form — it is the full creation wizard (see Feature 1 below). Both entry points open the same modal.

---

## New Features

### Feature 1 — Full Task Creation Modal

Replace the inline quick-add form in KanbanColumn with a proper creation modal. This modal is also what opens from the toolbar "+ New Task" button.

**Fields:**
- Title (text, required)
- Description (textarea)
- Due date (date picker)
- Priority (select: low / medium / high / urgent)
- Column/Status (select, pre-filled from whichever column triggered the open)
- Assignees (text input — comma-separated names for now; stored as JSON array in DB)
- Category (select from categories defined in Settings — see Feature 4)
- File attachments (see Feature 2)

**UX:**
- Modal slides in from the right (same style as TaskModal)
- "Create Task" button at bottom; "Cancel" dismisses
- Escape key closes
- After creation, modal closes and board refreshes via SSE

---

### Feature 2 — File Attachments

Tasks should support file attachments.

#### DB changes (add to db.js schema migration — use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS` style so existing DBs are not broken):

```sql
CREATE TABLE IF NOT EXISTS task_attachments (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mimetype    TEXT,
  size_bytes  INTEGER,
  stored_path TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);
```

#### Server:
- Install `multer` for multipart upload handling (`npm install multer`)
- Store uploaded files in `data/attachments/{task_id}/` 
- New routes (add to `server/routes/tasks.js`):
  - `POST /api/v1/tasks/:taskId/attachments` — multipart upload, max 20MB per file
  - `GET /api/v1/tasks/:taskId/attachments` — list attachments for a task
  - `DELETE /api/v1/attachments/:id` — delete attachment + file from disk
  - `GET /api/v1/attachments/:id/download` — stream file to browser

#### Frontend:
- In TaskModal AND the new TaskCreateModal: add an "Attachments" section
- Upload: a "Attach file" button that opens a hidden `<input type="file" multiple>`
- Show a list of attached files with filename, size, and a download link + delete button
- On upload, POST to the attachment endpoint; refresh attachment list on success

---

### Feature 3 — Notes: Shift+Enter for new line

In the notes textarea (`TaskModal.jsx`), the note input is currently a single-line `<input>`. 

**Change:**
- Replace it with a `<textarea>` (auto-grows with content)
- `Enter` submits the note (existing behavior — trigger the form submit)
- `Shift+Enter` inserts a newline (prevent default form submit when shift is held)
- Display saved notes with `whitespace-pre-wrap` (already done — keep it)

---

### Feature 4 — Settings: Categories with Colors

#### DB changes:
```sql
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_at TEXT DEFAULT (datetime('now'))
);
```

Add `category_id TEXT REFERENCES categories(id) ON DELETE SET NULL` column to `tasks` table (use `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES categories(id) ON DELETE SET NULL`).

#### Server routes — add `server/routes/categories.js`:
```
GET    /api/v1/categories
POST   /api/v1/categories          body: { name, color }
PATCH  /api/v1/categories/:id      body: { name?, color? }
DELETE /api/v1/categories/:id
```
Wire up in `server/index.js`.

#### Frontend — Settings page/panel:
- Add a ⚙ "Settings" icon button to the Toolbar (right side, before "+ New Task")
- Clicking it opens a Settings modal/panel
- The Settings panel has one section for now: **Categories**
  - List of existing categories, each showing a color swatch + name
  - "Add category" form: name input + color picker (`<input type="color">`) + Add button
  - Each existing category has an Edit (pencil) and Delete (trash) button
  - Delete is blocked with a confirm dialog

#### Category usage on tasks:
- In TaskModal and TaskCreateModal: add a "Category" select field (populated from categories API)
- "None" as default option
- On TaskCard in the Kanban board: if the task has a category, show a small color dot or pill badge with the category name

---

### Feature 5 — Assignees field

#### DB change:
```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignees TEXT DEFAULT '[]';
```
Store as JSON array of name strings (e.g. `'["Patrick","Chantelle"]'`).

#### Server:
- In `taskService.js`: `createTask` and `updateTask` should accept `assignees` (array). JSON.stringify before storing, JSON.parse when reading. Make sure `getTaskById` and `getAllTasks` parse it.
- `updateTask` and `createTask` in `tasks.js` route should pass `assignees` through.

#### Frontend:
- In TaskModal and TaskCreateModal: add an "Assignees" field
  - A simple tag-style input: type a name and press Enter or comma to add; click ✕ on a tag to remove
  - Show current assignees as removable pills
- On TaskCard: show assignee initials as small avatar circles (up to 3, then "+N more")

---

### Feature 6 — Filters (due date, priority, category)

Add a filter bar that appears below the Toolbar when any filter is active, and a filter button in the Toolbar to toggle it open.

**Filter options:**
- **Due date:** None | Overdue | Due today | Due this week | Due this month
- **Priority:** All | Low | Medium | High | Urgent (multi-select pills)
- **Category:** All | (each category name from DB) (multi-select pills)

**Behavior:**
- Filters apply client-side (filter the tasks already loaded — no new API call needed)
- Active filter count shown as a badge on the filter button in the Toolbar
- "Clear all" button when any filter is active
- Filters persist in localStorage (key: `task-filters`)
- In Kanban view: columns that have zero visible tasks after filtering show a "No matching tasks" placeholder instead of being hidden
- In List view: the flat task list is filtered the same way

---

## api.js additions needed

```js
// Categories
getCategories: () => request('GET', '/categories'),
createCategory: (data) => request('POST', '/categories', data),
updateCategory: (id, data) => request('PATCH', `/categories/${id}`, data),
deleteCategory: (id) => request('DELETE', `/categories/${id}`),

// Attachments
getAttachments: (taskId) => request('GET', `/tasks/${taskId}/attachments`),
uploadAttachment: (taskId, formData) => fetch(`/api/v1/tasks/${taskId}/attachments`, { method: 'POST', body: formData }).then(r => r.json()).then(j => { if (!j.data) throw new Error(j.error); return j.data; }),
deleteAttachment: (id) => request('DELETE', `/attachments/${id}`),
downloadAttachment: (id) => `/api/v1/attachments/${id}/download`,  // returns URL string, not a fetch
```

---

## useTasks hook additions

- Add `categories` state + `loadCategories()` — fetched once on mount alongside projects
- Expose `categories`, `createCategory`, `updateCategory`, `deleteCategory` from the hook
- Pass `categories` down to Toolbar, TaskModal, TaskCreateModal via App.jsx props

---

## Files to create (new):
- `client/src/components/TaskCreateModal.jsx` — full creation wizard
- `client/src/components/SettingsModal.jsx` — settings panel with categories
- `client/src/components/FilterBar.jsx` — filter bar component
- `server/routes/categories.js` — categories CRUD
- `server/routes/attachments.js` — attachment download/delete (upload stays in tasks.js)

## Files to modify:
- `server/db.js` — add categories + task_attachments tables, ALTER TABLE tasks for assignees + category_id
- `server/services/taskService.js` — assignees JSON handling in create/update/get
- `server/routes/tasks.js` — add attachment upload route, pass assignees through
- `server/index.js` — wire categories + attachments routers
- `client/src/lib/api.js` — add category + attachment methods
- `client/src/hooks/useTasks.js` — add categories state
- `client/src/components/Toolbar.jsx` — add Settings button, Filter button with active count badge
- `client/src/components/KanbanColumn.jsx` — replace inline add form with modal trigger; apply filters
- `client/src/components/TaskModal.jsx` — add assignees tag input, category select, attachments section, fix notes textarea
- `client/src/components/TaskCard.jsx` — add category color dot/pill, assignee initials
- `client/src/App.jsx` — wire up TaskCreateModal, SettingsModal, FilterBar, categories state, filter logic

---

## Definition of Done

- [ ] Toolbar "+ New Task" button opens TaskCreateModal
- [ ] "+ Add task" at bottom of each Kanban column opens TaskCreateModal pre-filled with that column
- [ ] TaskCreateModal has all fields: title, description, due date, priority, column, assignees, category, attachments
- [ ] Files can be attached to tasks (upload, list, download, delete)
- [ ] Notes textarea: Enter submits, Shift+Enter inserts newline
- [ ] Settings modal opens, categories can be created/edited/deleted with color picker
- [ ] Tasks have a category field; category color shown on TaskCard
- [ ] Tasks have assignees; assignee initials shown on TaskCard
- [ ] Filter bar works for due date, priority, and category
- [ ] Filters persist across page reloads
- [ ] `npm run build` completes without errors
- [ ] Server restarts cleanly after build
- [ ] No console errors on page load

---

## Hard Rules

- Max 3 build/fix iterations. Stop and report if still broken after 3.
- Do not change the port (3001), launchd label, or DB file location.
- Use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for all schema changes — the existing DB must not be wiped.
- Parameterized queries only — no string interpolation in SQL.
- After finishing, write your completion report to `CINDER_REPORT_2.md` in the project root.
