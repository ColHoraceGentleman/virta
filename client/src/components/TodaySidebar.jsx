import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '../lib/api.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtTimeRange(startIso, endIso) {
  if (!endIso) return fmtTime(startIso);
  return `${fmtTime(startIso)} – ${fmtTime(endIso)}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtHeader(date) {
  if (sameDay(date, new Date())) return `Today · ${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
  if (sameDay(date, addDays(new Date(), 1))) return `Tomorrow · ${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
  if (sameDay(date, addDays(new Date(), -1))) return `Yesterday · ${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
  return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

function dateKey(d) {
  return startOfDay(d).toISOString().split('T')[0];
}

// ── Row components ───────────────────────────────────────────────────────────

function Row({ item, status, darkMode, onClick }) {
  // status: 'past' | 'active' | 'future' | 'completed'
  const baseBg  = darkMode ? 'hover:bg-slate-700/40' : 'hover:bg-slate-100';
  const pastBg  = '';
  const activeBg = darkMode ? 'bg-indigo-900/20' : 'bg-indigo-50';
  const activeBorder = darkMode ? 'border-l-indigo-500' : 'border-l-indigo-400';

  const textColor = darkMode ? 'text-slate-200' : 'text-slate-700';
  const pastColor = darkMode ? 'text-slate-600' : 'text-slate-400';
  const timeColor = darkMode ? 'text-slate-500' : 'text-slate-400';

  const completedColor = darkMode ? 'text-emerald-500' : 'text-emerald-600';

  const timeLabel = item.kind === 'task'
    ? (item.start ? fmtTime(item.start) : '')
    : (item.allDay ? 'All day' : fmtTimeRange(item.start, item.end));

  const completedTimeLabel = status === 'completed'
    ? (item.kind === 'task' ? '✓' : '✓')
    : timeLabel;

  const barColor = status === 'completed'
    ? '#16a34a'
    : (item.source?.feedColor || (item.kind === 'task' ? '#6366f1' : '#6366f1'));

  const isPast = status === 'past';
  const isCompleted = status === 'completed';
  const isActive = status === 'active';

  return (
    <div
      data-row-id={item.id}
      data-row-status={status}
      onClick={onClick}
      className={[
        'flex items-center gap-2 px-3 py-2 border-l-2 border-transparent cursor-pointer transition-colors',
        baseBg,
        isPast ? pastBg : '',
        isActive ? activeBg + ' ' + activeBorder : '',
      ].join(' ')}
      style={{
        opacity: isPast ? 0.4 : isCompleted ? 0.5 : 1,
      }}
    >
      <div
        className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{ backgroundColor: barColor, minHeight: 18 }}
      />
      <div className={`text-[11px] w-12 flex-shrink-0 font-variant-numeric ${isCompleted ? completedColor : timeColor}`}>
        {completedTimeLabel}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] truncate ${
          isCompleted
            ? completedColor
            : isPast
              ? `${pastColor} line-through`
              : textColor
        }`}>
          {item.title}
        </p>
        {item.source?.feedName && (
          <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {item.source.feedName}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children, darkMode }) {
  return (
    <p className={`px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.16em] font-semibold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
      {children}
    </p>
  );
}

// ── Main sidebar ─────────────────────────────────────────────────────────────

export default function TodaySidebar({ open, onToggle, darkMode, onTaskClick }) {
  const [viewDate, setViewDate] = useState(() => startOfDay(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(new Date());
  const bodyRef = useRef(null);
  const lastScrollTopRef = useRef(null);

  const isToday = sameDay(viewDate, new Date());

  // ── Tick 'now' every minute ──
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // ── Fetch today's data ──
  const load = useCallback(async (date) => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.getTodayData(dateKey(date));
      setData(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load(viewDate);
  }, [open, viewDate, load]);

  // ── Auto-scroll to "now" when on today's view and data loads ──
  useEffect(() => {
    if (!open || !data || !bodyRef.current || !isToday) return;

    // Small delay to let layout settle
    const t = setTimeout(() => {
      const rows = bodyRef.current.querySelectorAll('[data-row-status]');
      let scrollTarget = null;

      // Find the first non-past row (active row) — scroll so it's just above viewport center
      for (const row of rows) {
        const status = row.getAttribute('data-row-status');
        if (status === 'active') {
          scrollTarget = row;
          break;
        }
      }

      // If no active row, find the first upcoming (future) row
      if (!scrollTarget) {
        for (const row of rows) {
          const status = row.getAttribute('data-row-status');
          if (status === 'future') {
            scrollTarget = row;
            break;
          }
        }
      }

      // If all rows are past, scroll to bottom (nothing upcoming)
      if (!scrollTarget) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        return;
      }

      const rect = scrollTarget.getBoundingClientRect();
      const containerRect = bodyRef.current.getBoundingClientRect();
      const offset = rect.top - containerRect.top - 16; // 16px padding from top
      bodyRef.current.scrollTop = Math.max(0, bodyRef.current.scrollTop + offset);
      lastScrollTopRef.current = bodyRef.current.scrollTop;
    }, 50);

    return () => clearTimeout(t);
  }, [data, open, isToday]);

  // ── Compute status for each timeline item ──
  const decoratedTimeline = useMemo(() => {
    if (!data) return [];
    const isViewingToday = sameDay(viewDate, now);
    return data.timeline.map(item => {
      const start = new Date(item.start);
      const end = item.end ? new Date(item.end) : null;
      let status;

      if (isViewingToday) {
        if (end && end <= now) status = 'past';
        else if (start <= now && (!end || end > now)) status = 'active';
        else status = 'future';
      } else {
        // For non-today views, no gray — everything is "future" (or "today" if today)
        status = 'future';
      }

      return { ...item, _status: status };
    });
  }, [data, viewDate, now]);

  // ── Determine row "status" combining timeline position + completion ──
  function getRowStatus(item) {
    if (item._completed) return 'completed';
    return item._status;
  }

  // ── Find the index of the most recent past + active row (for scroll logic) ──
  const firstFutureIndex = useMemo(() => {
    return decoratedTimeline.findIndex(i => i._status === 'future');
  }, [decoratedTimeline]);

  // ── Counts for the badge ──
  const upcomingCount = decoratedTimeline.filter(i => i._status === 'future').length;
  const untimedCount = data?.tasks_untimed?.filter(t => !t.completed).length || 0;
  const badgeCount = upcomingCount + untimedCount;

  // ── Navigation ──
  const goNext = () => setViewDate(d => addDays(d, 1));
  const goPrev = () => setViewDate(d => addDays(d, -1));
  const goToday = () => setViewDate(startOfDay(new Date()));

  // ── Styles ──
  const bg      = darkMode ? 'bg-slate-900' : 'bg-white';
  const border  = darkMode ? 'border-slate-700' : 'border-slate-200';
  const muted   = darkMode ? 'text-slate-400' : 'text-slate-500';
  const btnHov  = darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100';

  // ── Collapsed state ──
  if (!open) {
    return (
      <div className={`flex-shrink-0 flex flex-col items-center border-l ${border} ${bg} w-9`}>
        <button
          onClick={onToggle}
          title="Open Today"
          className={`mt-3 p-1.5 rounded-md relative ${muted} ${btnHov} transition-colors`}
        >
          📅
          {badgeCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
              {badgeCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  // ── Expanded state ──
  return (
    <div className={`flex-shrink-0 flex flex-col border-l ${border} ${bg} w-80`} style={{ height: '100%' }}>

      {/* Header */}
      <div className={`flex items-center justify-between px-2 py-2 border-b ${border} flex-shrink-0`}>
        <div className="flex items-center gap-0.5">
          <button onClick={goPrev} className={`p-1 rounded ${muted} ${btnHov} text-sm`} title="Previous day">◀</button>
          <button onClick={goNext} className={`p-1 rounded ${muted} ${btnHov} text-sm`} title="Next day">▶</button>
          {!isToday && (
            <button onClick={goToday} className={`ml-1 px-2 py-0.5 rounded text-xs ${muted} ${btnHov}`}>Today</button>
          )}
        </div>
        <span className={`text-[11px] font-medium ${muted} truncate mx-2`}>{fmtHeader(viewDate)}</span>
        <button onClick={onToggle} className={`p-1 rounded ${muted} ${btnHov} text-sm`} title="Minimize">✕</button>
      </div>

      {/* Body — scrolls, auto-positions to "now" when today */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto py-1">
        {loading && !data && (
          <p className={`px-3 py-4 text-xs ${muted} text-center`}>Loading…</p>
        )}

        {error && (
          <div className="m-3 p-2 rounded border border-red-400/30 bg-red-400/10 text-xs text-red-400">
            <p className="font-semibold mb-1">Couldn't load</p>
            <p>{error}</p>
            <button onClick={() => load(viewDate)} className="mt-2 text-indigo-400 hover:underline">
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Timeline — timed events + timed tasks */}
            {decoratedTimeline.length === 0 && data.tasks_untimed.length === 0 && (
              <p className={`px-3 py-8 text-xs ${muted} text-center italic`}>
                Nothing scheduled for this day.
              </p>
            )}

            {/* Render "Now" marker line between past and future */}
            {decoratedTimeline.map((item, idx) => {
              const prev = idx > 0 ? decoratedTimeline[idx - 1] : null;
              const showMarker = isToday && prev && prev._status !== 'future' && item._status === 'future';
              return (
                <div key={item.id}>
                  {showMarker && (
                    <div className="px-3 py-1.5">
                      <div className="h-px bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
                      <p className="text-[9px] text-indigo-400 text-right uppercase tracking-wider mt-0.5">upcoming</p>
                    </div>
                  )}
                  <Row
                    item={item}
                    status={getRowStatus(item)}
                    darkMode={darkMode}
                    onClick={item.kind === 'task' ? () => onTaskClick?.(item.id) : undefined}
                  />
                </div>
              );
            })}

            {/* Tasks Due Today (untimed) */}
            {data.tasks_untimed.length > 0 && (
              <>
                <SectionLabel darkMode={darkMode}>Tasks Due Today</SectionLabel>
                {data.tasks_untimed.map(task => (
                  <Row
                    key={task.id}
                    item={{
                      kind: 'task',
                      id: `untimed-${task.id}`,
                      title: task.title,
                      source: null
                    }}
                    status={task.completed ? 'completed' : 'future'}
                    darkMode={darkMode}
                    onClick={() => onTaskClick?.(task.id)}
                  />
                ))}
              </>
            )}

            {/* Completed today */}
            {data.tasks_completed.length > 0 && (
              <>
                <SectionLabel darkMode={darkMode}>Completed</SectionLabel>
                {data.tasks_completed.map(task => (
                  <Row
                    key={task.id}
                    item={{
                      kind: 'task',
                      id: `done-${task.id}`,
                      title: task.title,
                      source: null
                    }}
                    status="completed"
                    darkMode={darkMode}
                    onClick={() => onTaskClick?.(task.id)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
