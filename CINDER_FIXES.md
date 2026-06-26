# Cinder — Bug Fixes Report

**Date:** 2026-05-22
**Task:** Fix bugs identified by Echo (QA)

---

## Fix 1 — `datetime("now")` as bound parameter (Critical)

**Files:** `server/services/taskService.js`

**Problem:** `datetime("now")` was being passed as a bound parameter value in prepared statements. SQLite treats `?` placeholders as string literals — passing `datetime("now")` as a parameter produces the literal string `"now"` instead of invoking the function. This caused a SQL error (`no such column: "now"`) that broke `moveTask`, `updateTask`, and cascading operations.

**Root cause:** The code used double-quoted strings (`datetime("now")`) inside single-quoted JS strings. When `sed` tried to fix this, it produced malformed SQL (`datetime(''now'')`) that Node.js couldn't parse as valid JS.

**Fix:** Rewrote `taskService.js` using double-quoted JS strings with single-quoted SQL literals:
```sql
-- Before (BROKEN):
db.prepare('UPDATE tasks SET updated_at = datetime("now") WHERE id = ?').run(id)

-- After (CORRECT):
db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(id)
```

Fixed all 4 occurrences in `taskService.js` (lines 23, 127, 132, 158).

---

## Fix 2 — `/api/v1/auth/status` returned 200 instead of 501

**File:** `server/routes/calendar.js`

**Problem:** The route returned `res.json({ data: { connected: false, ... } })` with status 200.

**Fix:** Changed to:
```js
res.status(501).json({ error: 'Google Calendar not configured', code: 'NOT_IMPLEMENTED' });
```

---

## Smoke Test Results

All 4 critical operations now work:
- ✅ Create task
- ✅ Move task to different column
- ✅ Update task title
- ✅ Delete task
- ✅ `/api/v1/auth/status` returns 501

---

## Note on `/api/v1/tasks/:id/move` route

The route is `router.patch('/:id/move')` (PATCH, not POST). The Echo report referenced `POST` in the error description — this appears to be a documentation mismatch in the QA report rather than a code bug.