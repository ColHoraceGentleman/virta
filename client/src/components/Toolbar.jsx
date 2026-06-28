import { useState, useRef, useEffect } from 'react';

export default function Toolbar({ view, onViewChange, projects, currentProject, onProjectChange, onNewTask, onOpenCommandPalette, onOpenSettings, onToggleFilters, filterCount, darkMode, onToggleDarkMode, onNewProject, calendarOpen, onToggleCalendar }) {
  const [projectOpen, setProjectOpen] = useState(false);
  const projectRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (projectRef.current && !projectRef.current.contains(e.target)) setProjectOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const dropBg      = darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200';
  const dropHover   = darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50';
  const dropText    = darkMode ? 'text-slate-200' : 'text-slate-700';
  const dropActive  = darkMode ? 'bg-slate-700 text-white' : 'bg-indigo-50 text-indigo-700';
  const newProjText = darkMode ? 'text-indigo-400 hover:bg-slate-700' : 'text-indigo-600 hover:bg-indigo-50';

  return (
    <div className={`flex items-center justify-between px-4 py-3 border-b backdrop-blur sticky top-0 z-30 ${darkMode ? 'border-slate-700 bg-slate-900/80' : 'border-slate-200 bg-white/90'}`}>
      {/* Left: Title + Project selector */}
      <div className="flex items-center gap-3">
        <h1 className={`flex items-center gap-1.5 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`} style={{ fontSize: 17, fontWeight: 300, letterSpacing: '0.28em', textTransform: 'uppercase' }}>
          <span style={{ color: '#6366f1', fontWeight: 200, fontSize: 22, lineHeight: 1, marginTop: -2, letterSpacing: 0 }}>~</span>VIRTA
        </h1>
        <div className="w-px h-5 bg-slate-700" />
        <div className="relative" ref={projectRef}>
          <button
            onClick={() => setProjectOpen(v => !v)}
            className={`border rounded-lg px-3 py-1.5 text-sm focus:outline-none flex items-center gap-2 ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-700'}`}
          >
            {currentProject?.name || 'Select project'}
            <span className="text-xs opacity-50">▾</span>
          </button>
          {projectOpen && (
            <div className={`absolute left-0 top-full mt-1 min-w-[160px] border rounded-lg shadow-lg overflow-hidden z-50 ${dropBg}`}>
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onProjectChange(p.id); setProjectOpen(false); }}
                  className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                    p.id === currentProject?.id ? dropActive : `${dropText} ${dropHover}`
                  }`}
                >
                  {p.name}
                </button>
              ))}
              <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-slate-100'}`} />
              <button
                onClick={() => { onNewProject(); setProjectOpen(false); }}
                className={`w-full px-3 py-2 text-sm text-left font-medium transition-colors ${newProjText}`}
              >
                + New Project
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: View toggle + actions */}
      <div className="flex items-center gap-2">
        {/* Dark mode toggle */}
        <button
          onClick={onToggleDarkMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200'}`}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>

        {/* Calendar toggle */}
        <button
          onClick={onToggleCalendar}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
            calendarOpen
              ? 'bg-indigo-600 text-white'
              : darkMode ? 'text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200'
          }`}
          title={calendarOpen ? 'Close calendar' : 'Open calendar'}
        >
          📅
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200'}`}
          title="Settings"
        >
          ⚙️
        </button>

        {/* Filter button with badge */}
        <button
          onClick={onToggleFilters}
          className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200'}`}
          title="Filter tasks"
        >
          🔍 Filter
          {filterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
              {filterCount}
            </span>
          )}
        </button>

        {/* View toggle */}
        <div className={`flex items-center rounded-lg p-0.5 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
          <button
            onClick={() => onViewChange('board')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              view === 'board' ? 'bg-indigo-600 text-white' : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Board
          </button>
          <button
            onClick={() => onViewChange('list')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              view === 'list' ? 'bg-indigo-600 text-white' : darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            List
          </button>
        </div>

        <button
          onClick={onOpenCommandPalette}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200'}`}
          title="Search & commands (⌘K)"
        >
          🔍
        </button>

        <button
          onClick={onNewTask}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
        >
          + New Task
        </button>
      </div>
    </div>
  );
}