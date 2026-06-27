import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

// ── AddToCalendarModal ───────────────────────────────────────────────────────
// Pushed from TaskModal's "Add to Calendar" button.
// Returns the created event so the parent can update its calendarEvents state.
//
// Props:
//   darkMode       — boolean
//   task           — { id, title, description, due_date }
//   onClose        — () => void
//   onAdded        — (event) => void

export default function AddToCalendarModal({ darkMode, task, onClose, onAdded }) {
  const [calendars, setCalendars] = useState([]);
  const [calendarId, setCalendarId] = useState('');
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [date, setDate] = useState(task?.due_date || new Date().toISOString().split('T')[0]);
  const [useTime, setUseTime] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Load user's calendars and pick primary by default
  useEffect(() => {
    api.listCalendars()
      .then(cals => {
        setCalendars(cals);
        const primary = cals.find(c => c.primary) || cals[0];
        if (primary) setCalendarId(primary.id);
      })
      .catch(err => setError(err.message));
  }, []);

  // Lock body scroll while modal is open
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, []);

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !date || !calendarId) return;

    setSubmitting(true);
    setError(null);
    try {
      const allDay = !useTime;
      const startDateTime = allDay
        ? `${date}T00:00:00`
        : `${date}T${startTime}:00`;
      const endDateTime = allDay
        ? `${date}T00:00:00`
        : `${date}T${endTime}:00`;

      const event = await api.createCalendarEvent(calendarId, {
        taskId: task.id,
        title: title.trim(),
        description: description.trim(),
        startDateTime,
        endDateTime,
        allDay
      });
      onAdded && onAdded({ ...event, calendarId });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Styles ──
  const overlay = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50';
  const panel   = darkMode ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-800';
  const border  = darkMode ? 'border-slate-700' : 'border-slate-200';
  const input   = darkMode
    ? 'bg-slate-900 border-slate-600 text-slate-100 placeholder-slate-500'
    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400';
  const muted   = darkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={overlay} onClick={onClose}>
      <div
        className={`${panel} rounded-xl shadow-2xl border ${border} w-full max-w-md`}
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className={`px-5 py-4 border-b ${border}`}>
            <h2 className="text-lg font-semibold">Add to Calendar</h2>
            <p className={`text-xs ${muted} mt-0.5`}>Create a Google Calendar event from this task.</p>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">

            {/* Calendar */}
            <div>
              <label className={`block text-xs font-medium mb-1 ${muted}`}>Calendar</label>
              {calendars.length === 0 ? (
                <p className={`text-xs ${muted}`}>Loading…</p>
              ) : (
                <select
                  value={calendarId}
                  onChange={e => setCalendarId(e.target.value)}
                  className={`w-full px-3 py-2 text-sm rounded-md border ${input} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                >
                  {calendars.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.primary ? '★ ' : ''}{c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Title */}
            <div>
              <label className={`block text-xs font-medium mb-1 ${muted}`}>Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                className={`w-full px-3 py-2 text-sm rounded-md border ${input} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
              />
            </div>

            {/* Date / Time */}
            <div>
              <label className={`block text-xs font-medium mb-1 ${muted}`}>When</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  className={`flex-1 px-3 py-2 text-sm rounded-md border ${input} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                />
                <label className={`flex items-center gap-1.5 text-xs ${muted} cursor-pointer`}>
                  <input
                    type="checkbox"
                    checked={useTime}
                    onChange={e => setUseTime(e.target.checked)}
                    className="rounded"
                  />
                  Timed
                </label>
              </div>
              {useTime && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className={`flex-1 px-3 py-2 text-sm rounded-md border ${input} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                  />
                  <span className={muted}>to</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className={`flex-1 px-3 py-2 text-sm rounded-md border ${input} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                  />
                </div>
              )}
              {!useTime && (
                <p className={`text-xs ${muted} mt-1`}>All-day event</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className={`block text-xs font-medium mb-1 ${muted}`}>Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className={`w-full px-3 py-2 text-sm rounded-md border ${input} focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none`}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-md p-2">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`px-5 py-3 border-t ${border} flex justify-end gap-2`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-sm rounded-md ${muted} hover:bg-slate-700/30 transition-colors`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !date || !calendarId}
              className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Adding…' : 'Add to Calendar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
