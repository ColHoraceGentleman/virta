# TASK.md — Task Manager App (v1)

**Project:** Patrick's Personal Task Manager
**Owner:** Rusty (orchestrator)
**Builder:** Cinder
**Reviewer:** Wren
**QA:** Echo
**Last updated:** 2026-05-22

---

## Objective

Build a personal Kanban-style task management web app from scratch. It runs locally on a Mac mini, is accessible via browser (LAN/Tailscale), and is controlled both via the UI and via a REST API (so Rusty can create/update tasks from chat).

---

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS v3 |
| Drag & Drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Backend | Express |
| Database | better-sqlite3 |
| Real-time | Server-Sent Events (SSE) |
| Calendar | `googleapis` (Google Calendar API) — scaffold only in v1, full auth in v2 |
| Runtime | Node.js, runs on Mac mini |

---

## Project Structure

```
~/clawd/projects/task-manager/
├── package.json
├── server/
│   ├── index.js            ← Express entry point (port 3001)
│   ├── db.js               ← better-sqlite3 setup + schema migration
│   ├── routes/
│   │   ├── projects.js
│   │   ├── columns.js
│   │   ├── tasks.js
│   │   ├── calendar.js     ← stub for v1
│   │   └── events.js       ← SSE push endpoint
│   └── services/
│       ├── taskService.js
│       └── sseService.js
├── client/
│   ├── index.html
│   ├── vite.config.js      ← proxy /api → localhost:3001
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── KanbanBoard.jsx
│       │   ├── KanbanColumn.jsx
│       │   ├── TaskCard.jsx
│       │   ├── TaskList.jsx
│       │   ├── TaskModal.jsx
│       │   ├── CommandPalette.jsx
│       │   └── Toolbar.jsx
│       ├── hooks/
│       │   ├── useTasks.js
│       │   └── useSSE.js
│       └── lib/
│           └── api.js      ← fetch wrapper for REST API
└── data/
    └── tasks.db            ← SQLite database (gitignored)
```

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT DEFAULT '#6366f1',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS columns (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  column_id   TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    TEXT,
  priority    TEXT CHECK(priority IN ('low','medium','high','urgent')) DEFAULT 'medium',
  position    REAL NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_notes (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  calendar_id     TEXT NOT NULL,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS google_credentials (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  access_token  TEXT,
  refresh_token TEXT,
  token_expiry  TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_columns_project_id ON columns(project_id);
```

### Seed Data

On first run, if no projects exist, seed one default project called "Personal" with columns: Inbox, To Do, In Progress, Blocked, Done.

---

## REST API

All endpoints prefixed `/api/v1/`. JSON request/response. Errors: `{ error: string, code: string }`.

```
# Projects
GET    /api/v1/projects
POST   /api/v1/projects              body: { name, description?, color? }
GET    /api/v1/projects/:id          includes columns + tasks
PATCH  /api/v1/projects/:id
DELETE /api/v1/projects/:id

# Columns
POST   /api/v1/projects/:projectId/columns   body: { name, position? }
PATCH  /api/v1/columns/:id                   body: { name?, position? }
DELETE /api/v1/columns/:id

# Tasks
GET    /api/v1/tasks                 query: ?projectId=, ?columnId=, ?priority=, ?dueBefore=, ?search=
POST   /api/v1/tasks                 body: { columnId, title, description?, dueDate?, priority? }
GET    /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id
DELETE /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id/move        body: { columnId, position }

# Notes
GET    /api/v1/tasks/:taskId/notes
POST   /api/v1/tasks/:taskId/notes   body: { content }
DELETE /api/v1/notes/:id

# Calendar (stub in v1 — return 501 Not Implemented)
GET    /api/v1/auth/google
GET    /api/v1/auth/google/callback
GET    /api/v1/auth/status
GET    /api/v1/calendars
POST   /api/v1/calendars/:calendarId/events

# SSE
GET    /api/v1/events                SSE stream
```

SSE events shape:
```json
{ "type": "task_created"|"task_updated"|"task_deleted"|"task_moved", "data": { ...task } }
```

---

## Frontend — Key UI Requirements

### Kanban Board
- Horizontal scrolling columns
- Cards show: title, priority badge (color-coded), due date (red if overdue), project label
- Drag cards between columns and within columns using @dnd-kit
- Card lifts with subtle shadow + 3° tilt on drag
- Drop zone shows colored insertion line between cards
- "+ Add Task" button at bottom of each column
- Column header shows task count

### Task List View
- Flat table: checkbox | title | project | status | priority | due date
- Sortable columns (click header)
- Inline status change (click status pill → dropdown)
- Row click opens Task Modal

### View Toggle
- Toolbar: "Board" | "List" segmented control (top-right)
- Persisted in localStorage

### Task Modal (side panel, slides in from right)
- Title (editable inline)
- Description (textarea)
- Due date picker
- Priority selector
- Column/status selector
- Notes section (add note → appends to list with timestamp)
- Created/updated timestamps

### Command Palette
- ⌘K / Ctrl+K opens floating modal
- Fuzzy search across task titles
- Actions: New Task, New Project, Change View
- Arrow keys + Enter + Escape

### Toolbar
- App title "Rusty Tasks" (or similar)
- Project selector dropdown (all projects)
- Board / List toggle
- "+ New Task" button
- ⌘K hint

### Styling
- Clean, dark-by-default UI (Tailwind dark mode via `class` strategy)
- Color palette: dark grays (#0f172a, #1e293b, #334155), accent indigo (#6366f1)
- Priority colors: low=slate, medium=blue, high=amber, urgent=red
- Rounded cards, subtle borders, smooth transitions

---

## Startup

### package.json scripts
```json
{
  "scripts": {
    "dev": "concurrently \"npm run server\" \"npm run client\"",
    "server": "node server/index.js",
    "client": "vite client/",
    "build": "vite build client/",
    "start": "NODE_ENV=production node server/index.js"
  }
}
```

In production mode, Express serves `client/dist/` as static files from the same port (3001).

### First-run
- Create `data/` directory if missing
- Run schema migration (CREATE TABLE IF NOT EXISTS)
- Seed default project + columns if empty

---

## What Cinder Should NOT do in v1
- No Google Calendar OAuth implementation (stub the routes, return 501)
- No user authentication on the app itself
- No mobile-specific layout (LAN browser access is fine)
- No rich text editor for descriptions (plain textarea is fine)

---

## Definition of Done

- [ ] `npm run dev` starts both servers cleanly
- [ ] Kanban board renders with default project + 5 columns
- [ ] Can create, edit, delete tasks via UI
- [ ] Can drag tasks between columns
- [ ] Task list view works and toggles correctly
- [ ] Task modal opens with full detail + notes
- [ ] Command palette opens with ⌘K, searches tasks
- [ ] All REST API endpoints return correct responses
- [ ] SSE events fire on task create/update/delete/move
- [ ] `npm run build && npm start` serves the built app on port 3001
- [ ] No console errors in browser on load

---

## Handoff Notes for Wren (Code Review)

Focus on:
1. SQL injection safety (use parameterized queries throughout — better-sqlite3 supports this)
2. SSE cleanup (connections must be removed from the client list on close/error)
3. Error handling (every route should have try/catch; no unhandled promise rejections)
4. Position field logic (fractional reordering must work correctly)
5. CORS config (should allow localhost:5173 in dev, same-origin in prod)
