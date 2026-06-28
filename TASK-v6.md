# TASK-v6.md — Virta: Polish + Subtasks

**Owner:** Patrick
**Builder:** Cinder (or whoever's available)
**Project root:** `/Users/colonelhoracegentleman/clawd/projects/task-manager/`
**Created:** 2026-06-27
**Status:** Draft — Patrick to confirm scope before build

---

## Context

Patrick wants a pass of polish on Virta's kanban/UI + the long-promised subtasks feature. v5 (calendar/iCal) is shipped. This v6 is mostly small surgical changes plus one new feature.

**Build order (small to big):**

1. Remove "On Hold" from default columns (#1)
2. Change ⌘K button to magnifying glass (#2)
3. Column header cleanup — remove inline +, move "Add task" to top, show count in parens (#4)
4. Hide completed tasks option (#3)
5. Untimed Today tasks ordering (#6)
6. Subtasks (#7)

All backend, frontend, and DB changes as needed. Run `npm run build` + restart service when done.

---

## 1. Remove "On Hold" from default columns

**Where:** `server/services/taskService.js:13`

```js
const DEFAULT_COLUMNS = ['Backlog', 'Prioritized', 'Active', 'On Hold', 'Completed'];
```

**Change to:**

```js
const DEFAULT_COLUMNS = ['Backlog', 'Prioritized', 'Active', 'Completed'];
```

**Migration:** None. Existing projects keep their "On Hold" column (data preserved). Only new projects skip it. If a user wants the column gone from an existing project, they delete it manually via Settings → Current Project → Columns.

**Why not auto-migrate:** Surprise data deletion is worse than the minor cleanup task. Be explicit.

---

## 2. ⌘K button → magnifying glass icon

**Where:** `client/src/components/Toolbar.jsx`

**Current:** Button with text "⌘K" that opens the command palette.

**Change to:** Button with 🔍 icon. Same onClick, same keyboard shortcut (⌘K). Tooltip becomes "Search & commands (⌘K)".

```jsx
<button
  onClick={onOpenCommandPalette}
  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200'}`}
  title="Search & commands (⌘K)"
>
  🔍
</button>
```

---

## 3. Hide completed tasks option

**Where:** `client/src/components/FilterBar.jsx`, `client/src/hooks/useTasks.js`, `client/src/App.jsx`

**Behavior:** When `hideCompleted` is true, the Completed column shows tasks moved there in the last 30 days only. Older tasks stay in the DB but don't render.

**Filter bar additions:** Add a checkbox "Hide completed older than 30 days" under a new "Display" section.

**State:** Persisted in `localStorage` like other filters (`loadFilters`/`saveFilters` in FilterBar).

**Implementation:**

- `applyFilters` in `FilterBar.jsx`: when `hideCompleted` is true, filter out tasks in the "Completed" column where `updated_at < now - 30 days`
- For other columns: completed tasks (if any exist there) also hidden when the toggle is on
- Default: `hideCompleted: true` — most users want this

**Wire up:**
- `App.jsx:91` (the `filteredTasksByColumn` useMemo): the filtering already runs through `applyFilters`, so just adding the field to the filter logic handles it.
- The `useTasks` hook already exposes task `column_name` (from the `getAllTasks` query), so we can detect "Completed" column membership.

---

## 4. Column header cleanup

**Where:** `client/src/components/KanbanColumn.jsx`

**Current state:** Header shows column name + task count + `+` button on the right. Below the column body is a "Add task" button with `+` icon.

**New layout:**

```
┌─────────────────────────┐
│ Backlog (3)   [+]  ⋮   │  ← name + count in parens, single + at right
├─────────────────────────┤
│  task card 1            │
│  task card 2            │
│  task card 3            │
│                         │
│  + Add task             │  ← moved to top OR kept below; pick below
└─────────────────────────┘
```

**Decision to make:** keep "+ Add task" below the task list (current position, just remove the duplicate `+` from header) or move it to the top of the column body.

**Recommendation:** keep at bottom (less visual noise at top, "Add task" lives where empty space usually is). Just remove the duplicate `+` from the header.

**Code change (lines 60-77 of KanbanColumn.jsx):**

```jsx
<div className={`flex items-center justify-between px-3 py-2.5 border-b ${headerBorder}`}>
  {isEditingName ? (
    <form onSubmit={handleRenameColumn} className="flex-1 mr-2">
      <input ... />
    </form>
  ) : (
    <h3
      className={`text-sm font-semibold cursor-pointer ${titleColor}`}
      onClick={() => setIsEditingName(true)}
    >
      {column.name} <span className={`text-xs font-normal ${countColor}`}>({taskCount})</span>
    </h3>
  )}
  <div className="flex items-center gap-1">
    {/* column actions menu (⋮) — kept if exists */}
  </div>
</div>
```

The bottom "Add task" button stays as-is.

---

## 5. Untimed Today tasks ordering

**Where:** `server/routes/calendar.js` (the `/calendar/today` endpoint)

**Current:** `tasks_untimed` returned in whatever order `getAllTasks` produces.

**New behavior:** Sort by:

1. Priority weight: `urgent` (4) > `high` (3) > `medium` (2) > `low` (1), descending
2. Tiebreaker: `created_at` ascending (oldest first — "this has been hanging around longest")

**Implementation:**

```js
const PRIORITY_WEIGHT = { urgent: 4, high: 3, medium: 2, low: 1 };

const sortedUntimed = tasksDue
  .filter(t => !t.due_date || !t.due_date.includes('T'))
  .sort((a, b) => {
    const pw = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
    if (pw !== 0) return pw;
    return new Date(a.created_at) - new Date(b.created_at);
  })
  .map(t => ({ ... }));
```

Apply this sort before returning in the `/today` endpoint's `tasks_untimed` field.

---

## 6. Subtasks (the big one)

### Design

Each task can have 0+ subtasks. Subtasks are first-class entities with their own due date, description, and completion state. They are NOT kanban cards — they live inside the parent task's modal.

**Completion semantics:** Parent task is NOT auto-completed when all subtasks are done. Patrick (or whoever) makes that decision explicitly. The parent shows a progress indicator (e.g. "3/7 done") so completion is visible at a glance.

**Today sidebar integration:** Subtasks with `due_date == today` show in the Today section, in a "Subtasks due today" group nested under their parent's name (or just listed as separate items if there's no obvious parent grouping). Open question — see below.

### Schema

**New table:** `subtasks`

```sql
CREATE TABLE IF NOT EXISTS subtasks (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    TEXT,
  completed   INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  position    REAL NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_due_date ON subtasks(due_date);
```

**Migration:** Idempotent — `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` in `server/db.js`. Add to the existing migration block.

### Service layer

**New file or extension:** `server/services/subtaskService.js` (or extend `taskService.js`). Functions:

```js
listSubtasks(taskId)        → subtask[]
getSubtask(id)              → subtask | null
createSubtask({ taskId, title, description, dueDate, position }) → subtask
updateSubtask(id, { title, description, dueDate, completed, position }) → subtask
deleteSubtask(id)           → boolean
```

**Auto-position:** when creating, append to end (max position + 1) within the task.

**Completion timestamp:** when `completed` flips from 0 to 1, set `completed_at = datetime('now')`. When flipping back to 0, clear `completed_at`.

### Routes

**New router:** `server/routes/subtasks.js` (or extend `tasks.js`)

```
GET    /api/v1/tasks/:taskId/subtasks        → list
POST   /api/v1/tasks/:taskId/subtasks        → create
PATCH  /api/v1/subtasks/:id                  → update
DELETE /api/v1/subtasks/:id                  → delete
```

Mount in `server/index.js`: `app.use('/api/v1', subtasksRouter);`

### Frontend — TaskModal additions

**Where:** `client/src/components/TaskModal.jsx`

**New section** after Notes, before attachments (or wherever feels right):

```
┌─ Subtasks (3/7) ──────────────────── [+ Add] ┐
│  ☑ Set up API key                             │
│  ☑ Wire calendar webhook                      │
│  ☑ Test delete endpoint                       │
│  ☐ Document OAuth flow                        │
│  ☐ Add to README                              │
│  ☐ Deploy to staging                          │
│  ☐ Email Patrick when done                    │
└──────────────────────────────────────────────┘
```

**Subtask row:**
- Checkbox (toggles `completed` via `PATCH`)
- Title (click to expand inline → description field + due date picker)
- Due date pill (small text, color-coded if overdue/due-today)
- Delete button on hover

**Add subtask:** inline input at bottom, Enter to save.

**Progress indicator:** "3/7" displayed in the section header. Updates live.

**Subtask data flow:**
- `useEffect` on task change → load subtasks
- Local state for the list, optimistic updates on toggle
- Save via API, refresh on error

### Today sidebar integration

**Where:** `client/src/components/TodaySidebar.jsx` + `server/routes/calendar.js`

**Behavior:** Subtasks with `due_date == today` appear in the Today section, grouped under their parent task name. If a subtask has a specific time, it goes into the timeline. If no time, it goes into the "Tasks Due Today" section with a small "(subtask of [parent name])" hint.

**Implementation in `/today` endpoint:**

```js
const subtasksDue = ... // fetch subtasks where due_date is in [dayStart, dayEnd]
```

Add to the response:

```js
{
  timeline: [...],  // existing
  tasks_untimed: [...],  // existing parent tasks
  subtasks_untimed: [
    {
      id: subtask.id,
      parent_task_id: subtask.task_id,
      parent_title: parent.title,
      title: subtask.title,
      completed: subtask.completed,
      priority: parent.priority
    }
  ],
  tasks_completed: [...],
  subtasks_completed: [...]
}
```

Frontend renders these as additional rows in the relevant sections.

### Open questions for Patrick before build

1. **Subtask in Today sidebar:** separate items, or nested under parent? (leaning separate for simplicity)
2. **Reordering:** drag-to-reorder subtasks within a task? (leaning yes — uses existing dnd-kit)
3. **Recurring subtasks:** out of scope for v6, but data model should support `parent_subtask_id` later if needed
4. **Subtask notes:** description field on each subtask, or share the parent's notes? (leaning own description)

### Definition of Done for #7

- [ ] `subtasks` table created, indices added
- [ ] Service layer + routes wired
- [ ] TaskModal shows subtask list with progress indicator
- [ ] Add/edit/delete/toggle complete all work
- [ ] Today sidebar shows subtasks due today (separate items, with "(under [parent])" hint)
- [ ] Existing tests/QA pass
- [ ] No regressions to existing v5 features

---

## Cross-cutting rules

- **Don't change stack, port, or launchd config**
- **npm run build** + **service restart** at end
- All new DB tables: idempotent CREATE IF NOT EXISTS
- All new routes: wrap in try/catch with appropriate HTTP codes
- No silent data loss — migrations must be additive (CREATE TABLE, ADD COLUMN, never DROP)
- New client state follows existing patterns: useState + useEffect + api.X

---

## Out of scope (deferred)

- Subtask templates (recurring subtasks)
- Subtask assignment to specific people
- Subtask-level time tracking
- Bulk operations (close all subtasks at once)
- Subtask-to-subtask dependencies (X blocks Y)

---

## Estimated effort

| Item | Effort |
|---|---|
| 1. Remove "On Hold" | 5 min |
| 2. ⌘K → 🔍 | 5 min |
| 3. Hide completed > 30 days | 1 hour |
| 4. Column header cleanup | 30 min |
| 5. Untimed Today ordering | 15 min |
| 6. Subtasks (schema + service + routes + UI + Today integration) | 4-6 hours |
| **Total** | **6-8 hours** |

Realistic build session: half a day.

---

## Related docs

- `TASK-v5.md` — iCal pivot, Today sidebar (just shipped)
- `tools/agent-capabilities.md` — what's needed for daily briefing integration
- `projects/virta-multi-account-roadmap.md` — Milestone 1 (daily briefing) will read `/calendar/today` which now includes subtasks

*Last updated: 2026-06-27*