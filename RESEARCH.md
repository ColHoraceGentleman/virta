# Task Manager App — Technical Brief

**Date:** 2026-05-22
**Role:** Research + Recommendation
**Target:** Builder (Rusty / Patrick)

---

## 1. Recommended Stack

### Primary Recommendation: React (Vite) + Express + better-sqlite3

**Rationale:** This is a local single-server app. The cleanest architecture is a monorepo with a React SPA frontend and an Express API backend running on the same Node.js process (different ports is fine — e.g., `localhost:3000` for Vite dev server, `localhost:3001` for Express API).

**Why not pure HTML/JS?** You'd outgrow it within a week. Modal dialogs, drag-and-drop, view switching, real-time updates — these need coordination that vanilla JS makes painful.

**Why not HTMX?** HTMX is excellent for content-heavy apps where most interaction is page-level. A kanban board with drag-and-drop, inline editing, and view switching is a stateful interactive UI — better served by a proper frontend framework. HTMX + Express is worth revisiting only if you want to avoid a build step entirely and can tolerate the UI complexity tradeoffs.

**Why React specifically?** Broadest ecosystem for drag-and-drop (dnd-kit, react-beautiful-dnd), kanban board components, and Tailwind CSS integration. Vue/Svelte are also fine — personal preference.

### Stack Summary

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | React 18 + Vite | Fast HMR dev, modern ESM |
| Styling | Tailwind CSS | Utility-first; matches modern tool expectations |
| Drag & Drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Best maintained React DnD lib; avoids abandoned react-beautiful-dnd |
| Backend | Express (Fastify also fine) | `/api` routes, SSE for real-time |
| Database | better-sqlite3 | Sync API, fastest SQLite driver for Node |
| Auth | Google OAuth2 `googleapis` | Refresh token stored in SQLite |
| Real-time | Server-Sent Events (SSE) | Simpler than WebSockets; AI agent polls via REST anyway |
| Hosting | Mac mini, same Node process | `pm2` or built-in `node --daemon`; accessed over LAN/Tailscale |

### Dev/Prod Setup

- **Dev:** Vite dev server (port 5173) proxies `/api` and `/sse` to Express (port 3001)
- **Prod:** Single `npm run build` → Vite outputs static files; Express serves `dist/` and handles API from same port (or use a lightweight wrapper like `concurrently` to run both)

---

## 2. UX Patterns to Implement

### Kanban Board (Trello-inspired)

**Column structure:** Each project has columns (e.g., To Do / In Progress / Done). Columns scroll horizontally; cards stack vertically within columns. Never nest columns within columns — keep it flat.

**Card anatomy (minimum):**
- Title (1 line truncated, full on hover/modal)
- Project label (colored dot or pill)
- Due date (red if overdue, yellow if due today)
- Assignee avatar (if multi-user; optional for solo)
- Quick-add button at bottom of each column

**Drag-and-drop interactions:**
- Grab handle on card left edge (not whole card — prevents accidental drags on mobile)
- Card tilts 3–5° on lift (Trello's classic affordance)
- Drop zone highlights with a colored line between cards
- Cross-column drops animate the target column's scroll position
- Reorder within column works the same way

**Keyboard accessibility:** Arrow keys to navigate cards, Enter to open, Escape to close. Focus ring visible. This is non-negotiable.

### Flat Task List (Linear-inspired)

Linear's list view is the gold standard here:
- Rows are tasks. Columns are metadata (title, status, due date, priority, project).
- Sortable by any column (click header).
- Inline quick-edit on double-click (title, due date, status).
- Row-level selection (checkbox) for bulk operations.
- Collapse groups by project or status.

**Key difference from kanban:** The flat list is for power users who know what they're looking for. Fast, scannable, keyboard-navigable.

### View Switching

- Toggle between Kanban and List view in the top toolbar — same data, different render.
- Persist the last-used view in `localStorage`.
- Tabs or segmented control, not a buried menu item.

### Command Palette (Linear-style ⌘K)

Linear's command palette is the single most impactful UX pattern for a task app. Build it:
- `⌘K` / `Ctrl+K` opens a floating modal
- Fuzzy search across all tasks and projects
- Quick actions: create task, jump to project, change status
- Arrow keys + Enter to select; Escape to close
- AI agent will also call the API, but a command palette is essential for direct human use

### Other Non-Negotiable Patterns

- **Quick-add:** Floating `+` button or `N` hotkey — opens inline task creation without a full modal flow
- **Due date picker:** Click-to-open calendar; smart input ("tomorrow", "next friday" parsed)
- **Task modal (detail view):** Click card → side panel or full modal with title, notes (rich text), due date, status, project, Google Calendar event link
- **Real-time sync:** Cards update without page refresh when the AI agent modifies them (SSE push to frontend)
- **Dark mode:** Tailwind `dark:` variants; respect `prefers-color-scheme`

---

## 3. REST API Shape for AI Control

### Design Principles
- Resource nouns only; HTTP verbs for CRUD
- JSON request/response bodies
- Errors with consistent `{ error: string, code: string }` shape
- All endpoints prefixed `/api/v1/`

### Endpoints

```
# Projects
GET    /api/v1/projects              → list all projects
POST   /api/v1/projects              → create project
GET    /api/v1/projects/:id          → get project with columns
PATCH  /api/v1/projects/:id          → update project (name, etc.)
DELETE /api/v1/projects/:id          → delete project

# Columns
POST   /api/v1/projects/:projectId/columns     → create column
PATCH  /api/v1/columns/:id                      → update column (name, position)
DELETE /api/v1/columns/:id                      → delete column

# Tasks
GET    /api/v1/tasks                 → list tasks (filter: ?projectId=, ?status=, ?dueBefore=)
POST   /api/v1/tasks                 → create task
GET    /api/v1/tasks/:id             → get task detail
PATCH  /api/v1/tasks/:id             → update task fields
DELETE /api/v1/tasks/:id             → delete task

# Task moves (bulk / column changes)
PATCH  /api/v1/tasks/:id/move        → move task to column + position
  Body: { columnId: string, position: number }

# Google Calendar
GET    /api/v1/calendars             → list user's calendars
GET    /api/v1/calendars/:calendarId/events → list events
POST   /api/v1/calendars/:calendarId/events → create event from task
DELETE /api/v1/calendars/:calendarId/events/:eventId → delete/unlink event
GET    /api/v1/tasks/:taskId/calendar-events  → get linked events for a task

# Auth
GET    /api/v1/auth/google           → initiate OAuth2 flow (redirects to Google)
GET    /api/v1/auth/google/callback  → OAuth2 callback handler
GET    /api/v1/auth/status           → check if Google Calendar is connected

# SSE (real-time push)
GET    /api/v1/events                → SSE stream: task_created | task_updated | task_deleted | task_moved
```

### Response Shape

```json
// GET /api/v1/projects
{
  "data": [
    { "id": "uuid", "name": "Home Renovation", "createdAt": "...", "updatedAt": "..." }
  ]
}

// GET /api/v1/projects/:id (with full detail)
{
  "data": {
    "id": "uuid",
    "name": "Home Renovation",
    "columns": [
      { "id": "col-1", "name": "To Do", "position": 0, "tasks": [...] },
      { "id": "col-2", "name": "Done",  "position": 1, "tasks": [...] }
    ]
  }
}

// Error
{
  "error": "Project not found",
  "code": "NOT_FOUND"
}
```

---

## 4. Data Model

### Entities

```sql
CREATE TABLE projects (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE columns (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tasks (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  column_id   TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    TEXT,           -- ISO 8601
  priority    TEXT CHECK(priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE calendar_events (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  google_event_id  TEXT NOT NULL,
  calendar_id  TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE google_credentials (
  id          INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton
  access_token  TEXT,
  refresh_token TEXT,
  token_expiry  TEXT
);
```

**Notes:**
- `position` is a float or integer for insertion-order sorting; use fractional positioning (e.g., insert between 1 and 2 → position 1.5) to avoid re-indexing on every move
- `updated_at` triggers on every `PATCH`; handle in application layer or via SQLite triggers
- No `users` table — this is a single-user app. If multi-user is added later, add `assigned_to` to tasks

### Indexes

```sql
CREATE INDEX idx_tasks_column_id ON tasks(column_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_columns_project_id ON columns(project_id);
CREATE INDEX idx_calendar_events_task_id ON calendar_events(task_id);
```

---

## 5. Google Calendar Integration

### OAuth2 Flow (Simplest for Local App)

1. **Credentials file:** Download from Google Cloud Console → `client_secret.json`
2. **Initiation:** `GET /api/v1/auth/google` → redirects to Google consent screen
3. **Callback:** Google redirects to `GET /api/v1/auth/google/callback?code=...` → exchange code for tokens
4. **Token storage:** Store `access_token`, `refresh_token`, `expiry` in `google_credentials` table
5. **Auto-refresh:** Use `googleapis` auth library's `refreshAccessToken()` — it handles expiry automatically; refresh token persists in DB across server restarts

**Critical flags on consent URL:**
```
access_type: 'offline'    ← required to get a refresh token (survives server restarts)
prompt: 'consent'         ← force consent screen (ensures refresh token is issued even if already granted)
scope: [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
]
```

### Gotchas

1. **Refresh token may not be issued on first auth** if the user has already authorized the app — `prompt: 'consent'` works around this but must be used carefully (it will always ask for consent, which is annoying on re-auth but required for the initial refresh token flow)
2. **Google may require re-verification** if the app is in testing mode and the user's account isn't a whitelisted test user → set the app to Production or add your personal Google account as a test user in the Cloud Console
3. **Single refresh token per user per app** — if the user re-auths, the old refresh token is invalidated; always store the latest one
4. **Calendar ID matters** — use `primary` for the default calendar, or let the user pick from the `/calendars` list
5. **Event creation:** Map task fields to Google Calendar event fields:
   - `title` → `summary`
   - `description` → `description` (include task URL)
   - `due_date` → `start.dateTime` / `end.dateTime` (or `start.date` / `end.date` for all-day events)
   - Set `reminders` to a default (e.g., 15 minutes before)

### Recommended Helper Flow

When a task with a due date is created:
1. AI agent calls `POST /api/v1/tasks` with `dueDate`
2. Frontend (or a backend hook) shows a "Add to Calendar?" prompt
3. If yes, call `POST /api/v1/calendars/:calendarId/events` with the task data
4. Store the `google_event_id` in `calendar_events` table for later unlinking/deletion

---

## 6. Gotchas, Risks, and Flags

### Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| SQLite write locks under concurrent reads | Low | Single-user app; writes only from AI agent + human. Acceptable. |
| `better-sqlite3` is **native** (requires node-gyp) | Medium | Build once on Mac mini. If you switch architectures, rebuild. |
| OAuth2 refresh token loss | High | Store immediately on first auth; never overwrite without persisting |
| Google API quota | Low | Personal use; well within free tier limits |
| CORS if frontend/backend on different ports in prod | Medium | Vite proxy in dev; in prod either serve both from Express or configure CORS properly |
| AI agent calling API concurrently with user edits | Low | Use SQLite transactions; SSE ensures eventual consistency on frontend |

### Scope Risks

- **Drag-and-drop is underestimated.** Getting Trello-quality smoothness (tilt effect, smooth drop, cross-column scrolling) takes real effort. Use `@dnd-kit`, don't roll your own.
- **Command palette is high-effort.** Fuzzy search with ranking, action dispatch, keyboard navigation — plan 1–2 days for this alone.
- **Real-time SSE requires cleanup.** Every SSE client holds a connection. Implement heartbeat pings and clean up on `close` / `error` events.

### Security Notes

- No user auth on the app itself (single-user local). This is fine.
- The API is accessible over LAN/Tailscale — if you expose the Mac mini externally, add a simple Bearer token check or IP allowlist in Express middleware
- Google credentials are stored in SQLite — this is acceptable for local use; don't ship the DB file anywhere

### Architecture Recommendation Summary

```
┌─────────────────────────────────────────────────┐
│  Browser (React SPA)                            │
│  ┌──────────────┐   ┌──────────────────────┐   │
│  │  Kanban View │   │  List View           │   │
│  │  + Cmd Palette + SSE listener           │   │
│  └──────┬───────┘   └──────────┬───────────┘   │
│         │   REST + SSE          │               │
└─────────┼───────────────────────┼───────────────┘
          │                       │
    ┌─────▼───────────────────────▼─────┐
    │  Express API (port 3001)           │
    │  ┌─────────────┐  ┌─────────────┐  │
    │  │ REST API    │  │ SSE pusher  │  │
    │  └──────┬──────┘  └──────┬──────┘  │
    │         │                │          │
    │  ┌──────▼────────────────▼──────┐   │
    │  │  Service Layer               │   │
    │  │  (Tasks, Calendar, Auth)     │   │
    │  └──────┬──────────────────────┘   │
    │         │                          │
    │  ┌──────▼──────┐                   │
    │  │better-sqlite3│                  │
    │  │  tasks.db    │                  │
    │  └─────────────┘                   │
    └────────────────────────────────────┘
```

---

*End of brief. Questions → flag to Patrick.*