# TASK-v5.md — Virta: Google Calendar Integration

**Owner:** Patrick
**Builder:** Cinder (or whoever's available)
**Project root:** `/Users/colonelhoracegentleman/clawd/projects/task-manager/`
**Created:** 2026-06-27
**Status:** Draft

---

## Context

Virta is live at https://virta.muckdart.com, running v4 on the launchd service (`ai.openclaw.task-manager`, port 3001). Stack is React 18 + Vite + Tailwind, Express + better-sqlite3. **Do NOT change the stack, port, or launchd config.**

**The big idea:** Virta stays the source of truth for tasks. Google Calendar is a *view*, not a sync partner. Tasks don't auto-create calendar events — the user explicitly opts in per task. But the calendar is *visible inside Virta* so you stop context-switching.

**Already done (carryover from earlier work):**
- `google_credentials` table (id, access_token, refresh_token, token_expiry)
- `calendar_events` table (task_id, google_event_id, calendar_id)
- `server/routes/calendar.js` with most endpoints wired:
  - `GET /api/v1/auth/google` — initiate OAuth
  - `GET /api/v1/auth/google/callback` — OAuth callback
  - `GET /api/v1/auth/status` — connection status
  - `GET /api/v1/calendars` — list user's calendars
  - `GET /api/v1/calendars/:calendarId/events` — list events in date range
  - `POST /api/v1/calendars/:calendarId/events` — create event (supports task link)
  - `DELETE /api/v1/calendars/:calendarId/events/:eventId` — delete event
  - `GET /api/v1/tasks/:taskId/calendar-events` — events linked to a task
- Calendar router mounted at `/api/v1` in `server/index.js`
- Google OAuth client + auto-refresh logic in `getAuthenticatedClient()`

**What's missing (this v5):**
1. Keychain migration for tokens (out of DB, into macOS Keychain)
2. Lazy OAuth prompt flow
3. **All frontend work** — none exists yet
4. Project-level "default to add to calendar" setting
5. Wiring the calendar sidebar into the app shell

---

## Design Decisions (Locked)

| Decision | Choice | Notes |
|---|---|---|
| Sync direction | **One-way view + manual push** | Read calendar in, never auto-push tasks out |
| Calendar location in UI | **Toggleable right sidebar** | Kanban stays primary; sidebar collapses to icon |
| Which calendars | **All Google calendars, color-coded** | Source calendar color = its own Google color, no Virta remapping |
| Default view | **This week, current day emphasized** | Today pinned at top, larger card, accent border |
| Event title from task | **Verbatim by default, editable in modal** | "Finish line sheet copy" → editable to "Chantelle: line sheet review" |
| Due date in modal | **Pre-fills if task has due_date, else requires pick** | Discoverable without being pushy |
| Per-instance isolation | **Each Virta install has its own Google OAuth** | Chantelle's instance binds to her Google account, yours to yours |
| Token storage | **macOS Keychain** | Out of SQLite, survives DB migrations |
| OAuth prompt timing | **Lazy** | First time calendar UI is used |
| Post-it color matching | **Don't try** | Virta colors stay Virta, Google colors stay Google |

---

## Changes Required

### 1. Backend — Keychain migration

**Replace DB token storage with macOS Keychain.**

Create `server/services/keychain.js`:
```js
import { execSync } from 'child_process';

const SERVICE = 'virta';
const ACCOUNT = 'google-oauth';

export function storeTokens({ access_token, refresh_token, expiry_date }) {
  // Store as JSON blob
  const value = JSON.stringify({
    access_token,
    refresh_token,
    expiry_date: expiry_date ? new Date(expiry_date).toISOString() : null
  });
  // -U updates existing entry, prevents duplicate prompt
  execSync(`security add-generic-password -a "${ACCOUNT}" -s "${SERVICE}" -w '${value.replace(/'/g, "'\\''")}' -U`, {
    stdio: ['ignore', 'ignore', 'pipe']
  });
}

export function readTokens() {
  try {
    const raw = execSync(`security find-generic-password -a "${ACCOUNT}" -s "${SERVICE}" -w`, {
      stdio: ['ignore', 'pipe', 'pipe']
    }).toString().trim();
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearTokens() {
  try {
    execSync(`security delete-generic-password -a "${ACCOUNT}" -s "${SERVICE}"`, {
      stdio: ['ignore', 'ignore', 'ignore']
    });
  } catch {}
}
```

**Update `server/routes/calendar.js`:**
- Remove `db.prepare('SELECT * FROM google_credentials...')` reads
- Replace with `readTokens()` from keychain
- Replace `db.prepare('INSERT INTO google_credentials...')` writes
- Replace with `storeTokens()` from keychain
- Keep the `oauth2Client.on('tokens', ...)` auto-refresh handler — same logic, just keychain instead of DB
- `getAuthenticatedClient()` should:
  1. Try `readTokens()`
  2. If null, return null (caller returns 401 → triggers lazy OAuth prompt)
  3. If tokens present, set credentials, set up on('tokens') → `storeTokens()`, return

**Update `auth/status` route:**
- `connected` = `readTokens() !== null && tokens.refresh_token` exists
- Drop `tokenExpiry` lookup against DB, read from `readTokens()` instead

**Migration:** On first request after deploy, if `google_credentials` table has rows but Keychain is empty, migrate them once and drop the table rows (don't drop the schema, just empty them). Add a one-shot migration in `db.js`:
```js
try {
  const row = db.prepare('SELECT * FROM google_credentials WHERE id = 1').get();
  if (row?.refresh_token) {
    storeTokens({
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      expiry_date: row.token_expiry ? new Date(row.token_expiry).getTime() : null
    });
    db.prepare('UPDATE google_credentials SET access_token = NULL, refresh_token = NULL WHERE id = 1').run();
  }
} catch {}
```

**Why Keychain:** secrets don't belong in a sqlite file that gets backed up. Keychain is the right tool on macOS, costs nothing, integrates with the OS keychain prompt you already trust.

---

### 2. Backend — New endpoints (small additions)

The existing route file covers most needs. Add what's missing:

**`GET /api/v1/calendar/events`** — convenience endpoint that returns events from **all** calendars in one call. Frontend uses this for the sidebar view instead of N parallel `calendars/:id/events` requests.

```js
router.get('/calendar/events', async (req, res) => {
  try {
    const auth = getAuthenticatedClient();
    if (!auth) return res.status(401).json({ error: 'Not authorized', code: 'NOT_AUTHORIZED' });

    const { timeMin, timeMax, maxResults = 100 } = req.query;
    const calendar = google.calendar({ version: 'v3', auth });

    // List user's calendars, then fetch events from each
    const calList = await calendar.calendarList.list();
    const calendars = (calList.data.items || []).filter(c => c.selected !== false);

    const allEvents = [];
    for (const cal of calendars) {
      try {
        const ev = await calendar.events.list({
          calendarId: cal.id,
          timeMin: timeMin || new Date().toISOString(),
          timeMax,
          maxResults: parseInt(maxResults),
          singleEvents: true,
          orderBy: 'startTime'
        });
        for (const e of (ev.data.items || [])) {
          allEvents.push({
            id: e.id,
            calendarId: cal.id,
            calendarName: cal.summary,
            calendarColor: cal.backgroundColor,
            title: e.summary || '(no title)',
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            allDay: !e.start?.dateTime,
            htmlLink: e.htmlLink
          });
        }
      } catch (e) {
        // Skip calendars we can't read (permission denied, etc.)
        console.warn(`[calendar] skip ${cal.id}:`, e.message);
      }
    }

    // Sort by start
    allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json({ data: allEvents });
  } catch (err) {
    console.error('[All calendar events error]', err);
    res.status(500).json({ error: err.message, code: 'CALENDAR_ERROR' });
  }
});
```

That's the only new endpoint. Everything else already exists.

---

### 3. Frontend — Calendar sidebar component

**New file:** `client/src/components/CalendarSidebar.jsx`

**Layout:**
- Right side of the viewport, fixed width ~320px when open
- Collapses to a vertical "calendar" icon button on the right edge when closed
- Persist collapsed state to `localStorage` key `calendar-sidebar-open`
- Dark/light mode aware (same conventions as existing components)

**Header:**
- Week range label: "Jun 22 – Jun 28" (current week, Mon–Sun or Sun–Sat — use Sun–Sat to match US convention)
- ◀ ▶ arrows to navigate prev/next week
- "Today" button — jumps back to current week

**Body — events grouped by day:**
- 7 day sections (Mon, Tue, ..., Sun) — sections with no events are dimmed/collapsed
- **Today** is visually emphasized:
  - Section header has accent border (indigo in light, lighter indigo in dark)
  - Section is pinned to the top of the body even if it's later in the week
  - Section is slightly taller / events have a subtle background tint
- Each event:
  - Colored vertical bar on the left = source calendar's Google color
  - Title (truncate with ellipsis at ~28 chars)
  - Time range (or "All day" badge)
  - Hover → tooltip with full description + "Open in Google Calendar" link to `htmlLink`

**Empty / loading states:**
- Loading: skeleton shimmer (3 placeholder rows)
- Empty week: "Nothing scheduled" centered
- Auth required: prominent "Connect Google Calendar" button that opens the OAuth flow

**Auth required flow (lazy):**
- On mount, call `GET /api/v1/auth/status`
- If `connected: false`, show the connect button + a small explanation tooltip
- Click → open `/api/v1/auth/google` in a new tab (the existing route handles the redirect dance)
- After user completes OAuth in the new tab, they get redirected to `/api/v1/auth/google/callback` which renders a "Connected! You can close this tab." page
- Frontend polls `auth/status` every 3 seconds after opening the OAuth tab, stops when `connected: true`, then loads events
- Alternative cleaner pattern: use a `window.open` + `window.addEventListener('message', ...)` if the callback posts a message back. **Recommended** — less polling, better UX. Callback route should `window.opener.postMessage('google-auth-success', window.location.origin)` then close itself.

**Refetch behavior:**
- On week navigation, fetch with appropriate `timeMin` / `timeMax`
- Cache results in component state keyed by ISO week string — instant nav between previously-visited weeks
- Refresh button in header forces a refetch (skip cache)

---

### 4. Frontend — App shell integration

**Update `client/src/App.jsx`:**
- Import `CalendarSidebar`
- Add state: `const [calendarOpen, setCalendarOpen] = useState(localStorage.getItem('calendar-sidebar-open') !== 'false')`
- Render: `<div className="flex"><main className="flex-1">…existing content…</main><CalendarSidebar open={calendarOpen} onToggle={…} /></div>`
- The kanban/list area gets a slight right padding when sidebar is open so cards don't hide behind it
- The toggle icon lives in `Toolbar.jsx` (see next item)

**Update `client/src/components/Toolbar.jsx`:**
- Add a new prop: `calendarOpen`, `onToggleCalendar`
- Add a calendar icon button next to the existing toolbar buttons (settings, dark mode toggle, etc.)
- Use the same button styling convention as the rest of the toolbar
- Active state when sidebar is open (filled background)

**Calendar filter setting (global):**
- Add to `SettingsModal.jsx` under a new section "Google Calendar"
- Section shows:
  - Connection status (Connected as `muckdart@gmail.com` / Not connected — with button to connect/disconnect)
  - List of calendars from `GET /api/v1/calendars` with checkboxes (default all checked)
  - Stored as `localStorage.calendar-filter` = JSON array of calendar IDs to show
  - If empty array → show none. If `null` → show all (default).
- "Disconnect" button calls a new endpoint `DELETE /api/v1/auth/google` (see below)

**Add endpoint: `DELETE /api/v1/auth/google`**
```js
router.delete('/auth/google', (req, res) => {
  clearTokens();
  res.json({ data: { disconnected: true } });
});
```

---

### 5. Frontend — Per-task "Add to Calendar" button

**Update `client/src/components/TaskModal.jsx`:**
- Inside the task modal, add a button near the due-date field: **"Add to Calendar"**
- States:
  - **Not connected:** button is disabled with tooltip "Connect Google Calendar in Settings"
  - **Not on calendar yet:** button is enabled, shows a small calendar icon + "Add to Calendar"
  - **Already on calendar:** button shows ✓ + "On Calendar" + opens a popover with:
    - "View in Google Calendar" link
    - "Remove from Calendar" button (calls `DELETE /calendars/:calId/events/:eventId`)
- Click "Add to Calendar" → opens a small modal (see below)

**New component: `client/src/components/AddToCalendarModal.jsx`**

Modal contents:
- Title: "Add to Calendar"
- **Calendar selector:** dropdown of user's calendars, "Primary" pre-selected
- **Event title:** pre-filled with task title, editable text input
- **Date:** pre-filled from task's `due_date` if set, else required date picker (default = today)
- **Time:** optional. If left empty, event is all-day. If filled, requires start time; end time defaults to start + 1 hour (editable).
- **Description:** pre-filled with task description if any, editable textarea
- Buttons: Cancel | Add to Calendar
- On submit:
  - `POST /api/v1/calendars/:calendarId/events` with the body
  - On success, close modal, refresh the task's calendar-events state, show toast "Added to calendar"
  - On 401 (token expired/revoked), show "Reconnect Google Calendar" prompt

---

### 6. Frontend — Project setting: default "Add to Calendar" checkbox

**Add to `SettingsModal.jsx` — Current Project section:**
- New row: **"Default 'Add to Calendar' for new tasks"**
- Checkbox: when checked, the TaskCreateModal pre-checks the "Add to Calendar" option (see next)
- Stored where? — Two options:
  - **`projects` table** — add column `default_add_to_calendar INTEGER DEFAULT 0`. Migration in `db.js`.
  - **`localStorage` keyed by project ID** — simpler, no migration, but lost if localStorage clears
- **Recommendation:** DB column. It's the kind of preference that should follow the project everywhere, not just the browser that last touched it. Migration:
  ```js
  try { db.exec("ALTER TABLE projects ADD COLUMN default_add_to_calendar INTEGER DEFAULT 0"); } catch {}
  ```

**Update `server/routes/projects.js`:**
- Accept `default_add_to_calendar` in `updateProject` body
- Update `getAllProjects` / `getProject` to return it

**Update `client/src/components/TaskCreateModal.jsx`:**
- New checkbox: **"Add to Calendar"** (visible only when Google Calendar is connected)
- Default state = project's `default_add_to_calendar` value
- When checked, the task creation flow also immediately calls `POST /calendars/:id/events` after the task is created (chain the calls)
- Show a small tooltip: "You can manage this later from the task"

---

### 7. Backend — Tasks endpoint minor change

**Update `server/routes/tasks.js` (or wherever createTask lives):**
- `createTask` body can optionally include `addToCalendar: true` + `calendarId`
- If present, after creating the task, call the calendar service to create an event and link it
- Returns the task with `calendarEvents` populated so the frontend doesn't need a separate fetch
- This keeps "create task + add to calendar" atomic from the user's POV

---

## File Summary

**New files:**
- `server/services/keychain.js`
- `client/src/components/CalendarSidebar.jsx`
- `client/src/components/AddToCalendarModal.jsx`

**Modified files:**
- `server/routes/calendar.js` — switch to keychain, add `calendar/events` endpoint, add `DELETE /auth/google`, update callback to postMessage
- `server/routes/projects.js` — accept `default_add_to_calendar`
- `server/db.js` — add `default_add_to_calendar` column migration, keychain one-shot migration
- `client/src/App.jsx` — render sidebar
- `client/src/components/Toolbar.jsx` — calendar toggle button
- `client/src/components/SettingsModal.jsx` — Google Calendar section, project setting
- `client/src/components/TaskModal.jsx` — Add to Calendar button + states
- `client/src/components/TaskCreateModal.jsx` — Add to Calendar checkbox
- `client/src/lib/api.js` — add helpers for the new endpoints (or call fetch directly)

**No changes:**
- Stack, port, launchd config, deployment, auth (Cloudflare Access stays as-is)

---

## Key Rules

- **Don't change the stack, port, or launchd config**
- **Tokens live in Keychain, not DB** — DB writes to `google_credentials` should be empty after migration
- **Don't auto-create calendar events** — every event push is user-initiated
- **Calendar is read-only inside Virta** — no two-way sync, no conflict resolution
- **Sidebar collapses by default on mobile widths** (<768px) — desktop-first design, mobile gets a bottom-sheet style if needed later
- **All-day vs timed** — if no time picked, all-day event. If time picked, end defaults to start + 1h.
- **Today is always visible** — pinned to top of sidebar regardless of which week is being viewed
- **Calendar colors come from Google, not Virta** — don't remap post-it colors to calendar colors

---

## Definition of Done

- [ ] `security find-generic-password -a google-oauth -s virta` returns the JSON token blob
- [ ] `google_credentials` table has no refresh_token after migration runs
- [ ] OAuth flow opens in new tab, callback posts message back, sidebar auto-refreshes events
- [ ] Sidebar shows current week, today emphasized, events color-coded by source calendar
- [ ] Sidebar collapses/expands, state persists in localStorage
- [ ] Week navigation works (prev/next/today), events cache for instant re-nav
- [ ] Task modal has "Add to Calendar" button with correct states (disabled / enabled / already-added)
- [ ] "Add to Calendar" modal opens, allows editing title/date/time/description, creates event successfully
- [ ] "✓ On Calendar" badge appears after add, with View/Remove actions
- [ ] Settings → Google Calendar shows connection status, calendar filter checkboxes, connect/disconnect button
- [ ] Settings → Current Project has "Default 'Add to Calendar' for new tasks" checkbox
- [ ] TaskCreateModal respects the project default
- [ ] Chantelle's instance, when set up, binds to *her* Google account, not yours (verified by logout/login test)
- [ ] `npm run build` succeeds
- [ ] Service restarts and responds on port 3001

---

## Post-deploy

- Smoke test: connect OAuth, see events in sidebar, add a task to calendar, verify it shows up in Google Calendar UI, remove from calendar, verify it disappears
- Document the Keychain entry name (`virta` / `google-oauth`) in `TOOLS.md` so future Rusty can find it
- Write `CINDER_REPORT_5.md` + `WREN_REPORT_5.md` + `ECHO_REPORT_5.md` per usual pipeline

---

## Related / Out of Scope

- **v6 candidate: multi-user Virta** — Chantelle's separate instance on her Mac mini. Calendar OAuth naturally isolates per-user. No work needed in this v5 to enable that, but the architecture supports it.
- **v7+ candidate: per-instance branding** — for Chantelle's fork, she'd want `client-chantelle/` with her logo, palette, default columns (Sampling / Photographed / Priced / In Line Sheet / Wholesale Order / Shipped). Tracked separately.
- **Future: calendar event → task conversion** — "right-click event in sidebar → create task from this." Not in v5, but the data is there. Easy follow-up.
- **Future: shared backend, divergent frontend** — confirmed in 2026-06-27 session as the architecture for Chantelle's fork. No work in this v5.
- **Backlog: subtasks** — add the ability to break a task into sub-items (checklist-style under a parent task). Parent shows progress (e.g. "3/7 done"). Open questions: do subtasks live in their own column or always inherit the parent's? Do they have their own due dates? Do they appear in the kanban independently or only inside the parent modal? Design TBD when we pick this up.
