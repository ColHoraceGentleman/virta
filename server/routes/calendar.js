import { Router } from 'express';
import { google } from 'googleapis';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { storeTokens, readTokens, clearTokens } from '../services/keychain.js';
import {
  getOAuthClient,
  getAuthenticatedClient,
  createCalendarEvent,
  deleteCalendarEvent
} from '../services/calendarService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(__dirname, '..', '..', 'google-credentials.json');

// Use the broad `calendar` scope only — it covers both calendarList (listing
// calendars) AND events operations (create/read/update/delete). The
// `calendar.events` scope is a strict subset of `calendar`, so requesting
// both is redundant and was confusing the OAuth grant logic.
//
// ⚠️  SECURITY: The `calendar` scope technically permits calendar-level
// operations (create/delete/modify whole calendars, change ACLs). Virta MUST
// NEVER call those APIs. We only use it because `calendarList.list()` has no
// narrower-scope equivalent in Google's API.
//
// To enforce this, run `node scripts/audit-calendar-api.js`. It is run in CI
// and as a pre-release check. The audit forbids: calendars.insert/delete/
// patch/update/clear, acl.*, settings.*, colors.*. See that script for the
// authoritative list.
//
// If you ever need a forbidden operation, the right answer is to switch
// OAuth clients (e.g. a dedicated project with a different scope) or build
// a separate product — NOT to loosen this constraint.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar'
];

const router = Router();

// GET /api/v1/auth/google — initiate OAuth flow (lazy: opened when user first clicks "Connect")
router.get('/auth/google', (req, res) => {
  const oauth2Client = getOAuthClient(req);
  if (!oauth2Client) {
    return res.status(503).json({
      error: 'Google credentials file not found. Place google-credentials.json in the project root.',
      code: 'CREDENTIALS_MISSING'
    });
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });

  res.redirect(authUrl);
});

// GET /api/v1/auth/google/callback — OAuth2 callback
// After storing tokens, posts a message back to the opener (CalendarSidebar) then closes.
router.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`<h2>Auth failed: ${error}</h2><p>Close this tab and try again.</p>`);
  }
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code', code: 'MISSING_CODE' });
  }

  try {
    const oauth2Client = getOAuthClient(req);
    if (!oauth2Client) {
      return res.status(503).json({ error: 'Credentials file missing', code: 'CREDENTIALS_MISSING' });
    }

    const { tokens } = await oauth2Client.getToken(code);

    storeTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
    });

    // Tell the opener (CalendarSidebar) that auth succeeded, then close the tab.
    // Falls back gracefully if the tab was opened directly (no window.opener).
    res.send(`<!doctype html>
<html><head><title>Virta — Google Calendar connected</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:48px;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;box-sizing:border-box;">
  <div style="text-align:center;max-width:420px;">
    <div style="font-size:48px;line-height:1;margin-bottom:16px;color:#6366f1;">✓</div>
    <h2 style="color:#6366f1;margin:0 0 8px 0;font-weight:500;">Google Calendar connected</h2>
    <p style="opacity:.7;margin:0;">You can close this tab and return to Virta.</p>
  </div>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage('virta:google-auth-success', '*');
        setTimeout(() => window.close(), 300);
      }
    } catch (e) { /* no opener — user opened this directly */ }
  </script>
</body></html>`);
  } catch (err) {
    console.error('[Calendar OAuth callback error]', err);
    res.status(500).send(`<h2>Auth error</h2><p>${err.message}</p>`);
  }
});

// GET /api/v1/auth/status
router.get('/auth/status', (req, res) => {
  const credentialsFileExists = existsSync(CREDENTIALS_PATH);
  const tokens = readTokens();
  res.json({
    credentialsFile: credentialsFileExists,
    connected: !!tokens?.refresh_token,
    tokenExpiry: tokens?.expiry_date || null
  });
});

// DELETE /api/v1/auth/google — disconnect (clears Keychain + all calendar event links)
router.delete('/auth/google', (req, res) => {
  clearTokens();
  try {
    db.prepare('DELETE FROM calendar_events').run();
  } catch (err) {
    console.warn('[calendar] could not clear calendar_events:', err.message);
  }
  res.json({ data: { disconnected: true } });
});

// GET /api/v1/calendar/events — all calendars in one call (used by sidebar)
router.get('/calendar/events', async (req, res) => {
  try {
    const auth = getAuthenticatedClient(req);
    if (!auth) return res.status(401).json({ error: 'Not authorized', code: 'NOT_AUTHORIZED' });

    const { timeMin, timeMax, maxResults = 100 } = req.query;
    const calendar = google.calendar({ version: 'v3', auth });

    const calList = await calendar.calendarList.list({
      showHidden: false,
      minAccessRole: 'freeBusyReader'
    });
    const calendars = (calList.data.items || []); // include all — filter is applied in the sidebar via calFilter

    const allEvents = [];
    for (const cal of calendars) {
      try {
        const ev = await calendar.events.list({
          calendarId: cal.id,
          timeMin: timeMin || new Date().toISOString(),
          timeMax,
          maxResults: parseInt(maxResults, 10),
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
            description: e.description || '',
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            allDay: !e.start?.dateTime,
            htmlLink: e.htmlLink
          });
        }
      } catch (e) {
        console.warn(`[calendar] skip ${cal.id}: ${e.message}`);
      }
    }

    allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
    res.json({ data: allEvents });
  } catch (err) {
    console.error('[All calendar events error]', err);
    res.status(500).json({ error: err.message, code: 'CALENDAR_ERROR' });
  }
});

// GET /api/v1/calendars — list user's calendars (used by AddToCalendarModal + Settings filter)
router.get('/calendars', async (req, res) => {
  try {
    const auth = getAuthenticatedClient(req);
    if (!auth) return res.status(401).json({ error: 'Not authorized', code: 'NOT_AUTHORIZED' });

    const calendar = google.calendar({ version: 'v3', auth });
    // showHidden=true surfaces calendars the user has unchecked in the UI.
    // minAccessRole=freeBusyReader returns calendars with any access level
    // (including ones shared read-only with the user).
    const response = await calendar.calendarList.list({
      showHidden: true,
      minAccessRole: 'freeBusyReader'
    });
    const calendars = (response.data.items || []).map(c => ({
      id: c.id,
      name: c.summary,
      primary: c.primary || false,
      color: c.backgroundColor,
      accessRole: c.accessRole,
      selected: c.selected !== false,
      hidden: c.hidden === true
    }));

    res.json({ data: calendars });
  } catch (err) {
    console.error('[Calendars list error]', err);
    res.status(500).json({ error: err.message, code: 'CALENDAR_ERROR' });
  }
});

// GET /api/v1/calendars/:calendarId/events — events for one calendar
router.get('/calendars/:calendarId/events', async (req, res) => {
  try {
    const auth = getAuthenticatedClient(req);
    if (!auth) return res.status(401).json({ error: 'Not authorized', code: 'NOT_AUTHORIZED' });

    const { calendarId } = req.params;
    const { timeMin, timeMax, maxResults = 50 } = req.query;

    const calendar = google.calendar({ version: 'v3', auth });
    const response = await calendar.events.list({
      calendarId: decodeURIComponent(calendarId),
      timeMin: timeMin || new Date().toISOString(),
      timeMax,
      maxResults: parseInt(maxResults, 10),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = (response.data.items || []).map(e => ({
      id: e.id,
      title: e.summary,
      description: e.description,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      allDay: !e.start?.dateTime,
      htmlLink: e.htmlLink
    }));

    res.json({ data: events });
  } catch (err) {
    console.error('[Calendar events error]', err);
    res.status(500).json({ error: err.message, code: 'CALENDAR_ERROR' });
  }
});

// POST /api/v1/calendars/:calendarId/events — create event (delegates to calendarService)
router.post('/calendars/:calendarId/events', async (req, res) => {
  try {
    const auth = getAuthenticatedClient(req);
    if (!auth) return res.status(401).json({ error: 'Not authorized', code: 'NOT_AUTHORIZED' });

    const { calendarId } = req.params;
    const { taskId, title, description, startDateTime, endDateTime, allDay } = req.body;

    if (!title || !startDateTime) {
      return res.status(400).json({ error: 'title and startDateTime are required', code: 'MISSING_FIELDS' });
    }

    const event = await createCalendarEvent({ calendarId, taskId, title, description, startDateTime, endDateTime, allDay }, req);
    res.status(201).json({ data: event });
  } catch (err) {
    console.error('[Create calendar event error]', err);
    res.status(500).json({ error: err.message, code: 'CALENDAR_ERROR' });
  }
});

// DELETE /api/v1/calendars/:calendarId/events/:eventId
router.delete('/calendars/:calendarId/events/:eventId', async (req, res) => {
  try {
    const auth = getAuthenticatedClient(req);
    if (!auth) return res.status(401).json({ error: 'Not authorized', code: 'NOT_AUTHORIZED' });

    const { calendarId, eventId } = req.params;
    const result = await deleteCalendarEvent({ calendarId, eventId }, req);
    res.json({ data: result });
  } catch (err) {
    console.error('[Delete calendar event error]', err);
    res.status(500).json({ error: err.message, code: 'CALENDAR_ERROR' });
  }
});

// GET /api/v1/tasks/:taskId/calendar-events — events linked to a task
router.get('/tasks/:taskId/calendar-events', (req, res) => {
  try {
    const { taskId } = req.params;
    const events = db.prepare('SELECT * FROM calendar_events WHERE task_id = ?').all(taskId);
    res.json({ data: events });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

export default router;
