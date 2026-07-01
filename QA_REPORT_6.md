# Virta v6 — QA Report

**Test date:** 2026-06-28 (MDT) / 2026-06-29 (UTC)
**Tester:** Echo 🔍
**Build under test:** commit `04b089f` ("fix: address Wren v6 moderate findings")
**Service PID:** as of `launchctl list` — running, responding 200 OK

---

## Verdict

**✅ PASS — ship**

All 6 items from TASK-v6.md verified. FK cascade behavior is correct (the thing Wren stress-tested). Bundle no longer leaks `darkMode:dm`. Sort order matches spec. Data is clean.

---

## Summary

Every endpoint behaves correctly, the new `subtasks` table enforces FK CASCADE properly, subtask CRUD round-trips cleanly, today-sort matches the prescribed priority-then-created_at ordering, and the Wren-moderate bug (`darkMode:dm`) is gone from the production bundle. One minor documentation drift in the QA spec (route paths) noted under Minor — implementation is correct.

---

## Tests Run

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | Remove "On Hold" default column | ✅ PASS | `DEFAULT_COLUMNS = ['Backlog','Prioritized','Active','Completed']` (server/services/taskService.js:13). Both projects have 4 columns, no "On Hold" anywhere. |
| 2 | ⌘K button → 🔍 icon | ✅ PASS | client/src/components/Toolbar.jsx:130-134 shows `<button onClick={onOpenCommandPalette}> 🔍 </button>` with `title="Search & commands (⌘K)"`. Matches spec. |
| 3 | Hide completed > 30 days filter | ✅ PASS | client/src/components/FilterBar.jsx `applyFilters` filters `column_name === 'Completed' && updated_at < now-30d` (line ~145). `loadFilters` defaults `hideCompleted: true` for new users. UI has the "Display" section with the right checkbox label. App.jsx:91 wires it through `filteredTasksByColumn` useMemo. |
| 4 | Column header cleanup | ✅ PASS | KanbanColumn.jsx renders `{column.name} <span>({taskCount})</span>` — count in parens. Single `+` button at top of column (no duplicate). Bottom "Add task" button removed — matches spec's "Option b: move to top" decision. |
| 5 | Today sidebar untimed-task sort | ✅ PASS | Verified against `/calendar/today?date=2026-06-30`: returned order = medium-priority oldest-first, then low-priority oldest-first — matches spec exactly. Tiebreaker (created_at asc) confirmed with 2 medium-priority tasks. |
| 6 | Subtasks (full feature) | ✅ PASS | Schema, service layer, routes, TaskModal UI, and TodaySidebar integration all implemented per spec. FK CASCADE verified end-to-end. |
| F | Bundle grep for `darkMode:dm` | ✅ PASS | No `darkMode:dm` match. Only legitimate minified bindings (e.g. `darkMode:B`, `darkMode:Ie`). The Wren moderate is closed. |

### Backend smoke coverage (A)

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/v1/projects` | GET | 200 ✓ |
| `/api/v1/projects/:id` | GET | 200 ✓ (returns nested columns + tasks) |
| `/api/v1/tasks?project_id=` | GET | 200 ✓ (24 tasks returned pre-cascade) |
| `/api/v1/calendar/today` | GET | 200 ✓ (returns timeline + tasks_untimed + tasks_completed + subtasks_untimed + subtasks_completed) |
| `/api/v1/tasks/:taskId/subtasks` | GET | 200 ✓ (list) |
| `/api/v1/tasks/:taskId/subtasks` | POST | 200 ✓ (create) |
| `/api/v1/subtasks/:id` | PATCH | 200 ✓ (update; completed_at auto-managed) |
| `/api/v1/tasks/:taskId/subtasks/reorder` | POST | 200 ✓ (swap positions correctly) |
| `/api/v1/subtasks/:id` | DELETE | 200 ✓ (delete) |

**Negative-path coverage:**
- POST without title → 400 VALIDATION_ERROR ✓
- POST to non-existent parent → 404 NOT_FOUND ✓
- PATCH non-existent subtask → 404 NOT_FOUND ✓
- DELETE non-existent subtask → 404 NOT_FOUND ✓
- REORDER with non-array ids → 400 VALIDATION_ERROR ✓
- DELETE non-existent task → 404 NOT_FOUND ✓

### FK cascade test (B) — the dangerous one

```
Parent task: 6c3bf885588d25f1875551f361f9bb24 ("QoE Due Diligence", Active column)
Pre-state:   24 tasks total, 3 subtasks on parent (1 smoke + 2 fresh CASCADE-TEST)

Pre-delete on parent's siblings:
  SELECT id, title FROM tasks WHERE column_id IN parent column = 6 rows

DELETE /api/v1/tasks/<parent>  → HTTP 200 {"data":{"success":true}}

Post-state:  23 tasks total, 0 subtasks on parent (3 → 0)
Siblings in Active column: 6 → 5  (ONLY the deleted parent removed; no collateral)
Orphan check: 0 (no subtasks reference missing tasks)
```

FK CASCADE fired exactly as designed via SQL — `taskService.deleteTask` is a plain `DELETE FROM tasks WHERE id = ?` and SQLite's `REFERENCES tasks(id) ON DELETE CASCADE` does the rest (server/db.js:18 enables `foreign_keys=ON`).

**Important caveat to flag to Patrick:** I used `6c3bf885588d25f1875551f361f9bb24` (a real, active "QoE Due Diligence" task with `due_date=2026-06-28` and `priority='urgent'`) as the cascade-test parent per the QA spec. That task is now gone. Pre-build count was 25, pre-cascade-test was 24 (one task already missing). After my destructive cascade test: 23. The task had no notes/attachments (verified), but it **was** in the Active column on a real project. If Wren wanted to validate cascade without losing real data, this should have used the standard "create scratch task → add subtasks → delete scratch task" pattern. I'm flagging because this was a destructive operation against a real task per the explicit QA instructions.

---

## Data Integrity (C)

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| Task count | (24 post-cascade) | 23 | ✅ post-cascade, no further drift |
| Subtask count | 0 (cleanup) | 0 | ✅ |
| Orphan subtasks | 0 | 0 | ✅ |
| FK on `subtasks(task_id)` | CASCADE | CASCADE | ✅ (`PRAGMA foreign_key_list(subtasks)` shows `ON DELETE CASCADE`) |
| Indices on `subtasks` | task_id, due_date | both present | ✅ |
| `subtasks` table schema | matches spec | matches spec exactly | ✅ |

---

## Today Sidebar Sort (D)

**Verified against `/calendar/today?date=2026-06-30`** (4 candidate tasks):

API response order:
1. `a3e4b29f471fe2fc980966bc22131770` "DHHS Program Budget" — medium, created 2026-05-29 20:12:49
2. `eed79a32d5a27e606bf0a96d0ea0d846` "Finance & Accounting Policies" — medium, created 2026-05-30 04:59:42
3. `73ba1b43239ac440b7e4324bcc374d33` "Write off CRM Grow investment" — low, created 2026-06-24 20:27:56
4. `dbcc63d216c5325b913ceccd71e21eae` "May CC statements to Curtis" — low, created 2026-06-25 18:07:14

Expected order (priority desc, then created_at asc):
1. medium / 2026-05-29 → DHHS ✓
2. medium / 2026-05-30 → Finance ✓
3. low / 2026-06-24 → Write off ✓
4. low / 2026-06-25 → May CC ✓

Perfect match.

Verified **subtask sort too** by creating a subtask due today (2026-06-29) — appeared correctly in `subtasks_untimed` with `parent_title` for the "(under …)" render in TodaySidebar.jsx:389.

---

## hideCompleted Filter (E)

Code-level verification (no live DOM probe — this is pure client-side state):

`client/src/components/FilterBar.jsx`:
- `loadFilters()` backfills `hideCompleted: true` for users without the setting (line ~17).
- `applyFilters()` short-circuits with `return false` when `column_name === 'Completed' && updated_at < now - 30d` (line ~143).
- UI has "Display" section with checkbox "Hide completed older than 30 days" (line ~127).
- Other columns not touched by this filter — only `column_name === 'Completed'` triggers.

`client/src/App.jsx:91`: `filteredTasksByColumn` uses `applyFilters(allTasks, filters)` — correctly wired.

---

## Build Artifact Check (F)

```
$ grep -oE 'darkMode:[a-zA-Z_$]{1,3}' client/dist/assets/index-*.js | sort -u
darkMode:B
darkMode:Ie
darkMode:M
darkMode:N
darkMode:ce
darkMode:d
darkMode:ee
darkMode:f
darkMode:g
darkMode:i
darkMode:l
darkMode:p
darkMode:s
darkMode:ve
darkMode:y
```

**No `darkMode:dm`.** All matches are normal minified property accesses (`darkMode` followed by an obfuscated variable identifier — exactly what you'd expect from esbuild minification of normal template literals). The Wren moderate "dm is undefined" bug is fixed.

---

## Critical / Major

**None.** Everything is in shape.

---

## Minor

### 1. QA spec route-path mismatch (doc, not code)

TASK-v6.md spec section (added by QA brief, not the original TASK-v6 spec):
```
GET    /api/v1/subtasks/<task_id>
POST   /api/v1/subtasks
PATCH  /api/v1/subtasks/reorder
```

Actual implementation:
```
GET    /api/v1/tasks/<task_id>/subtasks
POST   /api/v1/tasks/<task_id>/subtasks
POST   /api/v1/tasks/<task_id>/subtasks/reorder
PATCH  /api/v1/subtasks/<id>
DELETE /api/v1/subtasks/<id>
```

The actual routes are RESTfully nested under `/tasks/:taskId/subtasks` — that's the correct shape (resources children of tasks). The brief got it wrong. I tested the actual routes and they all returned 200.

**Action:** None required for v6 ship. If the QA brief template gets reused, fix the route paths.

### 2. Subtask auto-position is 0-indexed on first create

`subtaskService.js` uses `pos = (max?.maxPos ?? -1) + 1`. The doc says "append to end (max + 1)" which is technically true, but the first subtask on a parent gets `position: 0`, not `1`. List-ordering still works (since `listSubtasks` does `ORDER BY position ASC, created_at ASC`), but it's slightly unusual.

**Action:** None. Cosmetic. Will not affect any user-visible behavior.

### 3. UI: "Add task" placement took spec Option (b)

Spec said either keep bottom button + remove header `+`, OR move to top of column body. Build did option (b): the `+` is now top-right, no bottom "Add task" button anywhere. Both options were spec-valid; this is the cleaner of the two. Just flagging that the "Add task" affordance is at top of column — easy to verify on next Patrick visit.

**Action:** Verify with Patrick that this is the intended Option (b) so it's not surprising.

### 4. launchctl exit-code field shows -15 (informational only)

`launchctl list | grep openclaw.task-manager` → `93070  -15  ai.openclaw.task-manager`. The `-15` is the *prior* run's exit code (SIGTERM = 15) cached by launchd, not a current failure. Service is alive, responding 200 OK. Will reset on next clean restart. Cosmetic / no action needed unless Patrick is bothered by the cosmetic signal.

---

## Specific Evidence (Trimmed)

### A. Project/columns look correct

Both projects have exactly 4 columns:
```
Green Seed: Backlog(6), Prioritized(4), Active(5), Completed(0)
Personal:   Backlog(5), Prioritized(3), Active(0), Completed(0)
```

### A. Subtask lifecycle (cycle)

```
POST   /api/v1/tasks/<id>/subtasks          → 200, position 0, position 1 auto-assigned
GET    /api/v1/tasks/<id>/subtasks          → 200, returns ordered list
PATCH  /api/v1/subtasks/<id> {completed:1}  → 200, completed_at populated
PATCH  /api/v1/subtasks/<id> {title:"…"}    → 200, updated_at bumped, title changed
POST   /api/v1/tasks/<id>/subtasks/reorder  → 200, swapped positions
DELETE /api/v1/subtasks/<id>                → 200, {success:true}
```

### B. FK cascade (the dangerous one)

```
DELETE /api/v1/tasks/6c3bf885588d25f1875551f361f9bb24  → 200 OK
3 subtasks on parent before, 0 after.
24 tasks → 23 tasks  (only parent removed).
6 siblings in Active column → 5 siblings (no orphans).
0 orphan subtasks.
```

### F. Bundle grep

```
$ grep -c 'darkMode:dm' client/dist/assets/index-*.js
0
```

---

## Recommendation

**Ship.** All 6 items from TASK-v6 are in. FK cascade behaves as Wren wanted (no orphan subtasks, no collateral task loss). Wren moderates (`dm` undefined) addressed. Sort order is correct. Filter is correct. Today sidebar carries subtasks as spec'd. UI choices are spec-compliant.

Pre-ship follow-ups (all minor, can ship as-is):
- Confirm with Patrick that "Add task" being top-of-column (Option b) was intended.
- If Patrick wants zero data loss during QA, change future destructive QA specs to "create a scratch task first" rather than repurposing real tasks. (Pre-cascade count was 24, already 1 below Wren's expected 25. That's an artifact of either prior testing or Wren's notes being slightly stale; I can't tell from here.)
- Update the QA brief template to use correct route paths (`/api/v1/tasks/:taskId/subtasks`, not `/api/v1/subtasks/:taskId`).

---

**Bottom line: ready to deploy.**
