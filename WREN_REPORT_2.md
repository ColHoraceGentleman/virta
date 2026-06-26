# Wren Code Review — Task Manager v2

**Reviewer:** Wren 🪶  
**Date:** 2026-05-28  
**Build:** Cinder v2 (MiniMax-M2.7)  
**Verdict:** ⚠️ **PASS WITH FIXES**

---

## Summary

The implementation is largely solid. SQL is safe throughout, error handling is consistent, SSE cleanup is correct, and the React component structure is clean. However, there are three issues worth fixing before considering this production-ready: one security hole in the attachment download route, one runtime crash bug in `TaskCreateModal`, and one UI incompleteness in `TaskModal`. Everything else is minor polish.

---

## Issues

---

### CRITICAL

---

**[CRITICAL-1] Path traversal vulnerability in attachment download**  
**File:** `server/routes/attachments.js` — `GET /:id/download`

The `Content-Disposition` header uses `attachment.filename` (the original user-supplied filename) without sanitization:

```js
res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
```

A filename containing `"` or `;` characters can break out of the quoted value and inject arbitrary header content. For example, a file named `foo"; filename="passwd` would produce a malformed header. While the stored path itself comes from the DB (not user input at download time), the filename field was set from `req.file.originalname` at upload time without stripping special characters.

Additionally, `res.sendFile(attachment.stored_path)` is called with an absolute path from the database. If the DB record were tampered with (or a bug introduced), there is no validation that `stored_path` is actually inside the `data/attachments/` directory. A check like `stored_path.startsWith(attachmentsDir)` before calling `sendFile` would prevent any hypothetical path escape.

**Fix required:**
1. Sanitize `filename` before storing: strip `"`, newlines, and path separators. A simple regex: `filename.replace(/["\r\n;/\\]/g, '_')`.
2. In the download route, validate `attachment.stored_path.startsWith(attachmentsBaseDir)` before calling `sendFile`.

---

**[CRITICAL-2] `TaskCreateModal` references `defaultColumnId` before it is defined**  
**File:** `client/src/components/TaskCreateModal.jsx` — line 9

```js
const [columnId, setColumnId] = useState(defaultColumnId || columns?.[0]?.id || '');
```

`defaultColumnId` is used as an initializer inside `useState`, but it is a **prop** — and props are not declared until the function signature. The correct destructuring is `{ columns, categories, onClose, onCreate }` — `defaultColumnId` is missing. This will always resolve to `undefined` at initialization time, meaning the column pre-fill feature from `KanbanColumn`'s "+ Add task" button is completely broken at runtime.

**Fix required:** Add `defaultColumnId` to the props destructuring:

```js
export default function TaskCreateModal({ columns, categories, defaultColumnId, onClose, onCreate }) {
```

---

### WARNING

---

**[WARNING-1] `TaskModal` category select renders no options — always shows "None"**  
**File:** `client/src/components/TaskModal.jsx` — category `<select>` block

The category select in `TaskModal` only has a hardcoded `<option value="">None</option>` and never iterates over the `categories` list:

```jsx
<select value={categoryId} onChange={...}>
  <option value="">None</option>
  {/* categories not rendered */}
</select>
```

`TaskModal` receives `task` and `project` as props but is never passed `categories`. As a result, users can see the category color dot on cards and set categories in `TaskCreateModal`, but cannot change a task's category after creation. This is a functional gap — not a crash, but a feature that silently doesn't work.

**Fix required:** Pass `categories` as a prop to `TaskModal` (both in the prop signature and from `App.jsx`), and render the options in the select.

---

**[WARNING-2] `handleCreateTask` in `App.jsx` ignores all fields except `columnId` and `title`**  
**File:** `client/src/App.jsx` — `handleCreateTask` function (line ~81)

```js
async function handleCreateTask(fields) {
  await createTask(fields.columnId, fields.title);
}
```

This function is defined but never actually called — `TaskCreateModal`'s `onCreate` prop is wired directly to an inline lambda in `App.jsx` that correctly calls `api.createTask(...)` with all fields. So the data loss doesn't happen in practice. However, the orphaned `handleCreateTask` is misleading dead code that could cause confusion if a future change routes through it instead of the inline lambda. Additionally, the inline `onCreate` handler in `App.jsx` calls `setShowCreateModal(false)` itself, which means `TaskCreateModal.handleSubmit` then also calls `onClose()` — double-close. Harmless since setting state to false twice is idempotent, but sloppy.

---

**[WARNING-3] `FilterBar` ignores `filters` prop — always initializes from localStorage**  
**File:** `client/src/components/FilterBar.jsx` — line 23

```js
const [localFilters, setLocalFilters] = useState(() => loadFilters());
```

`FilterBar` accepts a `filters` prop from `App.jsx` but ignores it entirely during initialization. `App.jsx` also independently initializes its own `filters` state from `loadFilters()`. The two are kept in sync only because `FilterBar` calls `onChange(localFilters)` on every change, which updates `App.jsx`. This works but creates an awkward two-source-of-truth situation. If `App.jsx` ever resets or overrides `filters` externally (e.g. a "clear all" action from outside `FilterBar`), `FilterBar` won't reflect it because its `localFilters` won't update. Low risk currently since clear-all is only inside `FilterBar`, but it's a fragile design.

---

**[WARNING-4] `updateTask` in `taskService.js` — double UPDATE when `columnId` changes**  
**File:** `server/services/taskService.js` — `updateTask` function

When a `columnId` change is included in a PATCH, the service runs two separate `UPDATE` statements:

1. One to update `column_id` and `position`
2. One to update all other fields (including `column_id` again, via `columnId ?? current.column_id`)

This means on a column-change PATCH, `column_id` is written twice. The second write correctly uses the new `columnId` so the final state is right, but the unnecessary double write and implicit re-read between statements is fragile. If the second UPDATE were to fail (e.g. a constraint violation on another field), the task would be in the destination column with a wrong position and none of the other fields updated. These two operations should be a single atomic UPDATE or wrapped in a transaction.

---

### MINOR

---

**[MINOR-1] `db.js` — `safeExec` silently swallows all errors including schema logic bugs**  
**File:** `server/db.js` — `safeExec` function

```js
function safeExec(sql) {
  try { db.exec(sql); } catch { /* ignore */ }
}
```

This is used for all `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` calls. While that's reasonable for idempotent schema ops on startup, it also silently suppresses genuine syntax errors in the SQL, making startup failures invisible. At minimum, the catch block should log the error: `catch (e) { console.warn('[DB] safeExec ignored:', e.message); }`.

---

**[MINOR-2] `TaskCard.jsx` — assignee avatar `key` prop uses array index**  
**File:** `client/src/components/TaskCard.jsx` — assignee rendering

```jsx
{displayAssignees.map((name, i) => (
  <div key={i} ...>
```

Using the array index as `key` is fine here since the list is slice-capped and display-only (no reordering), but it will trigger incorrect animations if React ever reconciles this list during an update. Should use `key={name}` or `key={name + i}` to be safe. Very low risk given usage.

---

**[MINOR-3] `TaskModal.jsx` — `useEffect` with `[task.id]` dependency will not update if task object reference changes but id stays same**  
**File:** `client/src/components/TaskModal.jsx` — `useEffect`

```js
useEffect(() => {
  setTitle(task.title);
  ...
  loadNotes();
  loadAttachments();
}, [task.id]);
```

The dependency is `task.id` only, so if the same task is updated externally (SSE event updates its fields) while the modal is open, the modal fields will not re-sync. The modal would show stale data. This is a pre-existing pattern, not new to v2, but worth noting since v2 added SSE event handling that makes this more likely to bite.

---

**[MINOR-4] `FilterBar.jsx` — `onChange` missing from `useEffect` dependency array**  
**File:** `client/src/components/FilterBar.jsx` — `useEffect`

```js
useEffect(() => {
  saveFilters(localFilters);
  onChange(localFilters);
}, [localFilters]);
```

`onChange` is missing from the deps array. If `onChange` changes identity between renders (e.g. due to an un-memoized callback in a parent), React's exhaustive-deps rule would flag this. In practice `App.jsx` passes `setFilters` directly (stable identity), so it won't cause bugs — but it's technically incorrect per the React rules.

---

**[MINOR-5] `KanbanColumn.jsx` — empty state shows "No matching tasks" even when no filter is active**  
**File:** `client/src/components/KanbanColumn.jsx`

The empty state message reads "No matching tasks" even when no filter is active and the column is genuinely empty. It should read "No tasks" when `filteredTasks === undefined` (unfiltered) and "No matching tasks" when filtering is active.

---

**[MINOR-6] `attachments.js` routes not prefixed with `/tasks/:taskId` for GET list**  
**File:** `server/routes/attachments.js`

The `GET /:taskId/attachments` and `POST /:taskId/attachments` routes are on `tasksRouter` (correct), but `DELETE /:id` and `GET /:id/download` are on `attachmentsRouter`. The router is mounted at `/api/v1/attachments`, so the download URL is `/api/v1/attachments/:id/download`. This is fine and consistent with `api.js` — just noting the split for future maintainers who might look for all attachment routes in one file.

---

## Non-Issues (Reviewed and Cleared)

- **SQL safety:** All queries use `?` parameterized bindings. No string interpolation in SQL. ✅
- **Multer limits:** 20MB cap is set. No file type allow-list (accept any type), which is acceptable for a personal tool. ✅
- **SSE cleanup:** `req.on('close')` and `req.on('error')` both call `removeClient` and `clearInterval`. Heartbeat is properly cleaned up. ✅
- **Error handling:** Every route has `try/catch` with a `500` fallback. No unhandled rejections visible. ✅
- **Assignees JSON:** `parseAssignees` has a `try/catch` fallback to `[]`. `createTask` and `updateTask` guard with `Array.isArray`. ✅
- **PRAGMA migration pattern:** Using `PRAGMA table_info(tasks)` + plain `ALTER TABLE` in individual try/catch is the correct workaround for SQLite's missing `ADD COLUMN IF NOT EXISTS`. ✅
- **Filter logic:** `applyFilters` in `FilterBar.jsx` correctly handles all three filter types (due date, priority, category). Date comparison logic is sound — `today` is correctly zeroed to midnight. ✅
- **React keys:** All list renders in new components use stable IDs as keys (category lists, attachment lists, note lists). ✅
- **useSSE hook:** Clean reconnect logic, uses ref to avoid stale closure on `onEvent`, proper cleanup in effect return. ✅

---

## Verdict: ⚠️ PASS WITH FIXES

**Must fix before shipping:**
1. **CRITICAL-1** — Sanitize filename before storing; validate stored_path before sendFile
2. **CRITICAL-2** — Add `defaultColumnId` to `TaskCreateModal` props destructuring

**Should fix soon:**
3. **WARNING-1** — Pass `categories` to `TaskModal` and render the options
4. **WARNING-2** — Remove dead `handleCreateTask` or consolidate; fix double-close pattern

Warnings 3 and 4 can be deferred if the team accepts the current behavior. The two criticals are quick fixes — likely 15 minutes of work total.
