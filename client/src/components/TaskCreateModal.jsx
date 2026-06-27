import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api.js';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

function CategorySelect({ categories, value, onChange, darkMode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = categories.find(c => c.id === value);
  const dropdownBg = darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-300';
  const triggerClass = darkMode
    ? 'bg-slate-700 border-slate-600 text-slate-100'
    : 'bg-white border-slate-300 text-slate-800';
  const optionHover = darkMode ? 'hover:bg-slate-600' : 'hover:bg-slate-100';
  const optionText  = darkMode ? 'text-slate-200' : 'text-slate-800';
  const noneText    = darkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 flex items-center gap-2 ${triggerClass}`}
      >
        {selected ? (
          <>
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: selected.color }} />
            <span>{selected.name}</span>
          </>
        ) : (
          <span className={noneText}>None</span>
        )}
        <span className="ml-auto text-xs opacity-50">▾</span>
      </button>

      {open && (
        <div className={`absolute z-50 mt-1 w-full border rounded-lg shadow-lg overflow-hidden ${dropdownBg}`}>
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 ${optionHover} ${noneText}`}
          >
            None
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => { onChange(cat.id); setOpen(false); }}
              className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 ${optionHover} ${optionText}`}
            >
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: cat.color }} />
              {cat.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskCreateModal({ columns, categories, defaultColumnId, defaultAddToCalendar, onClose, onCreate, darkMode }) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate]         = useState('');
  const [priority, setPriority]       = useState('low');
  const [columnId, setColumnId]       = useState(defaultColumnId || columns?.[0]?.id || '');
  const [assignees, setAssignees]     = useState('');
  const [categoryId, setCategoryId]   = useState('');
  const [addToCalendar, setAddToCalendar] = useState(!!defaultAddToCalendar);
  const [calendarId, setCalendarId]   = useState('');
  const [calendars, setCalendars]     = useState([]);
  const [calAuthConnected, setCalAuthConnected] = useState(null);
  const [saving, setSaving]           = useState(false);

  // Check auth + load calendars once on mount, if user might want the checkbox
  useEffect(() => {
    api.googleAuthStatus()
      .then(s => {
        setCalAuthConnected(!!s.connected);
        if (s.connected) return api.listCalendars();
        return [];
      })
      .then(cals => {
        setCalendars(cals);
        const primary = cals.find(c => c.primary) || cals[0];
        if (primary) setCalendarId(primary.id);
      })
      .catch(() => setCalAuthConnected(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        columnId,
        title: title.trim(),
        description: description.trim() || null,
        dueDate: dueDate || null,
        priority,
        assignees: assignees.split(',').map(a => a.trim()).filter(Boolean),
        categoryId: categoryId || null,
        addToCalendar: addToCalendar && !!calendarId,
        calendarId: addToCalendar ? calendarId : null
      });
      onClose();
    } catch (err) {
      console.error('Failed to create task:', err);
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose();
  }

  const panelBg      = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const headerBorder = darkMode ? 'border-slate-700' : 'border-slate-200';
  const titleColor   = darkMode ? 'text-slate-200' : 'text-slate-800';
  const labelColor   = darkMode ? 'text-slate-400' : 'text-slate-500';
  const closeBtn     = darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600';
  const inputClass   = darkMode
    ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500 focus:border-indigo-500'
    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-indigo-500';
  const hintColor    = darkMode ? 'text-slate-500' : 'text-slate-400';
  const cancelBtn    = darkMode
    ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
    : 'bg-slate-100 hover:bg-slate-200 text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`absolute right-0 top-0 bottom-0 w-full max-w-md border-l shadow-2xl overflow-y-auto ${panelBg}`}>
        <div className={`flex items-center justify-between p-4 border-b ${headerBorder}`}>
          <h2 className={`text-sm font-semibold ${titleColor}`}>Create New Task</h2>
          <button onClick={onClose} className={`text-xl leading-none transition-colors ${closeBtn}`}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-5">
          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              autoFocus placeholder="Task title..."
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none ${inputClass}`} />
          </div>

          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={3} placeholder="Add a description..."
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none resize-none ${inputClass}`} />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none ${inputClass}`} />
            </div>
            <div className="flex-1">
              <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none ${inputClass}`}>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Column</label>
            <select value={columnId} onChange={e => setColumnId(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none ${inputClass}`}>
              {columns.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
            </select>
          </div>

          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Category</label>
            <CategorySelect
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              darkMode={darkMode}
            />
          </div>

          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Assignees</label>
            <input type="text" value={assignees} onChange={e => setAssignees(e.target.value)}
              placeholder="Patrick, Chantelle (comma-separated)"
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none ${inputClass}`} />
            <p className={`text-xs mt-1 ${hintColor}`}>Separate names with commas</p>
          </div>

          {/* Add to Calendar */}
          {calAuthConnected === true && (
            <div className={`rounded-lg border px-3 py-2.5 ${darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-slate-50'}`}>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addToCalendar}
                  onChange={e => setAddToCalendar(e.target.checked)}
                  className="mt-0.5 rounded"
                />
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    📅 Add to Calendar
                  </span>
                  {addToCalendar && calendars.length > 0 && (
                    <select
                      value={calendarId}
                      onChange={e => setCalendarId(e.target.value)}
                      className={`mt-1.5 w-full border rounded px-2 py-1 text-xs focus:outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-700'}`}
                    >
                      {calendars.map(c => (
                        <option key={c.id} value={c.id}>{c.primary ? '★ ' : ''}{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className={`flex-1 text-sm font-medium py-2.5 rounded-lg transition-colors ${cancelBtn}`}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !title.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
              {saving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
