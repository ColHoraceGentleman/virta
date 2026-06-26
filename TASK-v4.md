# TASK-v4.md — Virta: Column Management, Settings Restructure, Default Columns

**Owner:** Rusty
**Builder:** Cinder
**Project root:** `/Users/colonelhoracegentleman/clawd/projects/task-manager/`
**Last updated:** 2026-05-29

---

## Context

Running production launchd service on port 3001. Stack: React 18 + Vite, Tailwind CSS v3, Express + better-sqlite3.

**Do NOT change the stack, port, or launchd config.**
After all changes: `npm run build` then `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager 2>&1`

---

## Changes Required

---

### 1. DB Schema — server/db.js

**Add `position` column to `projects` table:**
```js
try { db.exec("ALTER TABLE projects ADD COLUMN position REAL DEFAULT 0"); } catch {}
```

**Add `position` column to `categories` table:**
```js
try { db.exec("ALTER TABLE categories ADD COLUMN position REAL DEFAULT 0"); } catch {}
```

After adding, backfill positions so existing rows have sequential values:
```sql
-- Projects: assign position based on created_at order
UPDATE projects SET position = (SELECT COUNT(*) FROM projects p2 WHERE p2.created_at < projects.created_at);

-- Categories: assign position based on rowid order within each project
UPDATE categories SET position = rowid;
```

**Default columns seed** — when seeding a new project (projectCount === 0), make sure it uses the standard columns AND also seeds projects created via `createProject()`. See item 2.

---

### 2. Server — taskService.js

**`getAllProjects()`** — change ORDER BY to `position ASC, created_at ASC`.

**`createProject()`** — after creating the project, automatically create the 5 default columns:
```js
const DEFAULT_COLUMNS = ['Backlog', 'Prioritized', 'Active', 'On Hold', 'Completed'];
DEFAULT_COLUMNS.forEach((name, index) => {
  createColumn(id, { name, position: index });
});
```
Return the project (unchanged return).

**`updateProject()`** — accept `position` param, update in DB if provided.

**`getCategories(projectId)`** — change `ORDER BY name ASC` to `ORDER BY position ASC, name ASC`.

**`createCategory()`** — when inserting, set `position` to `(SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE project_id = ?)` so new categories append to the end.

**Add `updateCategory(id, { name, color, position })`:**
```js
export function updateCategory(id, { name, color, position }) {
  const current = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!current) return null;
  db.prepare('UPDATE categories SET name = ?, color = ?, position = ? WHERE id = ?')
    .run(name ?? current.name, color ?? current.color, position ?? current.position, id);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}
```

**Add `deleteCategory(id)`** (if not already present — check first):
```js
export function deleteCategory(id) {
  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return result.changes > 0;
}
```

**`deleteColumn(id)`** — before deleting, move all tasks in this column to the first column of the same project:
```js
export function deleteColumn(id) {
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(id);
  if (!col) return false;
  // Find first column in same project (by position)
  const firstCol = db.prepare(
    'SELECT * FROM columns WHERE project_id = ? AND id != ? ORDER BY position ASC LIMIT 1'
  ).get(col.project_id, id);
  if (firstCol) {
    db.prepare('UPDATE tasks SET column_id = ? WHERE column_id = ?').run(firstCol.id, id);
  }
  const result = db.prepare('DELETE FROM columns WHERE id = ?').run(id);
  return result.changes > 0;
}
```

---

### 3. Server — routes

**routes/projects.js** — `updateProject` route: pass `position` from `req.body` through to `taskService.updateProject()`.

**routes/categories.js:**
- `GET /` — already filters by projectId. No change needed.
- `POST /` — already passes projectId. No change needed.
- Add `PATCH /:id` route:
```js
router.patch('/:id', async (req, res) => {
  try {
    const category = taskService.updateCategory(req.params.id, req.body);
    if (!category) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    broadcast({ type: 'category_updated', data: category });
    res.json({ data: category });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});
```
- Add `DELETE /:id` route:
```js
router.delete('/:id', async (req, res) => {
  try {
    const deleted = taskService.deleteCategory(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    broadcast({ type: 'category_deleted', data: { id: req.params.id } });
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});
```

---

### 4. Client — lib/api.js

Add/update these methods:
```js
updateCategory: (id, data) => request('PATCH', `/categories/${id}`, data),
deleteCategory: (id) => request('DELETE', `/categories/${id}`),
updateProject: (id, data) => request('PATCH', `/projects/${id}`, data),  // already exists, verify position is passed through
```

---

### 5. Client — hooks/useTasks.js

**`updateCategory(id, fields)`** — call `api.updateCategory(id, fields)` then reload.
**`deleteCategory(id)`** — call `api.deleteCategory(id)` then reload.

These likely already exist but may not hit the right endpoint — verify and fix.

**`reorderProjects(id, direction)`** — helper that swaps `position` values between two adjacent projects and calls `api.updateProject` for both.

**`reorderColumns(id, direction)`** — swaps position between adjacent columns, calls `api.updateColumn` for both.

**`reorderCategories(id, direction)`** — swaps position between adjacent categories, calls `api.updateCategory` for both.

Export all three from the hook.

---

### 6. Client — components/SettingsModal.jsx

**Complete restructure.** The new layout is:

```
Settings
├── GLOBAL
│   └── Projects
│       ├── [project rows with ↑↓ reorder, ★ default, ✏️ rename, 🗑️ delete]
│       └── [+ New Project button → inline form]
│
└── CURRENT PROJECT: [Project Name]
    ├── Columns  [collapsible ▾/▴]
    │   ├── [column rows with ↑↓ reorder, ✏️ rename, 🗑️ delete]
    │   └── [+ Add Column button → inline form]
    └── Categories  [collapsible ▾/▴]
        ├── [category rows with ↑↓ reorder, ✏️ rename, 🗑️ delete]
        └── [+ Add Category button → inline form]
```

**Section headers:**
- "GLOBAL" — plain static label (not clickable)
- "CURRENT PROJECT: Personal" — plain static label showing the current project name
- "Columns" and "Categories" — clickable to collapse/expand (chevron ▾/▴ on right)

**Project rows:**
- Left: ★ default button (amber = default, grey = not)
- Setting default also reorders to position 0 (calls reorderProjects logic to move to top)
- ↑ / ↓ buttons (↑ disabled if first, ↓ disabled if last)
- Project name (editable inline on ✏️ click)
- 🗑️ delete (confirm dialog)

**Column rows (current project only):**
- ↑ / ↓ buttons (↑ disabled if first, ↓ disabled if last)
- Column name (editable inline on ✏️ click)
- 🗑️ delete — show confirm: "Delete [Name]? Tasks in this column will be moved to [first column name]." — only if column has tasks. If no tasks, delete directly.

**Category rows (current project only):**
- ↑ / ↓ buttons
- Color swatch (clickable → ColorSwatch picker inline)
- Category name (editable inline)
- 🗑️ delete

**"+ New Project" inline form:** name input + 🌙/☀️ toggle + Create/Cancel buttons (same as v3).

**"+ Add Column" inline form:** just a name input + Create/Cancel.

**"+ Add Category" inline form:** name input + ColorSwatch + Create/Cancel.

**Collapse state:** both Columns and Categories sections start expanded. State persists only in component memory (no localStorage needed).

---

### 7. Client — App.jsx

Pass new props to SettingsModal:
- `columns={currentProject?.columns || []}` 
- `onCreateColumn={handleCreateColumn}`
- `onUpdateColumn={handleUpdateColumn}` (already exists)
- `onDeleteColumn={handleDeleteColumn}`
- `onReorderColumns={reorderColumns}`
- `onReorderCategories={reorderCategories}`
- `onReorderProjects={reorderProjects}`
- `onUpdateCategory={updateCategory}` (verify this exists and hits PATCH endpoint)

Add `handleCreateColumn(name)`:
```js
async function handleCreateColumn(name) {
  const cols = currentProject?.columns || [];
  await api.createColumn(currentProject.id, { name, position: cols.length });
  await reload();
}
```

Add `handleDeleteColumn(columnId)`:
```js
async function handleDeleteColumn(columnId) {
  await api.deleteColumn(columnId);
  await reload();
}
```

`api.deleteColumn` — add to api.js if missing:
```js
deleteColumn: (id) => request('DELETE', `/columns/${id}`),
```

Check routes — there should be a `DELETE /api/v1/columns/:id` route. If missing, add it to `server/routes/columns.js` (or wherever column routes live).

---

### 8. Reorder logic (helper, can live in useTasks.js)

For any reorder (projects, columns, categories), the pattern is:
1. Find the item's current index in the sorted array
2. Find the adjacent item in the given direction
3. Swap their `position` values
4. Call the appropriate API update for both

For "set default + move to top":
1. Set `localStorage` default key
2. Set the project's position to -1 (or 0 if it's already first)
3. Reassign all other projects positions sequentially starting from 1
4. Call `api.updateProject` for each changed project
5. Call `reload()`

---

## Key Rules

- Use try/catch for all schema ALTER TABLE changes
- Never drop/recreate tables except for the categories UNIQUE constraint fix (already done in v3)
- `deleteColumn` must move tasks before deleting — never orphan tasks
- Run `npm run build` at the end
- Restart the service after build
- Write report to `CINDER_REPORT_4.md`

## Definition of Done

- New projects get default columns automatically
- Projects, columns, categories all have position fields and are reorderable with ↑↓ arrows
- Setting a project as default moves it to position 0 (top of list)
- Settings panel has clear Global / Current Project sections
- Columns and Categories are collapsible in Settings
- Column delete warns if tasks exist, then moves them to first column
- `npm run build` succeeds
- Service restarts and responds on port 3001
