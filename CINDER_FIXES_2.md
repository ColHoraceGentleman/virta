# Cinder Fixes Report #2 (2026-05-28)

**Built by:** Cinder 🔥  
**Reviewed by:** Wren 🪶  
**Date:** 2026-05-28

---

## Critical Fixes Applied

### CRITICAL-1 — Path traversal & header injection in attachment download

**Files:** `server/routes/attachments.js`, `server/routes/tasks.js`

**Download route (`attachments.js`):**
- Added `attachmentsBaseDir = path.join(process.cwd(), 'data', 'attachments')`
- Before calling `sendFile()`, resolved `stored_path` with `path.resolve()` and verified it starts with `attachmentsBaseDir`. Returns 403 if the path has escaped.
- Sanitized `attachment.filename` before setting `Content-Disposition` header — stripped all `"`, `\r`, `\n`, `;`, and `\` chars.

**Upload route (`tasks.js`):**
- Added `safeFilename = req.file.originalname.replace(/["\r\n;/\\]/g, '_')` — sanitized at INSERT time before storing in DB. Used `safeFilename` in both the stored filename and the DB column.

---

### CRITICAL-2 — `TaskCreateModal` missing `defaultColumnId` prop destructuring

**File:** `client/src/components/TaskCreateModal.jsx`

Fixed the function signature:
```js
// Before (broken)
export default function TaskCreateModal({ columns, categories, onClose, onCreate }) {

// After (fixed)
export default function TaskCreateModal({ columns, categories, defaultColumnId, onClose, onCreate }) {
```
The `useState` initializer `useState(defaultColumnId || columns?.[0]?.id || '')` now correctly receives the prop.

---

## Warning Fixes Applied

### WARNING-1 — `TaskModal` category select wired up

**Files:** `client/src/components/TaskModal.jsx`, `client/src/App.jsx`

- Added `categories` to `TaskModal` prop destructuring in its function signature
- Added `categories={categories}` prop when rendering `TaskModal` in `App.jsx`
- Populated the category `<select>` options:
```jsx
<option value="">None</option>
{(categories || []).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
```

### WARNING-2 — Dead/double-close code in `App.jsx`

- Removed the orphaned `handleCreateTask` function (it only passed `columnId` + `title`, ignoring all other fields)
- Removed `setShowCreateModal(false)` from the `onCreate` handler — the modal closes itself via `onClose()` after creation, making the explicit state-set redundant and the source of the double-close

---

## Minor Fixes Applied

### MINOR-1 — `safeExec` should log errors

**File:** `server/db.js`

```js
// Before
function safeExec(sql) {
  try { db.exec(sql); } catch { /* ignore */ }
}

// After
function safeExec(sql) {
  try { db.exec(sql); } catch (e) { console.warn('[DB] safeExec ignored:', e.message); }
}
```

### MINOR-5 — Empty column placeholder text

**File:** `client/src/components/KanbanColumn.jsx`

Changed "No matching tasks" (shown unconditionally) → "Drop tasks here" which is appropriate for an empty unfiltered column.

---

## Verification

- `npm run build` — ✅ clean (422ms, no errors/warnings)
- `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager` — ✅ restarted
- `curl -s http://localhost:3001/api/health` — ✅ `{"status":"ok",...}`
