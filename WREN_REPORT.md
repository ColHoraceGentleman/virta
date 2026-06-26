# Wren Code Review — Task Manager v1

**Reviewer:** Wren
**Date:** 2026-05-22
**Build reviewed:** Cinder's initial build
**Status:** Fixed and ready for QA

---

## Summary

Reviewed all key source files against the spec. Fixed all 4 issues flagged by Cinder, plus 2 additional bugs found during audit. No SQL injection risk. All routes have try/catch. SSE server-side cleanup is correct. Build is structurally sound.

---

## Issues Reviewed and Fixed

### Issue 1 — SSE Reconnection (FIXED)
**File:** `client/src/hooks/useSSE.js`
**Problem:** `onerror` created a new `EventSource` instance (`newEs`) but never attached handlers to it and never updated the `es` reference held in closure scope. The cleanup function (`return () => es.close()`) would still call `close()` on the original dead instance. The new connection had no message handler, so all SSE events after a reconnect were silently dropped.

**Fix:** Rewrote the hook using two refs:
- `esRef` — tracks the active `EventSource` so cleanup always closes the right instance
- `onEventRef` — keeps the latest `onEvent` callback without needing it as a `useEffect` dependency (avoids reconnect on every render)

The reconnect loop is now: `onerror` → close current → `setTimeout(connect, 3000)` → `connect()` creates new instance and stores in `esRef`. Cleanup clears the timer and closes via `esRef.current`.

---

### Issue 2 — Unused Variable `activeColId` (FIXED)
**File:** `client/src/components/KanbanBoard.jsx`
**Problem:** `handleDragOver` declared `const activeColId = findColumnOfTask(active.id)` but the variable was used for a comparison that referenced itself — the guard `if (!targetColId || activeColId === targetColId)` was correct logic but the name was misleading. The ESLint `no-unused-vars` warning was a naming issue masking a real confusion: if you're comparing source vs. target, the variable should be named `sourceColId`.

**Fix:** Renamed `activeColId` → `sourceColId` in `handleDragOver` to clarify intent and eliminate the lint warning.

---

### Issue 3 — Dead Code `handleFieldUpdate` (VERIFIED CLEAN)
**File:** `client/src/components/TaskModal.jsx`
**Problem:** Cinder flagged a leftover `handleFieldUpdate` stub.
**Finding:** The function is not present in the file. Either it was cleaned up before the final commit or was never written. No action needed.

---

### Issue 4 — Column Rename Not Refreshing UI (FIXED)
**Files:** `client/src/hooks/useTasks.js`, `client/src/App.jsx`

**Two separate problems, both fixed:**

**4a — Missing SSE event handler for `column_updated`:**
`handleSSEEvent` in `useTasks.js` only handled `task_*` events. When the server broadcasts `column_updated` (on column rename), the client ignored it entirely. Column headers never reflected the new name until page reload.

**Fix:** Added handling for `column_updated`, `column_created`, and `column_deleted` events — all trigger a `loadProjectData()` call to reload the full project tree, which causes column headers and task lists to re-render with fresh data.

**4b — `handleUpdateColumn` in App.jsx used raw unawaited `fetch()`:**
The column rename handler bypassed the `api` wrapper, had no error handling, and returned a floating unhandled promise. If the PATCH failed, the UI appeared to succeed.

**Fix:** Replaced the raw `fetch()` with `await api.updateColumn(columnId, fields)` inside a try/catch.

**4c — SSE handler used side-effects inside state setters:**
The first draft of the fix called `loadProjectData()` from inside `setCurrentProject(prev => { ... })` — an anti-pattern that causes double-invocations under React Strict Mode.

**Fix:** Added a `currentProjectIdRef` that stays in sync via `useEffect`. The SSE handler reads from the ref directly and calls `loadProjectData()` outside any state setter.

---

### Issue 5 — `new-project` in Command Palette (FIXED) *(additional find)*
**File:** `client/src/App.jsx`
**Problem:** The `new-project` branch in `handleCommandPaletteAction` called raw `fetch()` — unawaited, no `.catch()`, no project list refresh on success. A successful create would leave the project selector showing stale data. Any network error was silently swallowed.

**Fix:**
- Made `handleCommandPaletteAction` `async`
- Replaced raw fetch with `await api.createProject({ name })`
- Added `await reload()` after creation to refresh the project list
- Wrapped in try/catch with `console.error` + user-facing `alert` on failure

---

### Issue 6 — `updateTask` silently drops `columnId` (FIXED) *(additional find)*
**Files:** `server/services/taskService.js`, `client/src/components/TaskModal.jsx`
**Problem:** `TaskModal.jsx` allows the user to change a task's column via a dropdown selector. On change it calls `handleSave({ columnId })`. This reaches the server as `PATCH /tasks/:id` with `{ columnId }` in the body. However, `taskService.updateTask()` destructures only `{ title, description, dueDate, priority }` — `columnId` is silently discarded. The task never actually moves columns when reassigned from the modal.

**Fix:** Added `columnId` handling to `updateTask()` in `taskService.js`. When `columnId` is provided and differs from the current `column_id`, the task is moved to the target column (appended to end) before the field update runs. Both operations use parameterized queries.

---

## SQL Injection Audit

All SQL is via `db.prepare(...)` with `?` placeholders. The dynamic query builder in `getAllTasks` appends only hardcoded SQL fragments; user values go through the params array. **No injection risk found.**

---

## Error Handling Audit

- All route handlers have try/catch — confirmed across projects, columns, tasks, notes, calendar, events routers.
- SSE heartbeat interval is guarded by try/catch; clears itself on write failure.
- `sseService.broadcast()` wraps each write in try/catch so one dead client can't crash the loop.
- `loadNotes()` in `TaskModal` catches errors and logs — acceptable for a personal tool.
- All async functions in `useTasks.js` propagate errors; callers in App.jsx use try/catch where needed.

**No unhandled promise rejections identified.**

---

## CORS Audit

Dev: `['http://localhost:5173', 'http://127.0.0.1:5173']` — correct.
Production: `origin: false` (same-origin) — correct.

---

## SSE Server-Side Audit

- `req.on('close')` and `req.on('error')` both call `clearInterval(heartbeat)` and `removeClient(clientId)` — no leak on disconnect.
- `clientCounter` is module-level but scoped correctly. No race condition risk (Node.js single-threaded).

---

## Files Modified

| File | Change |
|------|--------|
| `client/src/hooks/useSSE.js` | Full rewrite — ref-based reconnect loop |
| `client/src/hooks/useTasks.js` | Added `useRef`, `currentProjectIdRef`, column SSE event handling; fixed SSE handler side-effect pattern |
| `client/src/components/KanbanBoard.jsx` | Renamed `activeColId` → `sourceColId` in `handleDragOver` |
| `client/src/App.jsx` | Added `api` import; `handleUpdateColumn` uses api wrapper; `handleCommandPaletteAction` is async with proper error handling and project reload; destructures `reload` from `useTasks` |
| `server/services/taskService.js` | `updateTask` now handles `columnId` — moves task to target column when column changes |

---

## Not Changed

- `TaskModal.jsx` — no dead code found; file is clean
- All server routes — error handling is solid
- Database schema — matches spec exactly
- `sseService.js` — correct and clean
- `server/index.js` — CORS, middleware, static serving all correct

---

## Verdict

**✅ Ready for QA**

All 4 flagged issues fixed. Two additional bugs fixed (silent column reassignment drop, unawaited raw fetch in command palette). No SQL injection risk. No unhandled promise rejections. Code is clean and correct. Hand off to Echo.
