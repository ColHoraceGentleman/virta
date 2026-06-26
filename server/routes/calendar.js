import { Router } from 'express';
import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

const CREDENTIALS_PATH = join(__dirname, '..', '..', 'google-credentials.json');
const REDIRECT_URI = 'http://localhost:3001/api/v1/auth/google/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify'
];

function getOAuthClient() {
  if (!existsSync(CREDENTIALS_PATH)) return null;
  const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = creds.web || creds.installed;
  return new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
}

function getAuthenticatedClient() {
  const oauth2Client = getOAuthClient();
  if (!oauth2Client) return null;

  const row = db.prepare('SELECT * FROM google_credentials WHERE id = 1').get();
  if (!row || !row.refresh_token) return null;

  oauth2Client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.token_expiry ? new Date(row.token_expiry).getTime() : null
  });

  // Auto-save refreshed tokens
  oauth2Client.on('tokens', (tokens) => {
    const upsert = db.prepare(`
      INSERT INTO google_credentials (id, access_token, refresh_token, token_expiry)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, refresh_token),
        token_expiry = excluded.token_expiry
    `);
    upsert.run(
      tokens.access_token || row.access_token,
      tokens.refresh_token || row.refresh_token,
      tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : row.token_expiry
    );
  });

  return oauth2Client;
}

// GET /api/v1/auth/google — initiate OAuth flow
router.get('/auth/google', (req, res) => {
  const oauth2Client = getOAuthClient();
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
router.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`<h2>Auth failed: ${error}</h2><p>Close this tab and try again.</p>`);
  }

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code', code: 'MISSING_CODE' });
  }

  try {
    const oauth2Client = getOAuthClient();
    if (!oauth2Client) {
      return res.status(503).json({ error: 'Credentials file missing', code: 'CREDENTIALS_MISSING' });
    }

    const { tokens } = await oauth2Client.getToken(code);

    const upsert = db.prepare(`
      INSERT INTO google_credentials (id, access_token, refresh_token, token_expiry)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, refresh_token),
        token_expiry = excluded.token_expiry
    `);
    upsert.run(
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
    );

    res.send(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0f172a;color:#e2e8f0;">
        <h2 style="color:#6366f1">✅ Google Calendar connected!</h2>
        <p>You can close this tab and return to Rusty Tasks.</p>
        <script>setTimeout(() => window.close(), 2000);</script>
      </body></html>
    `);
  } catch (err) {
    console.error('[Calendar OAuth callback error]', err);
    res.status(500).send(`<h2>Auth error</h2><p>${err.message}</p>`);
  }
});

// GET /api/v1/auth/status
router.get('/auth/status', (req, res) => {
  const credentialsFileExists = existsSync(CREDENTIALS_PATH);
  const row = db.prepare('SELECT id, token_expiry FROM google_credentials WHERE id = 1').get();
  const hasRefreshToken = !!db.prepare('SELECT refresh_token FROM google_credentials WHERE id = 1').get()?.refresh_token;

  res.json({
    credentialsFile: credentialsFileExists,
    connected: hasRefreshToken,
    tokenExpiry: row?.token_expiry || null
  });
});

// GET /api/v1/calendars — list user's calendars
router.get('/calendars', async (req, res) => {
  try {
    const auth = getAuthenticatedClient();
    if (!auth) {
      return res.status(401).json({ error: 'Google Calendar not connected. Visit /api/v1/auth/google to authorize.', code: 'NOT_AUTHORIZED' });
    }

    const calendar = google.calendar({ version: 'v3', auth });
    const response = await calendar.calendarList.list();
    const calendars = (response.data.items || []).map(c => ({
      id: c.id,
      name: c.summary,
      primary: c.primary || false,
      color: c.backgroundColor
    }));

    res.json({ data: calendars });
  } catch (err) {
    console.error('[Calendars list error]', err);
    res.status(500).json({ error: err.message, code: 'CALENDAR_ERROR' });
  }
});

// GET /api/v1/calendars/:calendarId/events
router.get('/calendars/:calendarId/events', async (req, res) => {
  try {
    const auth = getAuthenticatedClient();
    if (!auth) return res.status(401).json({ error: 'Not authorized', code: 'NOT_AUTHORIZED' });

    const { calendarId } = req.params;
    const { timeMin, timeMax, maxResults = 50 } = req.query;

    const calendar = google.calendar({ version: 'v3', auth });
    const response = await calendar.events.list({
      calendarId: decodeURIComponent(calendarId),
      timeMin: timeMin || new Date().toISOString(),
      timeMax,
      maxResults: parseInt(maxResults),
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

// POST /api/v1/calendars/:calendarId/events — create event from task
router.post('/calendars/:calendarId/events', async (req, res) => {
  try {
    const auth = getAuthenticatedClient();
    if (!auth) return res.status(401).json({ error: 'Not authorized', code: 'NOT_AUTHORIZED' });

    const { calendarId } = req.params;
    const { taskId, title, description, startDateTime, endDateTime, allDay } = req.body;

    if (!title || !startDateTime) {
      return res.status(400).json({ error: 'title and startDateTime are required', code: 'MISSING_FIELDS' });
    }

    const calendar = google.calendar({ version: 'v3', auth });

    const eventBody = {
      summary: title,
      description: description || '',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] }
    };

    if (allDay) {
      eventBody.start = { date: startDateTime.split('T')[0] };
      eventBody.end = { date: (endDateTime || startDateTime).split('T')[0] };
    } else {
      eventBody.start = { dateTime: startDateTime };
      eventBody.end = { dateTime: endDateTime || new Date(new Date(startDateTime).getTime() + 3600000).toISOString() };
    }

    const response = await calendar.events.insert({
      calendarId: decodeURIComponent(calendarId),
      requestBody: eventBody
    });

    const event = response.data;

    // Link to task if taskId provided
    if (taskId) {
      const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
      if (task) {
        db.prepare(
          'INSERT INTO calendar_events (task_id, google_event_id, calendar_id) VALUES (?, ?, ?)'
        ).run(taskId, event.id, decodeURIComponent(calendarId));
      }
    }

    res.status(201).json({
      data: {
        googleEventId: event.id,
        htmlLink: event.htmlLink,
        title: event.summary,
        start: event.start?.dateTime || event.start?.date
      }
    });
  } catch (err) {
    console.error('[Create calendar event error]', err);
    res.status(500).json({ error: err.message, code: 'CALENDAR_ERROR' });
  }
});

// DELETE /api/v1/calendars/:calendarId/events/:eventId
router.delete('/calendars/:calendarId/events/:eventId', async (req, res) => {
  try {
    const auth = getAuthenticatedClient();
    if (!auth) return res.status(401).json({ error: 'Not authorized', code: 'NOT_AUTHORIZED' });

    const { calendarId, eventId } = req.params;
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: decodeURIComponent(calendarId),
      eventId
    });

    // Remove link from DB
    db.prepare('DELETE FROM calendar_events WHERE google_event_id = ?').run(eventId);

    res.json({ data: { deleted: true } });
  } catch (err) {
    console.error('[Delete calendar event error]', err);
    res.status(500).json({ error: err.message, code: 'CALENDAR_ERROR' });
  }
});

// GET /api/v1/tasks/:taskId/calendar-events
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
