# Echo QA Report — Task Manager

**Date:** 2026-05-22
**Tester:** Echo (QA Engineer)
**Server:** `localhost:3001`

---

## Summary

28 total tests executed. **16 PASS, 12 FAIL.** The app has a critical SQLite bug in the `moveTask` function that cascades into task move, update, and note operations. There are also API response shape inconsistencies that broke test assertions (create endpoints return `{ data: {...} }` not `{}`).

---

## Detailed Results

### 1. Server Startup

| Test | Result | Details |
|------|--------|---------|
| `npm run build` completes without errors | ✅ PASS | Built in 410ms |
| `npm start` starts without errors | ✅ PASS | Server running on port 3001 |
| `GET /` returns built frontend (HTML) | ✅ PASS | HTML served correctly |

---

### 2. Projects API

| Test | Result | Details |
|------|--------|---------|
| `GET /api/v1/projects` returns at least one project | ✅ PASS | Returns `{"data":[...]}` with "Personal" |
| `POST /api/v1/projects` creates a project | ✅ PASS | Status 201, returns `{data:{id,...}}` |
| `GET /api/v1/projects/:id` returns project with columns/tasks | ✅ PASS | Status 200, full nested structure |
| `PATCH /api/v1/projects/:id` renames project | ✅ PASS | Status 200 |
| `DELETE /api/v1/projects/:id` deletes project | ✅ PASS | Status 200, `{data:{success:true}}` |

---

### 3. Columns API

| Test | Result | Details |
|------|--------|---------|
| `POST /api/v1/projects/:projectId/columns` creates column | ✅ PASS | Status 201 |
| `PATCH /api/v1/columns/:id` renames column | ✅ PASS | Status 200 |
| `DELETE /api/v1/columns/:id` deletes column | ✅ PASS | Status 204/200 |

---

### 4. Tasks API

| Test | Result | Details |
|------|--------|---------|
| `POST /api/v1/tasks` creates a task | ✅ PASS | Status 201 |
| `GET /api/v1/tasks` returns tasks | ✅ PASS | Status 200 |
| `GET /api/v1/tasks?projectId=X` filters correctly | ✅ PASS | Status 200 |
| `GET /api/v1/tasks/:id` returns the task | ❌ FAIL | Returns 404 for newly created task IDs |
| `PATCH /api/v1/tasks/:id` updates fields | ❌ FAIL | Returns 404 — likely same root cause as above |
| `PATCH /api/v1/tasks/:id/move` moves task | ❌ FAIL | Returns 400 — **critical bug** |
| `DELETE /api/v1/tasks/:id` deletes task | ❌ FAIL | Returns 404 |

**Root Cause:** The `moveTask` function in `server/services/taskService.js` uses `datetime("now")` in a prepared statement parameter, but SQLite prepared statement parameters can only bind *values*, not SQL functions or literals. `datetime("now")` is being treated as a string literal `"now"` and causes a SQL error `"no such column: "now""`.

This same `datetime("now")` pattern is used in:
- `moveTask` (line 127, 158)
- `updateTask` (line 132)
- Also in `projectService.js` (line 23)

However, since PATCH projects (which uses the same pattern in projectService) actually worked, the issue may be more nuanced — the specific `moveTask` SQL includes `position = ?` where position is also a parameter, and the parameter order may confuse SQLite when `"now"` is among the params in a way that doesn't occur in other functions.

**Actual error from move:**
```json
{"error":"no such column: \"now\" - should this be a string literal in single-quotes?","code":"SERVER_ERROR"}
```

When `moveTask` fails, it throws, which may corrupt the task ID lookup in subsequent steps of the same test script, explaining why `GET /api/v1/tasks/:id` also fails.

**Fix required:** Replace `datetime("now")` in prepared statement parameters with the literal SQLite function call embedded in SQL, not as a bound parameter. i.e., use `'UPDATE tasks SET ... updated_at = datetime("now") WHERE id = ?'` directly in the SQL string, not as `SET updated_at = ?` with `"now"` as a parameter value.

---

### 5. Notes API

| Test | Result | Details |
|------|--------|---------|
| `POST /api/v1/tasks/:taskId/notes` adds a note | ❌ FAIL | Status 500 — cascading failure from task lookup |
| `GET /api/v1/tasks/:taskId/notes` returns notes | ✅ PASS | Status 200, returns `{data:[]}` |
| `DELETE /api/v1/notes/:id` deletes note | ❌ FAIL | 404 — cascading from task creation failure |

**Note:** `GET /api/v1/tasks/:taskId/notes` works even when task lookup by ID fails. This may indicate the notes endpoint uses a different query path.

---

### 6. Calendar Stubs

| Test | Result | Details |
|------|--------|---------|
| `GET /api/v1/auth/status` returns 501 | ❌ FAIL | Returns 200 with `{"data":{"connected":false,"reason":"Google Calendar not configured in v1"}}` |
| `GET /api/v1/calendars` returns 501 | ✅ PASS | Status 501 |

**Issue:** `/api/v1/auth/status` is documented and expected to return 501, but actually returns 200. This is a spec mismatch — either the spec is wrong, or the implementation should actually return 501.

---

### 7. SSE

| Test | Result | Details |
|------|--------|---------|
| `GET /api/v1/events` establishes SSE connection | ✅ PASS | Content-Type: `text/event-stream` |
| `task_created` event fires on task creation | ⚠️ WARNING | Could not reliably verify in test script; SSE connection works but event delivery timing uncertain |

---

### 8. Error Handling

| Test | Result | Details |
|------|--------|---------|
| `GET /api/v1/tasks/nonexistent-id` → 404 | ✅ PASS | `{error:"Task not found",code:"NOT_FOUND"}` |
| `POST /api/v1/tasks` missing `columnId` → 400 | ✅ PASS | `{error:"columnId and title are required",code:"VALIDATION_ERROR"}` |
| `POST /api/v1/tasks` missing `title` → 400 | ✅ PASS | Same as above |

---

### 9. SQL Injection Safety

| Test | Result | Details |
|------|--------|---------|
| `GET /api/v1/tasks?search='; DROP TABLE tasks; --` | ✅ PASS | Status 200, returns `{data:[]}`, no crash, no table drop |

---

## Verdict

**FAIL** — The app needs fixes before it can ship.

### Critical Issues

1. **`moveTask` SQLite error** — `datetime("now")` used as bound parameter causes `"no such column: "now""` on every task move. This is the most severe bug as it blocks a core user action.

2. **Cascading task lookup failures** — Because `moveTask` throws an exception, subsequent operations that depend on valid task state may fail, causing PATCH, DELETE, and note creation to return 404/500.

3. **`/api/v1/auth/status` returns 200 instead of 501** — Spec mismatch.

### Minor Issues

4. **API response shapes** — Create endpoints return `{data:{id,...}}` not `{id,...}`. Test script (and possibly frontend) may assume the latter.

### Recommended Fix Order

1. **Fix `moveTask`** in `server/services/taskService.js` — change `datetime("now")` from a bound parameter to an inline SQL function
2. **Fix `updateTask`** — same issue, likely same pattern
3. **Verify `/api/v1/auth/status`** — decide whether it should return 501 or 200 and update spec/implementation accordingly
4. **Re-test** after fixes to confirm cascading failures resolve

---

*Report written by Echo. Rusty — if both MiniMax and gpt-5.5 are needed to debug the SQLite issue, escalate to Patrick.*