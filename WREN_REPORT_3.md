# Wren Review Report #3 — Virta Task Manager: Per-Project Categories & Dark Mode

**Reviewer:** Wren 🪶  
**Date:** 2026-05-29  
**Build status:** ✅ Clean (`✓ 46 modules transformed`)  
**Verdict:** ❌ FAIL — 2 CRITICAL bugs, 1 MODERATE, 2 MINOR

---

## CRITICAL Issues

### [CRITICAL-1] Empty-state "Create your first project" button is a dead end

**File:** `client/src/App.jsx` — lines 173–185  
**Severity:** CRITICAL — Core feature completely broken for new users

The `projects.length === 0` early return renders an empty-state screen with a "Create your first project" button. That button calls `setShowSettingsModal(true)`. However, the `<SettingsModal>` component is only rendered in the **main return block at line 308** — which is never reached because the early return exited first.

Result: clicking the button does nothing visible. The user cannot create a project. Virta is unusable on a fresh install.

**Fix:** Either move the `<SettingsModal>` into the empty-state return, or restructure the empty-state so it's a conditional section inside the main return rather than an early exit.

```jsx
// In the empty-state return, add the modal:
return (
  <div ...>
    <h1>Welcome to Virta</h1>
    <button onClick={() => setShowSettingsModal(true)}>Create your first project</button>
    {showSettingsModal && (
      <SettingsModal
        categories={[]}
        projects={[]}
        onClose={() => setShowSettingsModal(false)}
        onCreateProject={handleCreateProject}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
        onCreateCategory={createCategory}
        onUpdateCategory={updateCategory}
        onDeleteCategory={deleteCategory}
        darkMode={darkMode}
      />
    )}
  </div>
);
```

---

### [CRITICAL-2] `darkMode` NOT passed through `POST /api/projects` route

**Files:** `server/routes/projects.js` line 18, `server/services/taskService.js` `createProject()`  
**Severity:** CRITICAL — New projects always get default dark mode regardless of user's selection

The POST route at `/api/projects` destructures only `{ name, description, color }` from `req.body`:

```js
const { name, description, color } = req.body;  // darkMode silently dropped
const project = taskService.createProject({ name, description, color });
```

`taskService.createProject()` does correctly handle `darkMode` — but it never receives it from the route. The `handleCreateProject` in `App.jsx` sends `{ name, darkMode: darkMode ? 1 : 0 }` correctly from the client. The value is just silently discarded in the route handler.

This means every newly created project will always use the default `dark_mode = 1` (dark), regardless of the user's light/dark selection in SettingsModal.

**Fix:**

```js
// server/routes/projects.js POST /
const { name, description, color, darkMode } = req.body;
if (!name) return res.status(400).json({ error: 'Name is required', code: 'VALIDATION_ERROR' });
const project = taskService.createProject({ name, description, color, darkMode });
```

---

## MODERATE Issues

### [MODERATE-1] `categories.name UNIQUE` constraint is global — breaks per-project scoping

**File:** `server/db.js` line 87  
**Severity:** MODERATE — Prevents valid use cases, confusing UX

The `categories` table has a `UNIQUE` constraint on `name` globally:

```sql
name TEXT NOT NULL UNIQUE,
```

With per-project categories now a first-class feature, two different projects cannot have a category with the same name (e.g., "Urgent" in Project A and "Urgent" in Project B). The UNIQUE constraint should be `(name, project_id)`, not just `name`.

This also means the migration may have silently moved existing rows to the Personal project while creating a uniqueness trap for future projects.

**Fix:** Requires a schema migration to drop the old unique index and add a composite unique constraint:

```sql
-- Migration
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_project 
  ON categories(name, project_id);
-- DROP old unique constraint if possible (SQLite: recreate table)
```

Due to SQLite limitations, this requires recreating the table. The `safeExec` pattern is already established in `db.js` for this kind of migration.

---

## MINOR Issues

### [MINOR-1] Categories not reloaded when project switches

**File:** `client/src/hooks/useTasks.js` lines 18–20, 108–116  
**Severity:** MINOR — Stale category list after project switch

`loadCategories()` is called once on mount (in the `[]` useEffect at line 18–21). At mount time, `currentProject` is `null`, so `getCategories(null)` returns **all categories** (line 206 in `taskService.js`). There is no `useEffect` that calls `loadCategories` when `currentProject?.id` changes.

After switching projects, the category list shown in the FilterBar and TaskModal will be the full global list rather than the categories scoped to the new project.

**Fix:** Add a useEffect:

```js
useEffect(() => {
  if (currentProject?.id) {
    loadCategories();
  }
}, [currentProject?.id]);
```

---

### [MINOR-2] `setDarkMode` toggle fires unawaited API call (fire-and-forget)

**File:** `client/src/hooks/useTasks.js` line 41  
**Severity:** MINOR — Errors silently swallowed, no optimistic rollback

```js
function setDarkMode(val) {
  setDarkModeState(val);
  document.documentElement.classList.toggle('dark', val);
  if (currentProject) {
    api.updateProject(currentProject.id, { darkMode: val ? 1 : 0 });  // unawaited
  }
}
```

The `api.updateProject` call is fire-and-forget — no `await`, no `.catch()`. If the API request fails (network error, server restart), the UI shows dark/light mode but the preference isn't saved. On next project switch, the stale DB value will override the user's last-seen preference.

**Fix:** Either add a `.catch(console.error)` to at minimum log failures, or make `setDarkMode` async and handle errors.

---

## What's Good

- **DB migrations are correct:** `dark_mode` and `project_id` both use `PRAGMA table_info` + `ALTER TABLE` with try/catch. No DROP/recreate. Solid.
- **Personal project migration:** Hardcoded ID `ca272e5f...` matches the actual seeded Personal project in the live DB. Migration is correct for this install, wrapped in try/catch.
- **All queries use parameterized statements:** No SQL injection risks in any of the new query params (`projectId`, `darkMode`).
- **`updateProject` route passes `req.body` directly** to the service — darkMode updates for existing projects work correctly via PATCH.
- **SettingsModal forms:** Collapse after submit, no duplicate state bugs, cancel clears input.
- **Empty state structure:** Renders without crashing if `categories`/`columns` arrays are empty.
- **`defaultColumnId` prop:** Correctly destructured in TaskCreateModal — no repeat of the v2 bug.
- **`darkMode` sync on project switch:** The `useEffect` on `[currentProject?.id, currentProject?.dark_mode]` is correct. No race conditions between the sync effect and manual toggle.
- **Build:** Clean, 46 modules, no warnings.

---

## Summary Table

| ID | Severity | File | Issue |
|----|----------|------|-------|
| CRITICAL-1 | CRITICAL | `App.jsx` | Empty-state modal never renders — new users can't create a project |
| CRITICAL-2 | CRITICAL | `routes/projects.js` | `darkMode` silently dropped in POST route — new project theme always defaults to dark |
| MODERATE-1 | MODERATE | `db.js` | `categories.name` UNIQUE is global — breaks multi-project category naming |
| MINOR-1 | MINOR | `useTasks.js` | Categories not reloaded on project switch — stale list shown |
| MINOR-2 | MINOR | `useTasks.js` | `setDarkMode` fires API update without error handling |
