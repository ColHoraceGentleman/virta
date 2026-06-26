/**
 * Gmail Service
 * Reads unread emails from gentlemanhorace@gmail.com and surfaces them
 * for Rusty to process. Uses the same OAuth2 credentials as Google Calendar.
 */

import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(__dirname, '..', '..', 'google-credentials.json');
const REDIRECT_URI = 'http://localhost:3001/api/v1/auth/google/callback';

function getAuthenticatedClient() {
  if (!existsSync(CREDENTIALS_PATH)) return null;
  const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = creds.web || creds.installed;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  const row = db.prepare('SELECT * FROM google_credentials WHERE id = 1').get();
  if (!row?.refresh_token) return null;

  oauth2Client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.token_expiry ? new Date(row.token_expiry).getTime() : null
  });

  oauth2Client.on('tokens', (tokens) => {
    db.prepare(`
      INSERT INTO google_credentials (id, access_token, refresh_token, token_expiry)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, refresh_token),
        token_expiry = excluded.token_expiry
    `).run(
      tokens.access_token || row.access_token,
      tokens.refresh_token || row.refresh_token,
      tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : row.token_expiry
    );
  });

  return oauth2Client;
}

/**
 * Get unread emails (up to maxResults)
 */
export async function getUnreadEmails(maxResults = 20) {
  const auth = getAuthenticatedClient();
  if (!auth) throw new Error('Gmail not authorized');

  const gmail = google.gmail({ version: 'v1', auth });

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return [];

  const emails = await Promise.all(
    messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full'
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const parts = detail.data.payload?.parts || [];
      let body = '';

      // Extract plain text body
      const findBody = (parts) => {
        for (const part of parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            return Buffer.from(part.body.data, 'base64').toString('utf8');
          }
          if (part.parts) {
            const found = findBody(part.parts);
            if (found) return found;
          }
        }
        return '';
      };

      if (detail.data.payload?.body?.data) {
        body = Buffer.from(detail.data.payload.body.data, 'base64').toString('utf8');
      } else {
        body = findBody(parts);
      }

      return {
        id: msg.id,
        threadId: msg.threadId,
        subject: getHeader('subject'),
        from: getHeader('from'),
        date: getHeader('date'),
        snippet: detail.data.snippet,
        body: body.trim().slice(0, 5000), // cap at 5k chars
        labelIds: detail.data.labelIds || []
      };
    })
  );

  return emails;
}

/**
 * Mark an email as read
 */
export async function markAsRead(messageId) {
  const auth = getAuthenticatedClient();
  if (!auth) throw new Error('Gmail not authorized');

  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] }
  });
}

/**
 * Get email count summary (unread, total)
 */
export async function getEmailSummary() {
  const auth = getAuthenticatedClient();
  if (!auth) return null;

  const gmail = google.gmail({ version: 'v1', auth });
  const profile = await gmail.users.getProfile({ userId: 'me' });

  const unreadRes = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults: 1
  });

  return {
    email: profile.data.emailAddress,
    totalMessages: profile.data.messagesTotal,
    totalThreads: profile.data.threadsTotal,
    estimatedUnread: unreadRes.data.resultSizeEstimate || 0
  };
}
