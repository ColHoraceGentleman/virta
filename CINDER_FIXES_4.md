# CINDER_FIXES_4.md — Virta v4 Patch (Post-Wren Review)

**Date:** 2026-05-29
**Fixes applied:** MODERATE-1, MODERATE-2, MINOR

---

## MODERATE-1 — `deleteColumn` last-column guard

**File:** `server/services/taskService.js` → `deleteColumn()`

Added a count check before deletion: if the project has only 1 column, throw `Error('Cannot delete the last column in a project')`. Also refactored to fetch all columns upfront and find the migration target via `Array.find`, replacing the `LIMIT 1` query. The throw propagates to `server/routes/columns.js` where the DELETE route now catches it and returns `400` with code `LAST_COLUMN`. The `ColumnRow` in `SettingsModal` receives `isOnlyColumn={sortedColumns.length === 1}` and renders a visually-disabled, tooltipped trash icon (no `onClick`) when it's the only column.

## MODERATE-2 — `createProject` wrapped in a DB transaction

**File:** `server/services/taskService.js` → `createProject()`

Replaced the bare INSERT + forEach with `db.transaction()` containing both the project INSERT and the 5 `createColumn()` calls. If any column insert fails, the entire transaction rolls back and the orphan project row cannot exist.

## MINOR — Dead `window.__firstColumnName` + double confirm

**File:** `client/src/components/SettingsModal.jsx`

Two fixes:
1. Removed the dead `window.__firstColumnName` reference from `ColumnRow.handleDelete` — replaced with `firstColName` prop passed from the parent.
2. Removed the redundant confirmation from `handleDeleteColumn` (the parent) — it now calls `onDeleteColumn` directly without re-checking `taskCount` or calling `confirm()`. All confirmation UX now lives in `ColumnRow.handleDelete` where the user interaction originates.

---

**Build:** ✅ Clean (`npm run build` — 460ms, no errors or warnings)
**Restart:** ✅ `launchctl kickstart` succeeded
