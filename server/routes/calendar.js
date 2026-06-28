import { Router } from 'express';
import db, { generateId } from '../db.js';
import { fetchFeed, fetchAllFeeds, clearCache } from '../services/icalService.js';
import * as taskService from '../services/taskService.js';

// Parse a date-only string (YYYY-MM-DD) as LOCAL midnight.
// new Date('2026-06-27') is parsed as UTC midnight, which in non-UTC
// timezones is a different calendar day. For due-date semantics we want local.
function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(dateStr);
}

const router = Router();

// ── Feed CRUD ────────────────────────────────────────────────────────────────

// GET /api/v1/calendar/feeds — list all feeds
router.get('/feeds', (req, res) => {
  try {
    const feeds = db.prepare(`
      SELECT id, name, url, color, enabled, last_fetched_at, last_error, created_at
      FROM calendar_feeds
      ORDER BY created_at ASC
    `).all();
    res.json({ data: feeds.map(f => ({ ...f, enabled: !!f.enabled })) });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'DB_ERROR' });
  }
});

// POST /api/v1/calendar/feeds — add a new feed
router.post('/feeds', async (req, res) => {
  try {
    const { name, url, color } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required', code: 'MISSING_FIELDS' });
    }
    if (!/^https?:\/\//i.test(url) && !/^webcal:\/\//i.test(url)) {
      return res.status(400).json({ error: 'url must start with http(s):// or webcal://', code: 'INVALID_URL' });
    }
    // Normalize webcal:// to https:// (same protocol)
    const normalizedUrl = url.replace(/^webcal:\/\//i, 'https://');

    const id = generateId();
    db.prepare(`
      INSERT INTO calendar_feeds (id, name, url, color)
      VALUES (?, ?, ?, ?)
    `).run(id, name.trim(), normalizedUrl, color || '#6366f1');

    clearCache();

    // Try an initial fetch — if it fails, we still save the feed, just with an error logged
    const feed = db.prepare('SELECT * FROM calendar_feeds WHERE id = ?').get(id);
    const result = await fetchFeed(feed, { forceRefresh: true });

    res.status(201).json({
      data: {
        id: feed.id,
        name: feed.name,
        url: feed.url,
        color: feed.color,
        enabled: true,
        last_fetched_at: feed.last_fetched_at,
        last_error: feed.last_error,
        events_fetched: result.events.length,
        initial_fetch_error: result.error
      }
    });
  } catch (err) {
    console.error('[Add feed error]', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// PATCH /api/v1/calendar/feeds/:id — update feed (name, color, enabled)
router.patch('/feeds/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, enabled } = req.body;
    const current = db.prepare('SELECT * FROM calendar_feeds WHERE id = ?').get(id);
    if (!current) return res.status(404).json({ error: 'Feed not found', code: 'NOT_FOUND' });

    db.prepare(`
      UPDATE calendar_feeds
      SET name = ?, color = ?, enabled = ?
      WHERE id = ?
    `).run(
      name ?? current.name,
      color ?? current.color,
      enabled !== undefined ? (enabled ? 1 : 0) : current.enabled,
      id
    );
    clearCache();
    res.json({ data: db.prepare('SELECT * FROM calendar_feeds WHERE id = ?').get(id) });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// DELETE /api/v1/calendar/feeds/:id
router.delete('/feeds/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM calendar_feeds WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Feed not found', code: 'NOT_FOUND' });
    clearCache();
    res.json({ data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/calendar/feeds/:id/refresh — force refresh one feed
router.post('/feeds/:id/refresh', async (req, res) => {
  try {
    const { id } = req.params;
    const feed = db.prepare('SELECT * FROM calendar_feeds WHERE id = ?').get(id);
    if (!feed) return res.status(404).json({ error: 'Feed not found', code: 'NOT_FOUND' });
    const result = await fetchFeed(feed, { forceRefresh: true });
    res.json({ data: { events_fetched: result.events.length, error: result.error } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/calendar/refresh — force refresh all feeds
router.post('/refresh', async (req, res) => {
  try {
    const { events, errors } = await fetchAllFeeds({ forceRefresh: true });
    res.json({ data: { events_count: events.length, errors } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ── Events for a given day (merges calendar + tasks) ─────────────────────────

// GET /api/v1/calendar/today?date=YYYY-MM-DD
// Returns: {
//   items: [...],       // merged timeline items
//   events: [...],      // raw calendar events for that day
//   tasks_due: [...],   // tasks due that day (no specific time)
//   tasks_completed: [...]  // tasks completed that day
// }
router.get('/today', async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const dayStart = new Date(`${dateStr}T00:00:00`);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Calendar events (from all enabled feeds)
    const { events: allEvents, errors } = await fetchAllFeeds();
    const dayEvents = allEvents.filter(e => {
      const start = new Date(e.start);
      const end = e.end ? new Date(e.end) : null;
      // Event overlaps this day if it starts before day ends AND ends after day starts
      return start < dayEnd && (end ? end > dayStart : start >= dayStart);
    });

    // Tasks due this day (across all projects, excluding those in Completed columns)
    const allTasks = taskService.getAllTasks();
    const tasksDue = allTasks.filter(t => {
      if (!t.due_date) return false;
      // Skip tasks already moved to a Completed column
      if (t.column_name === 'Completed') return false;
      const d = parseLocalDate(t.due_date);
      return d >= dayStart && d < dayEnd;
    });

    // Tasks completed this day — sitting in a Completed column with a due_date
    // on this day OR moved to Completed today (using updated_at as the proxy for "moved today").
    const tasksCompleted = allTasks.filter(t => {
      if (t.column_name !== 'Completed') return false;
      // Task was either due today OR moved to Completed today
      const updatedAt = new Date(t.updated_at);
      const movedToCompletedToday = updatedAt >= dayStart && updatedAt < dayEnd;
      const dueToday = t.due_date && (() => {
        const d = parseLocalDate(t.due_date);
        return d >= dayStart && d < dayEnd;
      })();
      // Include if it was due today and is now complete, OR if it was moved to Completed today
      // (covers "completed ahead of schedule" — task due later this week, finished early)
      if (dueToday) return true;
      if (movedToCompletedToday) return true;
      return false;
    });

    // Build merged timeline: timed items first, sorted by start time
    const timedItems = dayEvents.map(e => ({
      kind: 'event',
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      location: e.location,
      description: e.description,
      source: { feedId: e.feedId, feedName: e.feedName, feedColor: e.feedColor }
    }));

    // Tasks with a specific due time (due_date includes time)
    const timedTasks = tasksDue
      .filter(t => t.due_date && t.due_date.includes('T'))
      .map(t => ({
        kind: 'task',
        id: t.id,
        title: t.title,
        start: t.due_date,
        end: null,
        allDay: false,
        priority: t.priority,
        columnId: t.column_id,
        source: null
      }));

    const timeline = [...timedItems, ...timedTasks].sort(
      (a, b) => new Date(a.start) - new Date(b.start)
    );

    res.json({
      data: {
        date: dateStr,
        timeline,
        tasks_untimed: tasksDue
          .filter(t => !t.due_date || !t.due_date.includes('T'))
          .map(t => ({
            kind: 'task',
            id: t.id,
            title: t.title,
            priority: t.priority,
            columnId: t.column_id,
            completed: !!t.completed
          })),
        tasks_completed: tasksCompleted.map(t => ({
          kind: 'task',
          id: t.id,
          title: t.title,
          completed_at: t.updated_at
        })),
        events_count: dayEvents.length,
        fetch_errors: errors
      }
    });
  } catch (err) {
    console.error('[Today endpoint error]', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;
