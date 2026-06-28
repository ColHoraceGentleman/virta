/**
 * icalService.js
 *
 * Fetches and parses iCalendar (RFC 5545) feeds, normalizes events for Virta.
 *
 * Caching strategy: each feed has a 30-minute TTL. Re-fetches on TTL expiry or
 * when forceRefresh is true. Failed fetches are cached for 5 minutes to avoid
 * hammering dead feeds.
 */

import ical from 'node-ical';
import db from '../db.js';

const SUCCESS_TTL_MS = 30 * 60 * 1000; // 30 min
const FAILURE_TTL_MS = 5 * 60 * 1000;  // 5 min
const FETCH_TIMEOUT_MS = 15000;        // 15s

const cache = new Map(); // feedId -> { events, fetchedAt, error }

/**
 * Fetch and parse a single feed, with caching.
 * Returns: { events: [...], error: string|null, fetchedAt: ISO }
 */
export async function fetchFeed(feed, { forceRefresh = false } = {}) {
  const cached = cache.get(feed.id);
  const now = Date.now();

  if (!forceRefresh && cached) {
    const age = now - cached.fetchedAt;
    const ttl = cached.error ? FAILURE_TTL_MS : SUCCESS_TTL_MS;
    if (age < ttl) return cached;
  }

  try {
    const events = await ical.async.fromURL(feed.url, {
      timeout: FETCH_TIMEOUT_MS
    });

    const normalized = Object.values(events)
      .filter(e => e.type === 'VEVENT')
      .map(e => normalizeEvent(e, feed))
      .filter(Boolean);

    const result = { events: normalized, error: null, fetchedAt: now };
    cache.set(feed.id, result);

    // Update DB bookkeeping
    db.prepare(`
      UPDATE calendar_feeds
      SET last_fetched_at = datetime('now'), last_error = NULL
      WHERE id = ?
    `).run(feed.id);

    return result;
  } catch (err) {
    const result = {
      events: cached?.events || [],
      error: err.message || String(err),
      fetchedAt: now
    };
    cache.set(feed.id, result);

    db.prepare(`
      UPDATE calendar_feeds
      SET last_fetched_at = datetime('now'), last_error = ?
      WHERE id = ?
    `).run(result.error, feed.id);

    return result;
  }
}

/**
 * Normalize a node-ical VEVENT into Virta's internal shape.
 *
 * Returns:
 *   {
 *     id:           stable hash of uid+start,
 *     feedId, feedName, feedColor,
 *     title,
 *     description,
 *     location,
 *     start:        ISO string,
 *     end:          ISO string | null,
 *     allDay:       boolean,
 *   }
 */
function normalizeEvent(e, feed) {
  if (!e.uid) return null;

  const start = e.start instanceof Date ? e.start : null;
  if (!start) return null;

  const end = e.end instanceof Date ? e.end : null;
  // iCal all-day events have start/end as Date with time at 00:00:00. Detect by type.
  const allDay = e.type === 'VEVENT' && (
    e.datetype === 'date' ||
    (start.getHours() === 0 && start.getMinutes() === 0 &&
     start.getSeconds() === 0 && start.getMilliseconds() === 0 &&
     (!end || (end.getHours() === 0 && end.getMinutes() === 0)))
  );

  // Skip events that ended in the past (more than 1 day ago)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (end && end < oneDayAgo) return null;
  if (!end && start < oneDayAgo) return null;

  // Stable id for deduping across refreshes
  const id = `${e.uid}-${start.toISOString()}`;

  return {
    id,
    feedId: feed.id,
    feedName: feed.name,
    feedColor: feed.color,
    title: e.summary || '(no title)',
    description: e.description || '',
    location: e.location || '',
    start: start.toISOString(),
    end: end ? end.toISOString() : null,
    allDay
  };
}

/**
 * Fetch all enabled feeds in parallel, returning a flat event list.
 * Events from feeds that errored are skipped (with their error logged in DB).
 */
export async function fetchAllFeeds({ forceRefresh = false } = {}) {
  const feeds = db.prepare(`
    SELECT id, name, url, color, enabled, last_fetched_at, last_error
    FROM calendar_feeds
    WHERE enabled = 1
    ORDER BY created_at ASC
  `).all();

  const results = await Promise.all(feeds.map(f => fetchFeed(f, { forceRefresh })));

  const allEvents = [];
  const errors = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].error) {
      errors.push({ feedId: feeds[i].id, feedName: feeds[i].name, error: results[i].error });
    }
    allEvents.push(...results[i].events);
  }

  return { events: allEvents, errors };
}

/** Clear all cached entries. */
export function clearCache() {
  cache.clear();
}
