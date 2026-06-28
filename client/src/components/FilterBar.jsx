import { useState, useEffect } from 'react';

const DUE_OPTIONS = [
  { value: 'none',   label: 'Any time' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today',  label: 'Due today' },
  { value: 'week',   label: 'Due this week' },
  { value: 'month',  label: 'Due this month' }
];

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];
const PRIORITY_LABELS  = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
const STORAGE_KEY = 'task-filters';

function loadFilters() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    // Backfill the new hideCompleted default for users who haven't seen it yet.
    // Most users want this on, so default true unless they've explicitly set it.
    if (stored.hideCompleted === undefined) stored.hideCompleted = true;
    return stored;
  } catch {
    return { hideCompleted: true };
  }
}
function saveFilters(filters) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
}

export default function FilterBar({ categories, filters, onChange, darkMode }) {
  const [localFilters, setLocalFilters] = useState(() => loadFilters());

  useEffect(() => {
    saveFilters(localFilters);
    onChange(localFilters);
  }, [localFilters]);

  function setFilter(key, value) {
    setLocalFilters(prev => ({ ...prev, [key]: value }));
  }
  function clearAll() { setLocalFilters({}); }

  const activeCount = [
    localFilters.dueDate && localFilters.dueDate !== 'none',
    localFilters.priorities?.length,
    localFilters.categories?.length
  ].filter(Boolean).length;

  function togglePriority(p) {
    const current = localFilters.priorities || [];
    setFilter('priorities', current.includes(p) ? current.filter(x => x !== p) : [...current, p]);
  }
  function toggleCategory(catId) {
    const current = localFilters.categories || [];
    setFilter('categories', current.includes(catId) ? current.filter(x => x !== catId) : [...current, catId]);
  }

  const barBg       = darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200';
  const labelColor  = darkMode ? 'text-slate-400' : 'text-slate-500';
  const filterBase  = darkMode ? 'bg-slate-700 text-slate-400 hover:text-slate-200' : 'bg-slate-100 text-slate-500 hover:text-slate-700';
  const filterActive = 'bg-indigo-600 text-white';
  const clearColor  = darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600';
  const catDotBorder = darkMode ? 'border-slate-600' : 'border-slate-300';

  return (
    <div className={`px-4 py-3 border-b space-y-3 ${barBg}`}>
      {/* Due date */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-medium ${labelColor}`}>Due:</span>
        {DUE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter('dueDate', opt.value === 'none' ? undefined : opt.value)}
            className={`px-2 py-1 text-xs rounded-full transition-colors ${(localFilters.dueDate || 'none') === opt.value ? filterActive : filterBase}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Priority */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-medium ${labelColor}`}>Priority:</span>
        {PRIORITY_OPTIONS.map(p => (
          <button
            key={p}
            onClick={() => togglePriority(p)}
            className={`px-2 py-1 text-xs rounded-full transition-colors ${localFilters.priorities?.includes(p) ? filterActive : filterBase}`}
          >
            {PRIORITY_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Category */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium ${labelColor}`}>Category:</span>
          <button
            onClick={() => setFilter('categories', undefined)}
            className={`px-2 py-1 text-xs rounded-full transition-colors ${!localFilters.categories?.length ? filterActive : filterBase}`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              className={`px-2 py-1 text-xs rounded-full transition-colors flex items-center gap-1 ${localFilters.categories?.includes(cat.id) ? filterActive : filterBase}`}
            >
              <span className={`w-2 h-2 rounded-full ${catDotBorder}`} style={{ backgroundColor: cat.color }} />
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Display */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-medium ${labelColor}`}>Display:</span>
        <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${filterBase} px-2 py-1 rounded-full transition-colors`}>
          <input
            type="checkbox"
            checked={localFilters.hideCompleted !== false}
            onChange={e => setFilter('hideCompleted', e.target.checked)}
            className="rounded"
          />
          Hide completed older than 30 days
        </label>
      </div>

      {activeCount > 0 && (
        <button onClick={clearAll} className={`text-xs underline ${clearColor}`}>
          Clear all filters
        </button>
      )}
    </div>
  );
}

export function applyFilters(tasks, filters) {
  if (!filters || Object.keys(filters).length === 0) return tasks;
  return tasks.filter(task => {
    // hideCompleted: when true (the default), hide tasks in the Completed column
    // whose updated_at is older than 30 days. Other columns aren't affected by
    // "completed" status (they're typically movable states, not done).
    if (filters.hideCompleted !== false && task.column_name === 'Completed' && task.updated_at) {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const updated = new Date(task.updated_at).getTime();
      if (!isNaN(updated) && updated < cutoff) return false;
    }
    if (filters.dueDate && filters.dueDate !== 'none') {
      const now   = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const taskDate = task.due_date ? new Date(task.due_date) : null;
      if (filters.dueDate === 'overdue') {
        if (!taskDate || taskDate >= today) return false;
      } else if (filters.dueDate === 'today') {
        if (!taskDate || taskDate.toDateString() !== today.toDateString()) return false;
      } else if (filters.dueDate === 'week') {
        const w = new Date(today); w.setDate(w.getDate() + 7);
        if (!taskDate || taskDate < today || taskDate > w) return false;
      } else if (filters.dueDate === 'month') {
        const m = new Date(today); m.setDate(m.getDate() + 30);
        if (!taskDate || taskDate < today || taskDate > m) return false;
      }
    }
    if (filters.priorities?.length && !filters.priorities.includes(task.priority)) return false;
    if (filters.categories?.length && !filters.categories.includes(task.category_id)) return false;
    return true;
  });
}

export { loadFilters };