# TASK — Virta Tasks: Completed system folder + timeframe filter + manual sort

**Status:** Ready for Cinder (Builder) — queue this after round 26 (manual-entry redesign) Wren review passes
**Estimated scope:** 4-7 hours of build work
**Author:** Rusty (per Patrick's call 2026-07-09 12:45-12:47 MDT)
**Date:** 2026-07-09 12:50 MDT
**Branch:** TBD (Rusty decides — likely `main` or a feature branch)

---

## Goal

Three related fixes to the Virta Tasks kanban:

1. **Make "Completed" a system column** — pre-seeded per project, not deletable, not renameable. Tasks can be completed in two ways: drag to the Completed column, OR mark complete in the task modal (which auto-moves it to Completed).
2. **Timeframe filter on the Completed view** — options: `1 day | 1 week | 2 weeks | 1 month | 1 year | All`. **Default: 1 week.** Replaces the current "Hide completed older than 30 days" toggle.
3. **Fix manual drag-and-drop sort within columns** — currently the columns only sort by date. Recent work gets buried because there's no way to manually re-order. Add a sort mode (auto by date, or manual drag-drop order) and surface it in the UI.

## Background

Read these files for context before starting:

- **`client/src/components/KanbanBoard.jsx`** (91 lines) — the current kanban. Uses `@dnd-kit/sortable`. The `arrayMove` import is already there but may not be wired up to actual column-internal reordering.
- **`client/src/components/FilterBar.jsx`** — the "Hide completed older than 30 days" toggle is at line 128. This is what we're replacing.
- **`client/src/components/TodaySidebar.jsx`** — references `Completed` as a status. The current model treats Completed as a column within each project, not a system-level concept.
- **`server/db.js`** — projects have `columns` JSON. Look at how columns are seeded (whether each project gets a default Completed or the user creates it). Look at the `tasks` table for `column_name`, `completed`, `updated_at`, and any sort/position fields.
- **`client/src/components/TaskModal.jsx`** — the task edit modal. Has a "Mark complete" or similar action. This is one of the two ways to complete a task.

## What to build

### Part 1: Completed as a system column

**Schema / data layer:**

- Each project should have a pre-seeded `Completed` column. Two paths to get here:
  - **(A) Migration:** run a one-time migration that ensures every existing project has a `Completed` column with `is_system: true` and a fixed id (e.g., `__completed__`).
  - **(B) Lazy creation:** on project load, if the project's columns don't include `Completed`, add it before rendering.
- Pick (A) for explicitness. (B) is fine if you can verify the migration runs on every deploy.
- The Completed column cannot be deleted or renamed via the column-edit UI. If a user tries, show an inline message: "Completed is a system column and can't be changed."
- The Completed column can have a different visual treatment: a checkmark icon next to the name, slightly faded text, etc.

**Task-modal completion:**

- In `TaskModal.jsx`, the "Mark complete" action currently sets `task.completed = true`. Now it should ALSO move the task to the Completed column (set `column_name = 'Completed'` or `column_id = '__completed__'`, whichever the schema uses).
- Conversely, "Mark incomplete" should move the task back to its previous column. Capture the previous column on completion so you can restore it. (See schema notes below.)

**Drag-to-Completed:**

- Existing drag-to-column behavior should continue to work for Completed. Drop a task on the Completed column header → it gets `column_name = 'Completed'`, `completed = true`, and `updated_at = now()`.

### Part 2: Timeframe filter on Completed

**UI:**

- Add a timeframe selector to the Completed column header. Options: `1 day | 1 week | 2 weeks | 1 month | 1 year | All`. **Default: 1 week.**
- Replaces the existing "Hide completed older than 30 days" toggle in `FilterBar.jsx` — remove that toggle.
- The filter is column-scoped (only affects what shows in the Completed column), not global. (If the user wants a global hide, that's a separate feature.)
- When the filter hides some tasks, show a small muted line at the bottom of the column: *"3 older tasks hidden. Show all."* — clicking expands to All.

**Logic:**

- "1 day" = completed in the last 24 hours.
- "1 week" = completed in the last 7 days.
- "2 weeks" = 14 days.
- "1 month" = 30 days.
- "1 year" = 365 days.
- "All" = no filter.
- The filter is applied client-side (just filter the existing array). No server-side change needed for v1. If performance becomes an issue with very large datasets, server-side filtering is a future change.

**Persistence:**

- The user's selected timeframe should persist in localStorage (like the existing `hideCompleted` toggle). Key: `virta-tasks-completed-timeframe`. Default: `1 week`.

### Part 3: Manual drag-and-drop sort within columns

**Investigation first (don't skip this):**

- Read `KanbanBoard.jsx` carefully. The `arrayMove` import from `@dnd-kit/sortable` is a strong hint that the foundation is there but the wiring isn't complete. Identify where the gap is.
- Likely issue: the column's `tasks` array is re-sorted by date on every render, so manual reorder is overwritten.
- Likely fix: add a `sort_mode` field to each column (or a project-level setting). When `sort_mode = 'manual'`, preserve the user's drag-drop order. When `sort_mode = 'date'`, sort by `updated_at` (or `created_at`, or `due_date` — pick the most useful).

**UI:**

- Each column header gets a small sort-mode toggle. Default: 'date'. Options: 'date' (default) or 'manual'.
- When 'manual' is selected, the user can drag tasks within the column to reorder them. The order persists in the `tasks[].position` field.
- When 'date' is selected, manual drag-drop within the column is disabled (tasks snap back to date order). Drag-to-other-columns still works.

**Schema:**

- Add a `position` field to the `tasks` table (integer). When a column is in 'manual' sort mode, tasks are ordered by `position` ascending. When in 'date' mode, `position` is ignored. New tasks get `position = max(position) + 1` (or NULL, sort nulls last).
- The Completed column defaults to 'date' sort mode. (Manual reorder doesn't make much sense in a "review your recent work" view.)

**Migration:**

- For existing tasks, set `position = id` (or some monotonic value based on created_at). This way, manual sort starts from the existing date order, and the user can re-arrange from there.

## Files to modify

**Server:**

- `server/db.js` — schema for `tasks.position`, project column structure
- `server/routes/tasks.js` (or wherever) — accept `position` on task update, default sort when `sort_mode = 'date'`
- Any migration script — seed `is_system: true` on the Completed column for existing projects

**Client:**

- `client/src/components/KanbanBoard.jsx` — fix the drag-drop wiring, add sort-mode toggle
- `client/src/components/Column.jsx` (or similar) — add timeframe selector, sort-mode toggle, "X hidden" footer
- `client/src/components/FilterBar.jsx` — remove the "Hide completed older than 30 days" toggle (replaced by the column-level filter)
- `client/src/components/TaskModal.jsx` — "Mark complete" now also moves to Completed column; "Mark incomplete" restores the previous column
- `client/src/components/ColumnEditModal.jsx` (or similar) — prevent rename/delete of system columns with an inline message
- `client/src/lib/columns.js` (if exists) — helper for system column IDs and metadata

**Tests:**

- Whatever test setup exists for the kanban (Playwright? Vitest? Read `client/src/__tests__` or similar to find out)
- New tests:
  - Completed column can't be deleted
  - Completed column can't be renamed
  - Marking complete in the modal moves the task to the Completed column
  - Marking incomplete moves the task back to the previous column
  - Timeframe filter defaults to 1 week
  - Timeframe filter persists across reloads
  - Manual sort mode preserves drag-drop order
  - Date sort mode re-orders by date
  - Drag-to-Completed works
  - When 'manual' is selected, the sort mode toggle is sticky across reloads

## Don't do

- **Don't change the project column model** — projects still own their own column set. Just add a system column.
- **Don't make Completed a global cross-project folder** — per-project only. (Discussed with Patrick 2026-07-09 12:47 MDT. May revisit later.)
- **Don't add a "Recently completed" section to TodaySidebar** — that's a different feature.
- **Don't change the "Hide completed" filter into a "Show only completed" filter** — the timeframe filter is the new way; the old toggle goes away.
- **Don't make Completed filterable server-side** in v1. Client-side filter is fine for now.
- **Don't break existing user data** — the migration should be additive (add `is_system` flag, add `position` field with sensible default), not destructive.
- **Don't move or rename the `Today` or `Inbox` system columns** — only `Completed` is in scope for this task.

## Definition of done

- [ ] Migration runs cleanly on the dev database. Existing projects get the `is_system: true` flag on their Completed column.
- [ ] `Completed` column can't be deleted or renamed in the UI.
- [ ] Marking complete in the task modal auto-moves the task to the Completed column.
- [ ] Marking incomplete moves the task back to the previous column.
- [ ] Drag-to-Completed works.
- [ ] Timeframe filter shows on the Completed column header with the 6 options.
- [ ] Default is 1 week.
- [ ] Filter persists across reloads.
- [ ] "X older tasks hidden. Show all." footer link works.
- [ ] Each column has a sort-mode toggle (date | manual). Default is date.
- [ ] Manual sort mode preserves drag-drop order across reloads.
- [ ] Date sort mode re-orders by date (recently updated first, per current behavior).
- [ ] The "Hide completed older than 30 days" toggle in FilterBar is removed.
- [ ] All existing tests still pass.
- [ ] New tests cover the behaviors above.
- [ ] Code is committed (single commit or logical sequence — your call). Branch is pushable.
- [ ] Wren can review the diff and sign off without confusion.

## When done

Push a completion event with:
- 2-3 line summary
- The commit hash(es) and branch name
- Any deviations from this brief
- Anything you'd flag for Wren's review (especially around the `position` field migration and the sort-mode UX edge cases)
