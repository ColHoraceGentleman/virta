import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import TaskCard from './TaskCard.jsx';

export default function KanbanColumn({ column, onTaskClick, onOpenCreateModal, onUpdateColumn, filteredTasks, categories, darkMode }) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [columnName, setColumnName] = useState(column.name);

  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const tasks = filteredTasks !== undefined ? filteredTasks : (column.tasks || []);
  const taskCount = tasks.length;

  async function handleRenameColumn(e) {
    e.preventDefault();
    if (!columnName.trim() || columnName === column.name) {
      setColumnName(column.name);
      setIsEditingName(false);
      return;
    }
    await onUpdateColumn(column.id, { name: columnName.trim() });
    setIsEditingName(false);
  }

  const colBg      = darkMode ? 'bg-slate-800/50' : 'bg-slate-100/80';
  const colBorder  = isOver
    ? 'border-indigo-500/50 ring-1 ring-indigo-500/30'
    : darkMode ? 'border-slate-700/50' : 'border-slate-200';
  const headerBorder = darkMode ? 'border-slate-700/50' : 'border-slate-200';
  const titleColor   = darkMode ? 'text-slate-200 hover:text-slate-100' : 'text-slate-700 hover:text-slate-900';
  const countColor   = darkMode ? 'text-slate-500' : 'text-slate-400';
  const addBtnColor  = darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600';
  const emptyBorder  = darkMode ? 'border-slate-700' : 'border-slate-300';
  const emptyText    = darkMode ? 'text-slate-500' : 'text-slate-400';
  const dropBorder   = darkMode ? 'border-indigo-500/40' : 'border-indigo-400/40';
  const dropText     = darkMode ? 'text-indigo-400/60' : 'text-indigo-500/60';
  const addRowColor  = darkMode
    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50';
  const inputClass   = darkMode
    ? 'bg-slate-700 border-slate-600 text-slate-100 focus:border-indigo-500'
    : 'bg-white border-slate-300 text-slate-800 focus:border-indigo-500';

  return (
    <div className={`flex flex-col ${colBg} rounded-xl w-72 min-w-72 border ${colBorder} transition-all duration-150`}>
      {/* Column Header */}
      <div className={`flex items-center justify-between px-3 py-2.5 border-b ${headerBorder}`}>
        {isEditingName ? (
          <form onSubmit={handleRenameColumn} className="flex-1 mr-2">
            <input
              type="text"
              value={columnName}
              onChange={e => setColumnName(e.target.value)}
              onBlur={handleRenameColumn}
              autoFocus
              className={`w-full border rounded px-2 py-0.5 text-sm focus:outline-none ${inputClass}`}
            />
          </form>
        ) : (
          <h3
            className={`text-sm font-semibold cursor-pointer ${titleColor}`}
            onClick={() => setIsEditingName(true)}
          >
            {column.name} <span className={`text-xs font-normal ${countColor}`}>({taskCount})</span>
          </h3>
        )}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onOpenCreateModal(column.id)}
            className={`text-lg leading-none transition-colors ${addBtnColor}`}
            title="Add task"
          >
            +
          </button>
        </div>
      </div>

      {/* Tasks */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[4rem]"
        style={{ maxHeight: 'calc(100vh - 220px)' }}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={onTaskClick} categories={categories} darkMode={darkMode} />
          ))}
        </SortableContext>

        {taskCount === 0 && !isOver && (
          <div className={`h-12 border-2 border-dashed ${emptyBorder} rounded-lg flex items-center justify-center`}>
            <span className={`text-xs ${emptyText}`}>Drop tasks here</span>
          </div>
        )}

        {isOver && taskCount === 0 && (
          <div className={`h-12 border-2 border-dashed ${dropBorder} rounded-lg flex items-center justify-center`}>
            <span className={`text-xs ${dropText}`}>Drop here</span>
          </div>
        )}
      </div>
    </div>
  );
}
