import { useState } from 'react';

const PRIORITY_COLORS_DARK = {
  low: 'bg-slate-600 text-slate-300',
  medium: 'bg-blue-600 text-blue-100',
  high: 'bg-amber-600 text-amber-100',
  urgent: 'bg-red-600 text-red-100'
};
const PRIORITY_COLORS_LIGHT = {
  low: 'bg-slate-200 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700'
};

const PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent'
};

const STATUS_COLORS = {
  low: 'bg-slate-600',
  medium: 'bg-blue-600',
  high: 'bg-amber-600',
  urgent: 'bg-red-600'
};

export default function TaskList({ project, onTaskClick, onStatusChange, filteredTasks, darkMode }) {
  const [sortField, setSortField] = useState('position');
  const [sortDir, setSortDir] = useState('asc');

  if (!project) return null;

  const columns = project.columns || [];
  const allTasks = (filteredTasks !== undefined ? filteredTasks : columns.flatMap(col =>
    (col.tasks || []).map(t => ({ ...t, columnName: col.name, columnId: col.id }))
  ));

  const sortedTasks = [...allTasks].sort((a, b) => {
    let aVal, bVal;
    switch (sortField) {
      case 'title':
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
        break;
      case 'priority':
        const order = { low: 0, medium: 1, high: 2, urgent: 3 };
        aVal = order[a.priority] ?? 1;
        bVal = order[b.priority] ?? 1;
        break;
      case 'due_date':
        aVal = a.due_date || '9999';
        bVal = b.due_date || '9999';
        break;
      case 'column':
        aVal = a.columnName;
        bVal = b.columnName;
        break;
      default:
        aVal = a.position;
        bVal = b.position;
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const PRIORITY_COLORS = darkMode ? PRIORITY_COLORS_DARK : PRIORITY_COLORS_LIGHT;
  const headerBorder  = darkMode ? 'border-slate-700' : 'border-slate-200';
  const thColor       = darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700';
  const sortActiveColor = 'text-indigo-400';
  const rowBorder     = darkMode ? 'border-slate-800' : 'border-slate-100';
  const rowHover      = darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50';
  const posColor      = darkMode ? 'text-slate-600' : 'text-slate-400';
  const titleColor    = darkMode ? 'text-slate-100' : 'text-slate-800';
  const statusColor   = darkMode ? 'text-slate-400' : 'text-slate-500';
  const emptyColor    = darkMode ? 'text-slate-500' : 'text-slate-400';
  const dashColor     = darkMode ? 'text-slate-600' : 'text-slate-300';

  function SortIcon({ field }) {
    if (sortField !== field) return <span className={`${darkMode ? 'text-slate-600' : 'text-slate-300'} ml-1`}>⇅</span>;
    return <span className={`${sortActiveColor} ml-1`}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={`border-b ${headerBorder} text-left`}>
            <th className="pb-2 pr-4 font-medium">
              <button onClick={() => toggleSort('position')} className={`${thColor} flex items-center`}>
                # <SortIcon field="position" />
              </button>
            </th>
            <th className="pb-2 pr-4 font-medium">
              <button onClick={() => toggleSort('title')} className={`${thColor} flex items-center`}>
                Title <SortIcon field="title" />
              </button>
            </th>
            <th className="pb-2 pr-4 font-medium">
              <button onClick={() => toggleSort('column')} className={`${thColor} flex items-center`}>
                Status <SortIcon field="column" />
              </button>
            </th>
            <th className="pb-2 pr-4 font-medium">
              <button onClick={() => toggleSort('priority')} className={`${thColor} flex items-center`}>
                Priority <SortIcon field="priority" />
              </button>
            </th>
            <th className="pb-2 font-medium">
              <button onClick={() => toggleSort('due_date')} className={`${thColor} flex items-center`}>
                Due <SortIcon field="due_date" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map(task => {
            const isOverdue = task.due_date && new Date(task.due_date) < new Date();
            const isDueToday = task.due_date && new Date(task.due_date).toDateString() === new Date().toDateString();

            return (
              <tr
                key={task.id}
                onClick={() => onTaskClick(task)}
                className={`border-b ${rowBorder} ${rowHover} cursor-pointer transition-colors`}
              >
                <td className={`py-2 pr-4 text-xs w-8 ${posColor}`}>
                  {Math.round(task.position)}
                </td>
                <td className={`py-2 pr-4 font-medium max-w-xs truncate ${titleColor}`}>
                  {task.title}
                </td>
                <td className="py-2 pr-4">
                  <span className={`text-xs ${statusColor}`}>{task.columnName}</span>
                </td>
                <td className="py-2 pr-4">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>
                    {PRIORITY_LABELS[task.priority]}
                  </span>
                </td>
                <td className="py-2 text-xs">
                  {task.due_date ? (
                    <span className={isOverdue ? 'text-red-500' : isDueToday ? 'text-amber-500' : statusColor}>
                      {isOverdue ? '⚠ ' : ''}{new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  ) : (
                    <span className={dashColor}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {sortedTasks.length === 0 && (
            <tr>
              <td colSpan="5" className={`py-8 text-center text-sm ${emptyColor}`}>
                No tasks yet. Add one with the + button or ⌘K.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}