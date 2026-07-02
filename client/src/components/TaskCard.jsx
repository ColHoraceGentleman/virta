import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DEFAULT_CARD_DARK, DEFAULT_CARD_LIGHT } from '../lib/colors.js';

// On colored category cards
const PRIORITY_COLORS_ON_COLOR = {
  low:    'bg-transparent border border-black/60 text-black/60',
  medium: 'bg-transparent border border-black/60 text-black/60',
  high:   'border text-yellow-900',
  urgent: 'bg-red-600/90 border border-white text-white',
};

// On default dark cards
const PRIORITY_COLORS_DEFAULT_DARK = {
  low:    'bg-transparent border border-slate-400 text-slate-400',
  medium: 'bg-transparent border border-slate-400 text-slate-400',
  high:   'border text-yellow-900',
  urgent: 'bg-red-600 border border-white text-white',
};

// On default light cards
const PRIORITY_COLORS_DEFAULT_LIGHT = {
  low:    'bg-transparent border border-slate-700 text-slate-700',
  medium: 'bg-transparent border border-slate-700 text-slate-700',
  high:   'border text-yellow-900',
  urgent: 'bg-red-600 border border-white text-white',
};

// Inline style override for High priority (#FFFF00)
const HIGH_PILL_STYLE = { backgroundColor: '#FFFF00', borderColor: '#856900' };

const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

function getInitials(name) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

export default function TaskCard({ task, onClick, isDragging, categories, darkMode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({ id: task.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  // Parse date-only strings (YYYY-MM-DD) as local midnight, NOT UTC midnight.
  // new Date('2026-06-27') is 2026-06-27T00:00:00Z which in Denver is 6pm
  // the previous day — wrong for a "due date" semantically.
  function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return new Date(dateStr);
  }
  const isOverdue  = task.due_date && parseLocalDate(task.due_date) < new Date() && task.due_date.split('T')[0] !== new Date().toISOString().split('T')[0];
  const isDueToday = task.due_date && parseLocalDate(task.due_date).toDateString() === new Date().toDateString();
  const formattedDate = task.due_date
    ? parseLocalDate(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const category = categories?.find(c => c.id === task.category_id);
  const hasCategory = !!category;

  // Card background
  const cardBg = hasCategory
    ? category.color
    : darkMode ? DEFAULT_CARD_DARK : DEFAULT_CARD_LIGHT;

  // Text colors — always dark on category cards; mode-aware on default cards
  const titleColor   = hasCategory ? 'text-gray-800'   : darkMode ? 'text-slate-100'  : 'text-slate-800';
  const bodyColor    = hasCategory ? 'text-gray-600'   : darkMode ? 'text-slate-400'  : 'text-slate-500';
  const dateColor    = isOverdue   ? 'text-red-600 font-semibold'
                     : isDueToday  ? 'text-amber-600'
                     : hasCategory ? 'text-gray-500'
                     : darkMode    ? 'text-slate-400'
                     :               'text-slate-500';
  const borderColor  = hasCategory ? 'border-black/10' : darkMode ? 'border-slate-700' : 'border-slate-200';
  const shadowHover  = hasCategory ? 'hover:shadow-black/20' : darkMode ? 'hover:shadow-black/30' : 'hover:shadow-slate-300/50';
  const priorityColors = hasCategory
    ? PRIORITY_COLORS_ON_COLOR
    : darkMode ? PRIORITY_COLORS_DEFAULT_DARK : PRIORITY_COLORS_DEFAULT_LIGHT;

  // Assignee bubble colors on category cards
  const assigneeBg     = hasCategory ? 'bg-black/20 border-black/10 text-gray-800' : darkMode ? 'bg-indigo-700 border-indigo-600 text-indigo-200' : 'bg-indigo-100 border-indigo-200 text-indigo-700';
  const extraBubbleBg  = hasCategory ? 'bg-black/10 border-black/10 text-gray-700' : darkMode ? 'bg-slate-600 border-slate-500 text-slate-300' : 'bg-slate-200 border-slate-300 text-slate-600';

  const assigneeList   = Array.isArray(task.assignees) ? task.assignees : [];
  const displayAssignees = assigneeList.slice(0, 3);
  const extraCount     = assigneeList.length - 3;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div
        onClick={() => onClick(task)}
        className={`
          group border rounded-lg p-3 cursor-pointer
          transition-all duration-150 select-none
          hover:shadow-lg ${shadowHover}
          ${borderColor}
          ${isSortableDragging || isDragging ? 'opacity-50 rotate-2 shadow-xl' : ''}
        `}
        style={{ backgroundColor: cardBg }}
      >
        {/* Priority + Due date row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded ${priorityColors[task.priority] || priorityColors.medium}`}
              style={task.priority === 'high' ? HIGH_PILL_STYLE : undefined}
            >
              {PRIORITY_LABELS[task.priority] || 'Med'}
            </span>
            {hasCategory && (
              <span className={`text-xs font-medium truncate max-w-[80px] ${titleColor} opacity-60`}>
                {category.name}
              </span>
            )}
          </div>
          {formattedDate && (
            <span className={`text-xs ${dateColor}`}>
              {isOverdue ? '⚠ ' : ''}{formattedDate}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className={`text-sm font-medium leading-snug line-clamp-2 ${titleColor}`}>
          {task.title}
        </h3>

        {/* Description preview */}
        {task.description && (
          <p className={`text-xs mt-1 line-clamp-2 ${bodyColor}`}>{task.description}</p>
        )}

        {/* Category label (only shown when no full-card color, i.e. never — kept for fallback) */}

        {/* Assignees */}
        {assigneeList.length > 0 && (
          <div className="flex items-center gap-1 mt-2">
            {displayAssignees.map((name, i) => (
              <div
                key={i}
                title={name}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${assigneeBg}`}
              >
                {getInitials(name)}
              </div>
            ))}
            {extraCount > 0 && (
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${extraBubbleBg}`}>
                +{extraCount}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
