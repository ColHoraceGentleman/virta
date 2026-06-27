/**
 * calendarService.js
 * Shared Google Calendar operations. Used by both server/routes/calendar.js
 * and server/routes/tasks.js (atomic task-create + calendar-push).
 */

import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { readTokens, storeTokens } from './keychain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(__dirname, '..', '..', 'google-credentials.json');
const REDIRECT_URI = 'http://localhost:3001/api/v1/auth/google/callback';

export function getOAuthClient() {
  if (!existsSync(CREDENTIALS_PATH)) return null;
  const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = creds.web || creds.installed;
  return new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
}

export function getAuthenticatedClient() {
  const oauth2Client = getOAuthClient();
  if (!oauth2Client) return null;

  const tokens = readTokens();
  if (!tokens || !tokens.refresh_token) return null;

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).getTime() : null
  });

  oauth2Client.on('tokens', (newTokens) => {
    const merged = {
      access_token: newTokens.access_token || tokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      expiry_date: newTokens.expiry_date
        ? new Date(newTokens.expiry_date).toISOString()
        : tokens.expiry_date
    };
    try { storeTokens(merged); } catch (err) {
      console.error('[calendarService] failed to persist refreshed tokens:', err.message);
    }
  });

  return oauth2Client;
}

/**
 * Create a Google Calendar event and optionally link it to a Virta task.
 *
 * @param {object} opts
 * @param {string} opts.calendarId        - Google Calendar ID (e.g. 'primary')
 * @param {string} opts.title             - Event title
 * @param {string} [opts.description]     - Event description
 * @param {string} opts.startDateTime     - ISO-8601 string
 * @param {string} [opts.endDateTime]     - ISO-8601 string; defaults to start + 1 hour (or same day for allDay)
 * @param {boolean} [opts.allDay]         - All-day event if true
 * @param {string} [opts.taskId]          - Virta task ID to link the event to
 * @returns {Promise<{googleEventId, htmlLink, title, start}>}
 */
export async function createCalendarEvent({ calendarId, title, description, startDateTime, endDateTime, allDay, taskId }) {
  const auth = getAuthenticatedClient();
  if (!auth) throw new Error('Google Calendar not connected');

  const calendar = google.calendar({ version: 'v3', auth });

  const eventBody = {
    summary: title,
    description: description || '',
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] }
  };

  if (allDay) {
    const endDate = new Date(`${(endDateTime || startDateTime).split('T')[0]}T00:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    eventBody.start = { date: startDateTime.split('T')[0] };
    eventBody.end = { date: endDate.toISOString().split('T')[0] };
  } else {
    eventBody.start = { dateTime: startDateTime };
    eventBody.end = { dateTime: endDateTime || new Date(new Date(startDateTime).getTime() + 3600000).toISOString() };
  }

  const response = await calendar.events.insert({
    calendarId: decodeURIComponent(calendarId),
    requestBody: eventBody
  });

  const event = response.data;

  if (taskId) {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
    if (task) {
      db.prepare(
        'INSERT INTO calendar_events (task_id, google_event_id, calendar_id) VALUES (?, ?, ?)'
      ).run(taskId, event.id, decodeURIComponent(calendarId));
    }
  }

  return {
    googleEventId: event.id,
    htmlLink: event.htmlLink,
    title: event.summary,
    start: event.start?.dateTime || event.start?.date
  };
}

/**
 * Delete a Google Calendar event and remove the DB link.
 */
export async function deleteCalendarEvent({ calendarId, eventId }) {
  const auth = getAuthenticatedClient();
  if (!auth) throw new Error('Google Calendar not connected');

  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({
    calendarId: decodeURIComponent(calendarId),
    eventId
  });

  db.prepare('DELETE FROM calendar_events WHERE google_event_id = ?').run(eventId);
  return { deleted: true };
}
