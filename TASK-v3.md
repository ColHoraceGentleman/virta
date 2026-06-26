# TASK-v3.md — Virta Task Manager: Per-Project Categories & Dark Mode

**Owner:** Rusty
**Builder:** Cinder
**Project root:** `/Users/colonelhoracegentleman/clawd/projects/task-manager/`
**Last updated:** 2026-05-29

---

## Context

The app is a running production launchd service on port 3001. Stack:
- React 18 + Vite (client/), Tailwind CSS v3
- Express + better-sqlite3 (server/)
- Production build served from `client/dist/`

**Do NOT change the stack, port, or launchd config.**
After all changes, run `npm run build` so the production dist is updated.
Then restart: `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager 2>&1`

---

## Changes Required

### 1. DB Schema — server/db.js

**Add `dark_mode` column to `projects` table:**
```sql
ALTER TABLE projects ADD COLUMN dark_mode INTEGER DEFAULT 1
```
Use the existing `try/catch` pattern (not IF NOT EXISTS — SQLite doesn't support it for ALTER).

**Add `project_id` column to `categories` table:**
```sql
ALTER TABLE categories ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE
```
Same pattern. After adding the column, migrate existing categories to the Personal project:
```sql
UPDATE categories SET project_id = 'ca272e5f2aa23e801b54fa09e48852a7' WHERE project_id IS NULL
```
That is the real Personal project ID from the live DB.

Also update the default project seed to set `dark_mode = 1` on insert.

---

### 2. Server — taskService.js

**`getAllProjects()`** — already returns all projects. No change needed.

**`createProject()`** — accept `darkMode` param (boolean/int), store in DB. Default 1 (dark).

**`updateProject()`** — accept `darkMode` param, update in DB.

**`getCategories(projectId)`** — currently returns ALL categories. Change to filter by `project_id`. If `projectId` is null/undefined, return all (fallback only).

**`createCategory()`** — accept `projectId` param, store in DB.

---

### 3. Server — routes/categories.js

**GET `/api/v1/categories`** — accept optional `?projectId=xxx` query param, pass to `getCategories()`.

**POST `/api/v1/categories`** — accept `projectId` in body, pass to `createCategory()`.

---

### 4. Client — hooks/useTasks.js

**`loadCategories()`** — pass `currentProject.id` as query param when fetching categories.
```js
const data = await api.getCategories(currentProject.id);
```

Make sure categories reload whenever `currentProject` changes.

**`createCategory()`** — pass `projectId: currentProject.id` in the request body.

**Dark mode state** — remove the `useState` for `darkMode` from `App.jsx` and move it here:
- On project load, read `project.dark_mode` and expose it as `darkMode` from the hook
- Expose `setDarkMode(bool)` which calls `api.updateProject(currentProject.id, { darkMode: bool })` and updates local state
- When `currentProject` changes, update `darkMode` to match the new project's `dark_mode`

---

### 5. Client — lib/api.js

Add `projectId` query param support to `getCategories`:
```js
getCategories: (projectId) => request('GET', `/categories${projectId ? `?projectId=${projectId}` : ''}`),
```

---

### 6. Client — App.jsx

- Remove the `darkMode` useState and `useEffect` for dark mode persistence (now lives in useTasks)
- Get `darkMode` and `setDarkMode` from `useTasks()` hook instead
- The toolbar toggle calls `setDarkMode(!darkMode)` — this now persists to the project in the DB

---

### 7. Client — components/SettingsModal.jsx

**Projects section — UI overhaul:**
- Show list of existing projects
- Each row: ★ default button, project name, edit (✏️), delete (🗑️)
- Each row also shows a ☀️/🌙 toggle indicating that project's dark_mode preference, clickable to toggle it
- "+ New Project" button at the bottom — clicking it expands an inline form:
  - Name input
  - Light/dark toggle (default: dark)
  - "Create" and "Cancel" buttons
- On create: call `onCreateProject({ name, darkMode })`

**Categories section — UI overhaul:**
- Same pattern: show list, each with edit/delete
- "+ Add Category" button at the bottom expands inline form (name + color swatch picker)
- Collapse the form after successful create

**Both sections should use the same expand/collapse pattern.**

---

### 8. Client — App.jsx (project handlers)

Add `handleCreateProject({ name, darkMode })`:
```js
async function handleCreateProject({ name, darkMode }) {
  await api.createProject({ name, darkMode: darkMode ? 1 : 0 });
  await reload();
}
```

Pass to SettingsModal as `onCreateProject`.

---

### 9. Empty state — no projects

In App.jsx, if `projects.length === 0` after loading, render an empty state instead of the board:
```jsx
<div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100">
  <h1 className="text-2xl font-bold mb-2">Welcome to Virta</h1>
  <p className="text-slate-400 mb-6">You don't have any projects yet.</p>
  <button onClick={() => setShowSettingsModal(true)}
    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium">
    Create your first project
  </button>
</div>
```

---

### 10. Default project seed

In db.js, when seeding the default project, set `dark_mode = 1`.
Default columns remain: `['Backlog', 'Prioritized', 'Active', 'On Hold', 'Completed']`

---

## Key Rules

- Use `ALTER TABLE … ADD COLUMN` with try/catch for all schema changes — never drop or recreate tables
- Existing categories must be migrated to Personal project ID `ca272e5f2aa23e801b54fa09e48852a7`
- Run `npm run build` at the end
- Restart the service after build
- Write your report to `CINDER_REPORT_3.md`

## Definition of Done

- Projects have a `dark_mode` preference; switching projects changes the app mode
- Toolbar toggle updates the current project's dark_mode in DB (persists)
- Categories are scoped to the current project
- Settings: "+ New Project" expands inline form with name + light/dark toggle
- Settings: Categories section uses same expand/collapse pattern for new category form
- Empty state shown when no projects exist
- `npm run build` succeeds with no errors
- Service restarts and responds on port 3001
