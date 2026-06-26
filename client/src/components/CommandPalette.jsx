import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';

export default function CommandPalette({ onClose, onAction, tasks }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const actions = [
    { id: 'new-task', label: 'New Task', icon: '✏️', action: () => onAction('new-task') },
    { id: 'new-project', label: 'New Project', icon: '📁', action: () => onAction('new-project') },
    { id: 'view-board', label: 'Switch to Board View', icon: '📋', action: () => onAction('view-board') },
    { id: 'view-list', label: 'Switch to List View', icon: '📝', action: () => onAction('view-list') }
  ];

  const matchingTasks = tasks
    .filter(t => t.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 5)
    .map(t => ({ id: `task-${t.id}`, label: t.title, icon: '📌', action: () => onAction('open-task', t) }));

  const matchingActions = actions.filter(a =>
    a.label.toLowerCase().includes(query.toLowerCase())
  );

  const allResults = [...matchingActions, ...matchingTasks];
  const filtered = query ? allResults : actions;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
          <span className="text-slate-400 text-lg">⌘K</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, actions..."
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none text-sm"
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">No results for "{query}"</div>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              onClick={() => { item.action(); onClose(); }}
              className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors
                ${i === selectedIndex ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-300 hover:bg-slate-700'}
              `}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}