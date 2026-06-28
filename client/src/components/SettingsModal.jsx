import { useState, useEffect } from 'react';
import { CATEGORY_COLORS } from '../lib/colors.js';
import { api } from '../lib/api.js';

const DEFAULT_PROJECT_KEY = 'virta-default-project';

// ── Color Swatch ─────────────────────────────────────────────────────────────
function ColorSwatch({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORY_COLORS.map(c => (
        <button
          key={c.id}
          type="button"
          title={c.label}
          onClick={() => onChange(c.hex)}
          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
            value === c.hex ? 'border-slate-200 scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
  );
}

// ── Inline Text Edit ──────────────────────────────────────────────────────────
function InlineEdit({ value, onSave, onCancel, placeholder, inputClass }) {
  const [val, setVal] = useState(value);
  function handleSave(e) {
    e.preventDefault();
    if (val.trim()) onSave(val.trim());
    else onCancel();
  }
  return (
    <form onSubmit={handleSave} className="flex items-center gap-1">
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder={placeholder}
        className={`border rounded px-2 py-0.5 text-sm focus:outline-none focus:border-indigo-500 ${inputClass}`}
        onKeyDown={e => e.key === 'Escape' && onCancel()}
      />
      <button type="submit" className="text-green-400 hover:text-green-300 text-xs">✓</button>
      <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-200 text-xs">✕</button>
    </form>
  );
}

// ── Project Row ──────────────────────────────────────────────────────────────
function ProjectRow({ project, darkMode, onUpdate, onDelete, onReorder, isDefault, onSetDefault, isFirst, isLast }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);

  const textCls   = darkMode ? 'text-slate-100' : 'text-slate-900';
  const rowBg     = darkMode ? 'bg-slate-700/50' : 'bg-slate-100';
  const inputCls  = darkMode ? 'bg-slate-600 border-slate-500 text-slate-100' : 'bg-white border-slate-300 text-slate-800';
  const btnCls   = darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600';
  const delCls   = darkMode ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-red-500';
  const starCls  = isDefault ? 'text-amber-400' : (darkMode ? 'text-slate-600 hover:text-amber-400' : 'text-slate-300 hover:text-amber-400');
  const iconCls  = darkMode ? 'text-slate-400' : 'text-slate-500';

  async function handleSave(newName) {
    if (newName === project.name) { setEditing(false); return; }
    await onUpdate(project.id, { name: newName });
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${project.name}"? All tasks in this project will be lost.`)) return;
    await onDelete(project.id);
  }

  async function handleToggleDarkMode() {
    const newVal = project.dark_mode === 0 ? 1 : 0;
    await onUpdate(project.id, { darkMode: newVal });
  }

  function handleSetDefault() {
    onSetDefault(project.id);
    // Move to top: set position to 0 for this, shift others
    if (!isFirst) onReorder(project.id, 'up');
  }

  return (
    <div className={`p-2 rounded-lg ${rowBg}`}>
      {editing ? (
        <InlineEdit
          value={name}
          onSave={handleSave}
          onCancel={() => { setName(project.name); setEditing(false); }}
          placeholder="Project name"
          inputClass={inputCls}
        />
      ) : (
        <div className="flex items-center gap-1.5">
          {/* Default star */}
          <button onClick={handleSetDefault} title={isDefault ? 'Default project' : 'Set as default'} className={`text-sm transition-colors shrink-0 ${starCls}`}>★</button>

          {/* Reorder up */}
          <button
            onClick={() => onReorder(project.id, 'up')}
            disabled={isFirst}
            title="Move up"
            className={`text-xs transition-colors shrink-0 ${isFirst ? 'opacity-20 cursor-not-allowed' : btnCls}`}
          >↑</button>

          {/* Reorder down */}
          <button
            onClick={() => onReorder(project.id, 'down')}
            disabled={isLast}
            title="Move down"
            className={`text-xs transition-colors shrink-0 ${isLast ? 'opacity-20 cursor-not-allowed' : btnCls}`}
          >↓</button>

          {/* Name */}
          <span className={`flex-1 text-sm truncate ${textCls}`}>{project.name}</span>

          {isDefault && <span className={`text-xs shrink-0 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>default</span>}

          {/* Theme toggle */}
          <button
            onClick={handleToggleDarkMode}
            title={project.dark_mode === 0 ? 'Light mode' : 'Dark mode'}
            className={`text-sm shrink-0 transition-transform hover:scale-110 ${iconCls}`}
          >
            {project.dark_mode === 0 ? '☀️' : '🌙'}
          </button>

          {/* Rename */}
          <button onClick={() => setEditing(true)} title="Rename" className={`text-xs shrink-0 ${btnCls}`}>✏️</button>

          {/* Delete */}
          <button onClick={handleDelete} title="Delete" className={`text-xs shrink-0 ${delCls}`}>🗑️</button>
        </div>
      )}
    </div>
  );
}

// ── Column Row ───────────────────────────────────────────────────────────────
function ColumnRow({ column, darkMode, onUpdate, onDelete, onReorder, isFirst, isLast, taskCount, firstColName, isOnlyColumn }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);

  const textCls   = darkMode ? 'text-slate-100' : 'text-slate-900';
  const rowBg     = darkMode ? 'bg-slate-700/50' : 'bg-slate-100';
  const inputCls  = darkMode ? 'bg-slate-600 border-slate-500 text-slate-100' : 'bg-white border-slate-300 text-slate-800';
  const btnCls    = darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600';
  const delCls    = darkMode ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-red-500';

  async function handleSave(newName) {
    if (newName === column.name) { setEditing(false); return; }
    await onUpdate(column.id, { name: newName });
    setEditing(false);
  }

  async function handleDelete() {
    if (taskCount > 0) {
      if (!confirm(`Delete "${column.name}"? ${taskCount} task${taskCount > 1 ? 's' : ''} will be moved to ${firstColName || 'the first column'}.`)) return;
    }
    await onDelete(column.id);
  }

  return (
    <div className={`p-2 rounded-lg ${rowBg}`}>
      {editing ? (
        <InlineEdit
          value={name}
          onSave={handleSave}
          onCancel={() => { setName(column.name); setEditing(false); }}
          placeholder="Column name"
          inputClass={inputCls}
        />
      ) : (
        <div className="flex items-center gap-1.5">
          <button onClick={() => onReorder(column.id, 'up')} disabled={isFirst} title="Move up" className={`text-xs shrink-0 ${isFirst ? 'opacity-20 cursor-not-allowed' : btnCls}`}>↑</button>
          <button onClick={() => onReorder(column.id, 'down')} disabled={isLast} title="Move down" className={`text-xs shrink-0 ${isLast ? 'opacity-20 cursor-not-allowed' : btnCls}`}>↓</button>
          <span className={`flex-1 text-sm truncate ${textCls}`}>{column.name}</span>
          <span className={`text-xs shrink-0 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{taskCount}</span>
          <button onClick={() => setEditing(true)} title="Rename" className={`text-xs shrink-0 ${btnCls}`}>✏️</button>
          {isOnlyColumn ? (
            <span title="Cannot delete the only column" className={`text-xs shrink-0 opacity-30 cursor-not-allowed`}>🗑️</span>
          ) : (
            <button onClick={handleDelete} title="Delete" className={`text-xs shrink-0 ${delCls}`}>🗑️</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Category Row ─────────────────────────────────────────────────────────────
function CategoryRow({ category, darkMode, onUpdate, onDelete, onReorder, isFirst, isLast }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);

  const textCls   = darkMode ? 'text-slate-100' : 'text-slate-900';
  const rowBg     = darkMode ? 'bg-slate-700/50' : 'bg-slate-100';
  const inputCls  = darkMode ? 'bg-slate-600 border-slate-500 text-slate-100' : 'bg-white border-slate-300 text-slate-800';
  const btnCls    = darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600';
  const delCls    = darkMode ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-red-500';

  async function handleSave(newName) {
    await onUpdate(category.id, { name: newName, color });
    setEditing(false);
  }

  async function handleColorChange(c) {
    setColor(c);
    await onUpdate(category.id, { name, color: c });
  }

  async function handleDelete() {
    if (!confirm(`Delete "${category.name}"? Tasks using it will have no category.`)) return;
    await onDelete(category.id);
  }

  return (
    <div className={`p-2 rounded-lg ${rowBg}`}>
      {editing ? (
        <div className="space-y-2">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(name); if (e.key === 'Escape') setEditing(false); }}
            className={`w-full border rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500 ${inputCls}`}
          />
          <ColorSwatch value={color} onChange={c => { setColor(c); }} />
          <div className="flex gap-2 pt-1">
            <button onClick={() => handleSave(name)} className="text-green-400 hover:text-green-300 text-xs">Save</button>
            <button onClick={() => setEditing(false)} className={`text-xs ${btnCls}`}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button onClick={() => onReorder(category.id, 'up')} disabled={isFirst} title="Move up" className={`text-xs shrink-0 ${isFirst ? 'opacity-20 cursor-not-allowed' : btnCls}`}>↑</button>
          <button onClick={() => onReorder(category.id, 'down')} disabled={isLast} title="Move down" className={`text-xs shrink-0 ${isLast ? 'opacity-20 cursor-not-allowed' : btnCls}`}>↓</button>
          <button onClick={() => setEditing(true)} title="Change color" className="w-4 h-4 rounded-full shrink-0 transition-transform hover:scale-110" style={{ backgroundColor: category.color }} />
          <span className={`flex-1 text-sm truncate ${textCls}`}>{category.name}</span>
          <button onClick={() => setEditing(true)} title="Edit" className={`text-xs shrink-0 ${btnCls}`}>✏️</button>
          <button onClick={handleDelete} title="Delete" className={`text-xs shrink-0 ${delCls}`}>🗑️</button>
        </div>
      )}
    </div>
  );
}

// ── Main SettingsModal ────────────────────────────────────────────────────────
export default function SettingsModal({
  darkMode, projects, onUpdateProject, onDeleteProject, onCreateProject,
  currentProject, columns, onCreateColumn, onUpdateColumn, onDeleteColumn,
  onReorderColumns, onReorderCategories, onReorderProjects,
  categories, onCreateCategory, onUpdateCategory, onDeleteCategory,
  onClose
}) {
  const [defaultProjectId] = useState(
    () => localStorage.getItem(DEFAULT_PROJECT_KEY) || ''
  );

  // Projects section
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDark, setNewProjectDark] = useState(true);
  const [saving, setSaving] = useState(false);

  // Columns section (collapsible)
  const [columnsExpanded, setColumnsExpanded] = useState(true);
  const [showColumnForm, setShowColumnForm] = useState(false);
  const [newColName, setNewColName] = useState('');

  // Categories section (collapsible)
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0].hex);

  // Google Calendar section
  const [calAuthStatus, setCalAuthStatus] = useState(null); // null=loading, {connected, credentialsFile}
  const [calDisconnecting, setCalDisconnecting] = useState(false);
  const [calFilter, setCalFilter] = useState(() => {
    try { return JSON.parse(localStorage.getItem('calendar-filter') || 'null'); } catch { return null; }
  });
  const [calList, setCalList] = useState([]);

  const [calError, setCalError] = useState(null);

  // Load calendar auth status + calendar list on mount (and after connect/disconnect)
  async function loadCalStatus() {
    setCalError(null);
    try {
      const s = await api.googleAuthStatus();
      setCalAuthStatus(s);
      if (s.connected) {
        try {
          const cals = await api.listCalendars();
          setCalList(cals);
        } catch (calErr) {
          setCalError(`Could not load calendar list: ${calErr.message}`);
        }
      } else {
        setCalList([]);
      }
    } catch (err) {
      setCalError(`Could not reach the Virta API: ${err.message}. Reload the page and try again.`);
      setCalAuthStatus({ credentialsFile: false, connected: false });
    }
  }
  useEffect(() => { loadCalStatus(); }, []);

  function toggleCalendarFilter(calId) {
    setCalFilter(prev => {
      // null = show all. Toggling off a calendar means we now have an explicit allow-list.
      const current = prev === null ? calList.map(c => c.id) : prev;
      const next = current.includes(calId)
        ? current.filter(id => id !== calId)
        : [...current, calId];
      const toStore = next.length === calList.length ? null : next;
      localStorage.setItem('calendar-filter', JSON.stringify(toStore));
      return toStore;
    });
  }

  async function handleDisconnect() {
    setCalDisconnecting(true);
    try {
      await api.googleDisconnect();
      localStorage.removeItem('calendar-filter');
      setCalFilter(null);
      setCalList([]);
      await loadCalStatus();
    } catch (err) {
      console.error('Failed to disconnect:', err);
    } finally {
      setCalDisconnecting(false);
    }
  }

  // Sort helpers
  const sortedProjects = [...(projects || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const sortedColumns  = [...(columns || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const sortedCategories = [...(categories || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // First column name for delete confirmation (current project)
  const firstColName = sortedColumns[0]?.name || 'the first column';

  // Project handlers
  async function handleCreateProjectSubmit(e) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setSaving(true);
    try {
      await onCreateProject({ name: newProjectName.trim(), darkMode: newProjectDark });
      setNewProjectName('');
      setNewProjectDark(true);
      setShowProjectForm(false);
    } finally {
      setSaving(false);
    }
  }

  // Column handlers
  async function handleAddColumn(e) {
    e.preventDefault();
    if (!newColName.trim()) return;
    setSaving(true);
    try {
      await onCreateColumn(newColName.trim());
      setNewColName('');
      setShowColumnForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteColumn(columnId) {
    const col = sortedColumns.find(c => c.id === columnId);
    const taskCount = col?.tasks?.length || 0;
    if (taskCount > 0) {
      if (!confirm(`Delete "${col.name}"? ${taskCount} task${taskCount > 1 ? 's' : ''} will be moved to ${firstColName}.`)) return;
    }
    await onDeleteColumn(columnId);
  }

  // Category handlers
  async function handleAddCategory(e) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSaving(true);
    try {
      await onCreateCategory({ name: newCatName.trim(), color: newCatColor });
      setNewCatName('');
      setNewCatColor(CATEGORY_COLORS[0].hex);
      setShowCategoryForm(false);
    } finally {
      setSaving(false);
    }
  }

  // Set default project
  function handleSetDefault(id) {
    localStorage.setItem(DEFAULT_PROJECT_KEY, id);
  }

  // Style helpers
  const panelCls    = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const headingCls  = darkMode ? 'text-slate-200' : 'text-slate-800';
  const subLabelCls = darkMode ? 'text-slate-400' : 'text-slate-500';
  const formInputCls = darkMode
    ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500'
    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400';
  const borderCls  = darkMode ? 'border-slate-700' : 'border-slate-200';
  const sectionBg  = darkMode ? 'bg-slate-900/50' : 'bg-slate-50';
  const formBg     = darkMode ? 'bg-indigo-500/5 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`absolute right-0 top-0 bottom-0 w-full max-w-sm border-l shadow-2xl overflow-y-auto ${panelCls}`}>

        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${borderCls}`}>
          <h2 className={`text-sm font-semibold ${headingCls}`}>Settings</h2>
          <button
            onClick={onClose}
            className={`text-xl leading-none transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-5">

          {/* ── GLOBAL → Projects ── */}
          <section>
            <p className={`text-xs uppercase tracking-widest font-bold mb-2 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>GLOBAL</p>
            <h3 className={`text-xs uppercase tracking-wide font-medium mb-3 ${subLabelCls}`}>Projects</h3>

            <div className="space-y-2">
              {sortedProjects.map((project, i) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  darkMode={darkMode}
                  onUpdate={onUpdateProject}
                  onDelete={onDeleteProject}
                  onReorder={onReorderProjects}
                  isDefault={defaultProjectId ? defaultProjectId === project.id : i === 0}
                  isFirst={i === 0}
                  isLast={i === sortedProjects.length - 1}
                  onSetDefault={handleSetDefault}
                />
              ))}
            </div>

            {/* New project inline form */}
            {showProjectForm ? (
              <form onSubmit={handleCreateProjectSubmit} className={`mt-3 space-y-2 p-3 rounded-lg border ${formBg}`}>
                <input
                  autoFocus
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  placeholder="Project name..."
                  className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500 ${formInputCls}`}
                />
                <div className="flex items-center gap-3">
                  <span className={`text-xs ${subLabelCls}`}>Theme:</span>
                  <button type="button" onClick={() => setNewProjectDark(true)} className={`text-lg transition-opacity ${newProjectDark ? 'opacity-100' : 'opacity-40'}`}>🌙</button>
                  <button type="button" onClick={() => setNewProjectDark(false)} className={`text-lg transition-opacity ${!newProjectDark ? 'opacity-100' : 'opacity-40'}`}>☀️</button>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={saving || !newProjectName.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg">Create</button>
                  <button type="button" onClick={() => { setShowProjectForm(false); setNewProjectName(''); }} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${darkMode ? 'border-slate-600 text-slate-400 hover:text-slate-200' : 'border-slate-300 text-slate-500 hover:text-slate-700'}`}>Cancel</button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowProjectForm(true)}
                className={`mt-2 w-full text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${darkMode ? 'border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500' : 'border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400'}`}
              >
                + New Project
              </button>
            )}
          </section>

          {/* Divider */}

          {/* ── GLOBAL → Google Calendar ── */}
          <section>
            <h3 className={`text-xs uppercase tracking-wide font-medium mb-3 ${subLabelCls}`}>Google Calendar</h3>

            {calAuthStatus === null && (
              <p className={`text-xs ${subLabelCls}`}>Loading…</p>
            )}

            {calError && (
              <div className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-md p-2 space-y-1">
                <p>{calError}</p>
                <button type="button" onClick={loadCalStatus} className="text-indigo-400 hover:underline">
                  Retry
                </button>
              </div>
            )}

            {calAuthStatus && !calAuthStatus.credentialsFile && !calError && (
              <p className="text-xs text-red-400">
                google-credentials.json is missing from the project root. Add it to enable calendar integration.
              </p>
            )}

            {calAuthStatus?.credentialsFile && !calAuthStatus.connected && (
              <div className="space-y-2">
                <p className={`text-xs ${subLabelCls}`}>
                  Connect your Google account to see calendar events in the sidebar.
                </p>
                <a
                  href={api.googleConnectUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                >
                  Connect Google Calendar
                </a>
                <details className={`mt-2 text-xs ${subLabelCls}`}>
                  <summary className="cursor-pointer hover:underline">What permissions does this ask for?</summary>
                  <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-slate-600/30">
                    <p>
                      Google shows a scary-looking consent screen mentioning "permanently delete calendars" — that's the maximum capability of the OAuth scope we need.
                    </p>
                    <p>
                      <strong>Virta never deletes, creates, or modifies whole calendars.</strong> It only reads your list of calendars and reads/creates/deletes individual events.
                    </p>
                    <p>
                      We need the broader scope because Google's API offers no narrower way to list calendars. See <code className={`px-1 rounded ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>scripts/audit-calendar-api.js</code> for the enforced safety check.
                    </p>
                  </div>
                </details>
              </div>
            )}

            {calAuthStatus?.connected && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-emerald-400">✓ Connected</p>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={calDisconnecting}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {calDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>

                {calList.length > 0 && (
                  <div>
                    <p className={`text-xs uppercase tracking-wider font-medium mb-2 ${subLabelCls}`}>
                      Calendars shown
                    </p>
                    <div className="space-y-1">
                      {calList.map(cal => {
                        const checked = calFilter === null || calFilter.includes(cal.id);
                        return (
                          <label
                            key={cal.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${darkMode ? 'hover:bg-slate-700/40' : 'hover:bg-slate-100'}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCalendarFilter(cal.id)}
                              className="rounded"
                            />
                            <div
                              className="w-2 h-6 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: cal.color || '#6366f1' }}
                            />
                            <span className={`text-xs ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                              {cal.primary ? '★ ' : ''}{cal.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {calFilter !== null && (
                      <button
                        type="button"
                        onClick={() => { setCalFilter(null); localStorage.removeItem('calendar-filter'); }}
                        className={`mt-2 text-xs ${subLabelCls} hover:underline`}
                      >
                        Show all calendars
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Divider */}
          <div className={`border-t ${borderCls}`} />

          {/* ── CURRENT PROJECT ── */}
          {currentProject && (
            <>
              <section>
                <p className={`text-xs uppercase tracking-widest font-bold mb-4 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
                  CURRENT PROJECT: {currentProject.name}
                </p>

                {/* Calendar default toggle */}
                <label className={`flex items-start gap-2 px-3 py-2 mb-4 rounded-lg cursor-pointer transition-colors ${darkMode ? 'bg-slate-700/40 hover:bg-slate-700/60' : 'bg-slate-100 hover:bg-slate-200'}`}>
                  <input
                    type="checkbox"
                    checked={!!currentProject.default_add_to_calendar}
                    onChange={e => onUpdateProject(currentProject.id, { defaultAddToCalendar: e.target.checked })}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <p className={`text-xs font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      Default "Add to Calendar" for new tasks
                    </p>
                    <p className={`text-xs mt-0.5 ${subLabelCls}`}>
                      When creating a task in this project, the "Add to Calendar" option is pre-checked.
                    </p>
                  </div>
                </label>

                {/* Columns sub-section */}
                <div className={sectionBg}>
                  {/* Section header with collapse toggle */}
                  <button
                    type="button"
                    onClick={() => setColumnsExpanded(v => !v)}
                    className={`flex items-center justify-between w-full text-xs uppercase tracking-wide font-medium mb-3 transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <span>Columns</span>
                    <span className="text-base leading-none">{columnsExpanded ? '▴' : '▾'}</span>
                  </button>

                  {columnsExpanded && (
                    <>
                      <div className="space-y-2">
                        {sortedColumns.map((col, i) => (
                          <ColumnRow
                            key={col.id}
                            column={col}
                            darkMode={darkMode}
                            onUpdate={onUpdateColumn}
                            onDelete={handleDeleteColumn}
                            onReorder={onReorderColumns}
                            isFirst={i === 0}
                            isLast={i === sortedColumns.length - 1}
                            taskCount={col.tasks?.length || 0}
                            firstColName={firstColName}
                            isOnlyColumn={sortedColumns.length === 1}
                          />
                        ))}
                      </div>

                      {/* Add column inline form */}
                      {showColumnForm ? (
                        <form onSubmit={handleAddColumn} className={`mt-3 space-y-2 p-3 rounded-lg border ${formBg}`}>
                          <input
                            autoFocus
                            type="text"
                            value={newColName}
                            onChange={e => setNewColName(e.target.value)}
                            placeholder="Column name..."
                            className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500 ${formInputCls}`}
                          />
                          <div className="flex gap-2">
                            <button type="submit" disabled={saving || !newColName.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg">Create</button>
                            <button type="button" onClick={() => { setShowColumnForm(false); setNewColName(''); }} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${darkMode ? 'border-slate-600 text-slate-400 hover:text-slate-200' : 'border-slate-300 text-slate-500 hover:text-slate-700'}`}>Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowColumnForm(true)}
                          className={`mt-2 w-full text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${darkMode ? 'border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500' : 'border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400'}`}
                        >
                          + Add Column
                        </button>
                      )}
                    </>
                  )}
                </div>
              </section>

              {/* Categories sub-section */}
              <section className={sectionBg}>
                <button
                  type="button"
                  onClick={() => setCategoriesExpanded(v => !v)}
                  className={`flex items-center justify-between w-full text-xs uppercase tracking-wide font-medium mb-3 transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <span>Categories</span>
                  <span className="text-base leading-none">{categoriesExpanded ? '▴' : '▾'}</span>
                </button>

                {categoriesExpanded && (
                  <>
                    <div className="space-y-2">
                      {sortedCategories.map((cat, i) => (
                        <CategoryRow
                          key={cat.id}
                          category={cat}
                          darkMode={darkMode}
                          onUpdate={onUpdateCategory}
                          onDelete={onDeleteCategory}
                          onReorder={onReorderCategories}
                          isFirst={i === 0}
                          isLast={i === sortedCategories.length - 1}
                        />
                      ))}
                    </div>

                    {/* Add category inline form */}
                    {showCategoryForm ? (
                      <form onSubmit={handleAddCategory} className={`mt-3 space-y-2 p-3 rounded-lg border ${formBg}`}>
                        <input
                          autoFocus
                          type="text"
                          value={newCatName}
                          onChange={e => setNewCatName(e.target.value)}
                          placeholder="Category name..."
                          className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500 ${formInputCls}`}
                        />
                        <ColorSwatch value={newCatColor} onChange={setNewCatColor} />
                        <div className="flex gap-2">
                          <button type="submit" disabled={saving || !newCatName.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg">Create</button>
                          <button type="button" onClick={() => { setShowCategoryForm(false); setNewCatName(''); setNewCatColor(CATEGORY_COLORS[0].hex); }} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${darkMode ? 'border-slate-600 text-slate-400 hover:text-slate-200' : 'border-slate-300 text-slate-500 hover:text-slate-700'}`}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowCategoryForm(true)}
                        className={`mt-2 w-full text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${darkMode ? 'border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500' : 'border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400'}`}
                      >
                        + Add Category
                      </button>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}