# WREN_REPORT_4.md — Code Review: Virta v4 Column Management & Settings Restructure

**Reviewer:** Wren 🪶  
**Date:** 2026-05-29  
**Build:** ✅ Clean (`npm run build` passes, no errors or warnings)  
**Verdict:** ⚠️ **CONDITIONAL PASS** — Two moderate issues require fixes; one minor cleanup needed

---

## Summary

The v4 implementation is largely solid. The position system, reorder helpers, new routes, and SettingsModal restructure all work correctly. Boundary conditions on the reorder helpers are handled safely (early `return` if `other` is null). The `deleteColumn` last-column edge case is safe — it doesn't crash, but it silently orphans tasks into the void, which is a real data-loss risk if no guard exists higher up (and there isn't one). The default column creation in `createProject` works but lacks transaction wrapping, creating a partial-write risk. There's also a dead `window.__firstColumnName` reference in `ColumnRow.handleDelete` that never resolves. No security vulnerabilities found.

---

## Findings

### 🔴 MODERATE — `deleteColumn`: Last column deletes silently orphan all tasks

**File:** `server/services/taskService.js` — `deleteColumn()`  
**Lines:** 94–104

```js
const firstCol = db.prepare(
  'SELECT * FROM columns WHERE project_id = ? AND id != ? ORDER BY position ASC LIMIT 1'
).get(col.project_id, id);
if (firstCol) {
  db.prepare('UPDATE tasks SET column_id = ? WHERE column_id = ?').run(firstCol.id, id);
}
const result = db.prepare('DELETE FROM columns WHERE id = ?').run(id);
return result.changes > 0;
```

**Issue:** If the column being deleted is the **last one in the project**, `firstCol` is `null`, the task migration is skipped, and all tasks in that column are deleted via `ON DELETE CASCADE`. The function returns `true` (success), giving no indication of data loss to the caller.

The frontend `ColumnRow` does show a task count badge, but there is no server-side guard preventing deletion of the last column, and no 400/409 response if deletion would leave a project with zero columns.

**Risk:** User can accidentally nuke all tasks in a project by deleting the final column.

**Recommended fix:**
```js
export function deleteColumn(id) {
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(id);
  if (!col) return false;

  const allCols = db.prepare(
    'SELECT * FROM columns WHERE project_id = ? ORDER BY position ASC'
  ).all(col.project_id);
  if (allCols.length <= 1) {
    throw new Error('Cannot delete the last column in a project');
  }

  const firstCol = allCols.find(c => c.id !== id);
  if (firstCol) {
    db.prepare('UPDATE tasks SET column_id = ? WHERE column_id = ?').run(firstCol.id, id);
  }
  const result = db.prepare('DELETE FROM columns WHERE id = ?').run(id);
  return result.changes > 0;
}
```
Also: the route handler in `columns.js` should catch this error and return `400`.

---

### 🟡 MODERATE — `createProject` default columns not wrapped in a DB transaction

**File:** `server/services/taskService.js` — `createProject()`  
**Lines:** 11–23

```js
db.prepare('INSERT INTO projects ...').run(id, ...);

DEFAULT_COLUMNS.forEach((colName, index) => {
  createColumn(id, { name: colName, position: index });
});

return getProjectById(id);
```

**Issue:** The project INSERT and the 5 column INSERTs are separate statements with no transaction. If any column insert fails (disk error, constraint violation, etc.), the project row is left in the DB with zero columns. The UI will load the project but crash when it tries to render the board with no columns, leaving the user stuck.

**Recommended fix:**
```js
const createProjectTx = db.transaction(({ id, name, description, color, darkMode }) => {
  db.prepare('INSERT INTO projects (id, name, description, color, dark_mode) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, description || null, color || '#6366f1', darkMode !== undefined ? (darkMode ? 1 : 0) : 1);

  const DEFAULT_COLUMNS = ['Backlog', 'Prioritized', 'Active', 'On Hold', 'Completed'];
  DEFAULT_COLUMNS.forEach((colName, index) => {
    createColumn(id, { name: colName, position: index });
  });
});

createProjectTx({ id, name, description, color, darkMode });
return getProjectById(id);
```

---

### 🟢 MINOR — Dead `window.__firstColumnName` reference in `ColumnRow`

**File:** `client/src/components/SettingsModal.jsx` — `ColumnRow.handleDelete()`  
**Lines:** 158–163

```js
async function handleDelete() {
  if (taskCount > 0) {
    const firstCol = window.__firstColumnName;   // ← never set anywhere
    if (!confirm(`Delete "${column.name}"? ${taskCount} task${taskCount > 1 ? 's' : ''} will be moved to ${firstCol || 'the first column'}.`)) return;
  }
  await onDelete(column.id);
}
```

`window.__firstColumnName` is referenced here but is **never set anywhere in the codebase** — no `window.__firstColumnName =` assignment exists. The fallback `|| 'the first column'` is always used, so this is not a crash, but the confirmation message will always say "the first column" instead of the actual column name.

The `SettingsModal` parent already computes `firstColName = sortedColumns[0]?.name || 'the first column'` and uses it correctly in its own `handleDeleteColumn`. The `ColumnRow` is being called with `onDelete={handleDeleteColumn}` which re-confirms internally — so the task-count check in `ColumnRow.handleDelete` fires FIRST (line 158), prompts with a generic name, and then if confirmed, `onDelete()` calls `handleDeleteColumn` (SettingsModal's version), which re-checks and re-prompts with the correct name. **Double confirmation dialog** for non-empty columns.

**Recommended fix:** Remove the duplicate confirmation logic from `ColumnRow.handleDelete` and rely solely on `SettingsModal.handleDeleteColumn`. Or pass `firstColName` as a prop to `ColumnRow`.

---

## What Looks Good ✅

- **Reorder boundary guards:** All three helpers (`reorderProjects`, `reorderColumns`, `reorderCategories`) do `if (!other) return;` — moving the first item up or last item down is a clean no-op, no crash.
- **Position backfill:** Both `projects` and `categories` backfill logic is correct. Projects use `COUNT(*) WHERE created_at <` (gives 0-indexed sequential values), categories use `rowid` (safe integer sequence). Neither runs if the column already exists.
- **`deleteCategory` task handling:** Tasks have `category_id` nullable; deletion just NULLs the reference naturally (no FK constraint on tasks.category_id), so tasks aren't lost. The confirm message ("Tasks using it will have no category") is accurate.
- **PATCH/DELETE category routes:** Correct structure, proper 404 handling, SSE broadcast on both operations. `updateCategory` passes `req.body` directly — safe since the service uses explicit named destructuring.
- **Props wiring:** All new props (`onReorderColumns`, `onReorderCategories`, `onReorderProjects`, `onCreateColumn`, `onUpdateColumn`, `onDeleteColumn`) are correctly passed from App.jsx to both SettingsModal invocations (including the "no projects" early render path at line ~213).
- **`updateColumn` position=0 edge case:** `position ?? current.position` — if `position` is `0`, this evaluates `0 ?? ...` → `0` (correct, since `??` only triggers on null/undefined, not falsy). Position-0 columns can be safely set.
- **SSE category events:** `category_updated` and `category_deleted` are broadcast from the routes and handled in `useTasks` via optimistic local state updates (`updateCategory`, `deleteCategory` update state directly). The SSE handler doesn't need explicit cases for these since state is already updated before the broadcast returns.
- **No missing `await` found** on async calls in the reviewed paths.
- **Build:** Clean, no TypeScript/lint errors, 454ms.

---

## Issue Summary

| Severity | Issue | File |
|----------|-------|------|
| MODERATE | `deleteColumn` allows deleting last column, silently cascades all tasks | `server/services/taskService.js` |
| MODERATE | `createProject` default columns not transactional — partial write risk | `server/services/taskService.js` |
| MINOR | Dead `window.__firstColumnName` ref → double confirm dialog for non-empty column delete | `client/src/components/SettingsModal.jsx` |
