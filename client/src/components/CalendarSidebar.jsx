import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfWeek(date) {
  const d = new Date(date);
  // ISO 8601 week starts on Monday. getDay(): 0=Sun, 1=Mon, ..., 6=Sat.
  // We want Monday=0, so subtract (day === 0 ? 6 : day - 1) days.
  const day = d.getDay();
  const offset = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isoWeekKey(date) {
  return startOfWeek(date).toISOString().split('T')[0];
}

function formatTime(dateStr, allDay) {
  if (allDay) return 'All day';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatTimeRange(start, end, allDay) {
  if (allDay) return 'All day';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const sf = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!e) return sf;
  const ef = e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${sf} – ${ef}`;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatWeekRange(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const sm = MONTH_NAMES[weekStart.getMonth()];
  const em = MONTH_NAMES[weekEnd.getMonth()];
  const sy = weekStart.getFullYear();
  const ey = weekEnd.getFullYear();
  if (sy !== ey) return `${sm} ${weekStart.getDate()}, ${sy} – ${em} ${weekEnd.getDate()}, ${ey}`;
  if (sm !== em) return `${sm} ${weekStart.getDate()} – ${em} ${weekEnd.getDate()}, ${sy}`;
  return `${sm} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${sy}`;
}

// ── Skeleton shimmer ─────────────────────────────────────────────────────────

function Skeleton({ darkMode }) {
  const base = darkMode ? 'bg-slate-700' : 'bg-slate-200';
  return (
    <div className="animate-pulse p-3 space-y-4">
      {[0,1,2].map(i => (
        <div key={i}>
          <div className={`h-3 w-24 rounded mb-2 ${base}`} />
          <div className={`h-8 w-full rounded mb-1 ${base}`} />
          <div className={`h-8 w-4/5 rounded ${base}`} />
        </div>
      ))}
    </div>
  );
}

// ── Connect prompt ───────────────────────────────────────────────────────────

function ConnectPrompt({ darkMode, onConnect }) {
  const textMuted = darkMode ? 'text-slate-400' : 'text-slate-500';
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center gap-4">
      <div className="text-4xl">📅</div>
      <p className={`text-sm ${textMuted}`}>
        Connect Google Calendar to see your events alongside your tasks.
      </p>
      <button
        onClick={onConnect}
        className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
      >
        Connect Google Calendar
      </button>
    </div>
  );
}

// ── Event chip ───────────────────────────────────────────────────────────────

function EventChip({ event, darkMode }) {
  const [tooltip, setTooltip] = useState(false);
  const chipBg  = darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-100 hover:bg-slate-200';
  const chipTxt = darkMode ? 'text-slate-200' : 'text-slate-700';
  const timeTxt = darkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div
      className={`relative flex items-start gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${chipBg}`}
      onMouseEnter={() => setTooltip(true)}
      onMouseLeave={() => setTooltip(false)}
    >
      {/* Source calendar color bar */}
      <div
        className="mt-0.5 w-1 rounded-full flex-shrink-0"
        style={{ backgroundColor: event.calendarColor || '#6366f1', minHeight: 14, alignSelf: 'stretch' }}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-medium truncate ${chipTxt}`} title={event.title}>
          {event.title}
        </p>
        <p className={`text-xs ${timeTxt}`}>
          {formatTimeRange(event.start, event.end, event.allDay)}
        </p>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className={`absolute left-0 top-full mt-1 z-50 w-64 rounded-lg shadow-xl border p-3 text-xs ${
          darkMode ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
        }`}>
          <p className="font-semibold mb-1">{event.title}</p>
          <p className={`mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {formatTimeRange(event.start, event.end, event.allDay)}
          </p>
          {event.calendarName && (
            <p className={`mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              📅 {event.calendarName}
            </p>
          )}
          {event.description && (
            <p className={`mb-2 line-clamp-3 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              {event.description}
            </p>
          )}
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:underline"
              onClick={e => e.stopPropagation()}
            >
              Open in Google Calendar ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Day section ──────────────────────────────────────────────────────────────

function DaySection({ date, events, isToday, darkMode }) {
  const headerBase = darkMode ? 'text-slate-400' : 'text-slate-500';
  const todayHeader = darkMode ? 'text-indigo-300' : 'text-indigo-600';
  const todayBorder = darkMode ? 'border-l-2 border-indigo-500' : 'border-l-2 border-indigo-400';
  const emptyTxt = darkMode ? 'text-slate-600' : 'text-slate-300';

  const dayName = DAY_NAMES[date.getDay()];
  const dayNum = date.getDate();

  return (
    <div className={`mb-3 ${isToday ? todayBorder + ' pl-2' : 'pl-0'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isToday ? todayHeader : headerBase}`}>
        {isToday ? `Today · ` : ''}{dayName} {dayNum}
      </p>
      {events.length === 0 ? (
        <p className={`text-xs italic ${emptyTxt}`}>No events</p>
      ) : (
        <div className="space-y-1">
          {events.map(ev => (
            <EventChip key={ev.id} event={ev} darkMode={darkMode} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main sidebar ─────────────────────────────────────────────────────────────

const CACHE = {};

export default function CalendarSidebar({ open, onToggle, darkMode }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(null); // null=unknown, true, false
  const [credsMissing, setCredsMissing] = useState(false);
  const pollRef = useRef(null);

  const weekKey = isoWeekKey(weekStart);
  const weekEnd = addDays(weekStart, 7);

  // ── Fetch auth status ──
  const checkAuth = useCallback(async () => {
    try {
      const status = await api.googleAuthStatus();
      setCredsMissing(!status.credentialsFile);
      setConnected(!!status.connected);
      return !!status.connected;
    } catch {
      setConnected(false);
      return false;
    }
  }, []);

  // ── Fetch events for current week ──
  const fetchEvents = useCallback(async (wStart, wEnd, force = false) => {
    const key = isoWeekKey(wStart);
    if (!force && CACHE[key]) {
      setEvents(CACHE[key]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.listAllEvents({
        timeMin: wStart.toISOString(),
        timeMax: wEnd.toISOString(),
        maxResults: 100
      });
      CACHE[key] = data;
      setEvents(data);
    } catch (err) {
      if (err.message?.includes('NOT_AUTHORIZED') || err.message?.includes('401')) {
        setConnected(false);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ── On open: check auth, then load events ──
  useEffect(() => {
    if (!open) return;
    checkAuth().then(isConnected => {
      if (isConnected) fetchEvents(weekStart, weekEnd);
    });
  }, [open]); // eslint-disable-line

  // ── Reload when week changes (and we're connected) ──
  useEffect(() => {
    if (!open || connected !== true) return;
    fetchEvents(weekStart, weekEnd);
  }, [weekKey]); // eslint-disable-line

  // ── Handle postMessage from OAuth callback tab ──
  useEffect(() => {
    function onMessage(e) {
      if (e.data === 'virta:google-auth-success') {
        setConnected(true);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        // Small delay then load events
        setTimeout(() => fetchEvents(weekStart, weekEnd, true), 500);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [weekStart, weekEnd, fetchEvents]);

  // ── OAuth connect ──
  const handleConnect = useCallback(() => {
    const popup = window.open(api.googleConnectUrl(), '_blank', 'width=520,height=640');
    // Poll auth/status as a fallback (in case postMessage fails)
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const isConnected = await checkAuth();
      if (isConnected) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        fetchEvents(weekStart, weekEnd, true);
      }
    }, 3000);
    // Stop polling after 5 min regardless
    setTimeout(() => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }, 300000);
  }, [checkAuth, fetchEvents, weekStart, weekEnd]);

  // ── Cleanup poll on unmount ──
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Navigation ──
  const goNext = () => setWeekStart(w => addDays(w, 7));
  const goPrev = () => setWeekStart(w => addDays(w, -7));
  const goToday = () => setWeekStart(startOfWeek(new Date()));
  const isCurrentWeek = isoWeekKey(weekStart) === isoWeekKey(new Date());

  // ── Build 7-day structure, today pinned to top ──
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayIndex = days.findIndex(d => isSameDay(d, today));
  const sortedDays = todayIndex > 0
    ? [days[todayIndex], ...days.slice(0, todayIndex), ...days.slice(todayIndex + 1)]
    : days;

  function eventsForDay(day) {
    return events.filter(ev => {
      const d = new Date(ev.start);
      return isSameDay(d, day);
    });
  }

  // ── Styles ──
  const bg      = darkMode ? 'bg-slate-900' : 'bg-white';
  const border  = darkMode ? 'border-slate-700' : 'border-slate-200';
  const text    = darkMode ? 'text-slate-200' : 'text-slate-700';
  const muted   = darkMode ? 'text-slate-400' : 'text-slate-500';
  const btnHov  = darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100';

  // ── Collapsed tab ──
  if (!open) {
    return (
      <div className={`flex-shrink-0 flex flex-col items-center border-l ${border} ${bg} w-9`}>
        <button
          onClick={onToggle}
          title="Open calendar"
          className={`mt-3 p-1.5 rounded-md ${muted} ${btnHov} transition-colors`}
        >
          📅
        </button>
      </div>
    );
  }

  return (
    <div className={`flex-shrink-0 flex flex-col border-l ${border} ${bg} w-80`} style={{ height: '100%' }}>

      {/* ── Header ── */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${border} flex-shrink-0`}>
        <div className="flex items-center gap-1">
          <button onClick={goPrev} className={`p-1 rounded ${muted} ${btnHov}`} title="Previous week">◀</button>
          <button onClick={goNext} className={`p-1 rounded ${muted} ${btnHov}`} title="Next week">▶</button>
          {!isCurrentWeek && (
            <button onClick={goToday} className={`ml-1 px-2 py-0.5 rounded text-xs ${muted} ${btnHov}`}>Today</button>
          )}
        </div>
        <span className={`text-xs font-medium ${muted} truncate mx-2`}>{formatWeekRange(weekStart)}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { if (connected) fetchEvents(weekStart, weekEnd, true); }}
            title="Refresh"
            className={`p-1 rounded text-xs ${muted} ${btnHov}`}
          >↻</button>
          <button onClick={onToggle} className={`p-1 rounded ${muted} ${btnHov}`} title="Close calendar">✕</button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {connected === null && <Skeleton darkMode={darkMode} />}

        {connected === false && !credsMissing && (
          <ConnectPrompt darkMode={darkMode} onConnect={handleConnect} />
        )}

        {connected === false && credsMissing && (
          <div className={`text-xs ${muted} p-4 text-center`}>
            <p className="font-semibold mb-1">google-credentials.json missing</p>
            <p>Place your OAuth credentials file in the project root to enable calendar integration.</p>
          </div>
        )}

        {connected === true && loading && <Skeleton darkMode={darkMode} />}

        {connected === true && !loading && error && (
          <div className={`text-xs text-red-400 p-4 text-center`}>
            <p className="font-semibold mb-1">Failed to load events</p>
            <p>{error}</p>
            <button onClick={() => fetchEvents(weekStart, weekEnd, true)} className="mt-2 text-indigo-400 hover:underline">
              Retry
            </button>
          </div>
        )}

        {connected === true && !loading && !error && (
          <div>
            {sortedDays.map(day => (
              <DaySection
                key={day.toDateString()}
                date={day}
                events={eventsForDay(day)}
                isToday={isSameDay(day, today)}
                darkMode={darkMode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
