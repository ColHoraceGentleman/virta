# Cinder Fixes #3 — Virta Task Manager

**Date:** 2026-05-29  
**Build:** ✅ Clean (46 modules, no errors/warnings)

## Fixed Issues

### CRITICAL-1 — Empty-state "Create first project" button now works
**File:** `client/src/App.jsx`

Added `<SettingsModal>` directly inside the empty-state return block. New users who click "Create your first project" will now see the modal rendered on top of the welcome screen, allowing them to name a project, pick a theme, and create it in one flow. Previously the button set state that was never observable because the modal lived downstream of an early `return`.

### CRITICAL-2 — `darkMode` now passed through POST /api/projects
**File:** `server/routes/projects.js`

Added `darkMode` to the destructure in the POST route handler: `const { name, description, color, darkMode } = req.body`. The value is now forwarded to `taskService.createProject()`, which already knew how to handle it — it just never received it. Existing PATCH routes were already working.

### MODERATE-1 — Global UNIQUE on `categories.name` replaced with composite `(name, project_id)`
**File:** `server/db.js`

Dropped the per-column auto-indexes (`sqlite_autoindex_categories_1/2`) left over from the legacy `UNIQUE` constraint on `name`. Replaced by a composite `UNIQUE INDEX idx_categories_name_project ON categories(name, project_id)` while removing `UNIQUE` from the column itself. Added a matching `CREATE UNIQUE INDEX IF NOT EXISTS` for fresh installs. All 7 existing categories (Personal, Work, United Angels, REDX, Data Labs, WAVV, Green Seed — all on Personal project `ca272e5f...`) retained with no data loss. Duplicate names now only forbidden within the same project.

### MINOR-1 — Categories now reload on project switch
**File:** `client/src/hooks/useTasks.js`

Added a `useEffect` that calls `loadCategories()` whenever `currentProject?.id` changes. Previously categories were only loaded once on mount (when `currentProject` was `null`, returning all categories globally). Now switching projects triggers a scoped reload so FilterBar and TaskModal show only that project's categories.

### MINOR-2 — `setDarkMode` API call now catches errors
**File:** `client/src/hooks/useTasks.js`

Wrapped the `api.updateProject(...)` call inside `.catch(console.error)` so network failures are logged rather than silently swallowed. The UI state is still updated optimistically.

## Build
- `npm run build` → ✅ 46 modules transformed, no errors, no warnings
- `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager` → ✅ Service restarted
