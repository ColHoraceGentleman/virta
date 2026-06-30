import React, { useState, useEffect, useCallback } from 'react';
import { api } from './lib/api.js';
import { useTasks } from './hooks/useTasks.js';
import { useSSE } from './hooks/useSSE.js';
import Toolbar from './components/Toolbar.jsx';
import KanbanBoard from './components/KanbanBoard.jsx';
import TaskList from './components/TaskList.jsx';
import TaskModal from './components/TaskModal.jsx';
import TaskCreateModal from './components/TaskCreateModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import FilterBar, { applyFilters, loadFilters } from './components/FilterBar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import CalendarSidebar from './components/TodaySidebar.jsx';
import BooksShell from './books/BooksShell.jsx';

const VIEWS = { BOARD: 'board', LIST: 'list' };

export default function App() {
  // Route switch: if the URL is /books/*, render the Virta Books shell instead
  // of the task-manager. Path is reactive so in-app navigation (history.pushState)
  // re-renders without a page reload.
  const [pathname, setPathname] = useState(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  useEffect(() => {
    function onPop() { setPathname(window.location.pathname); }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // If BooksShell uses pushState, App.jsx won't see it (only popstate fires).
  // Workaround: a tiny interval polls the path so back/forward + same-tab nav both work.
  // Cheap (no-op when unchanged) and avoids a context bridge.
  useEffect(() => {
    const id = setInterval(() => {
      const p = window.location.pathname;
      setPathname(prev => (prev === p ? prev : p));
    }, 100);
    return () => clearInterval(id);
  }, []);

  if (pathname.startsWith('/books')) {
    return <BooksShell />;
  }

  const [view, setView] = useState(localStorage.getItem('task-view') || VIEWS.BOARD);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [createModalColumnId, setCreateModalColumnId] = useState(null);
  const [filters, setFilters] = useState(() => loadFilters());
  const [calendarOpen, setCalendarOpen] = useState(
    () => localStorage.getItem('calendar-sidebar-open') !== 'false'
  );

  // Bumped when tasks change so the Today sidebar refetches its merged data.
  // Set to a counter so re-renders always trigger the effect.
  const [todayRefreshKey, setTodayRefreshKey] = useState(0);

  function toggleCalendar() {
    setCalendarOpen(v => {
      const next = !v;
      localStorage.setItem('calendar-sidebar-open', String(next));
      return next;
    });
  }

  const {
    projects, currentProject, tasks, categories, loading, error,
    setCurrentProject, createTask, updateTask,
    deleteTask, moveTask, addNote, deleteNote, handleSSEEvent, reload,
    createCategory, updateCategory, deleteCategory,
    reorderProjects, reorderColumns, reorderCategories,
    darkMode, setDarkMode
  } = useTasks();

  // Persist dark mode preference to localStorage
  useEffect(() => {
    localStorage.setItem('task-dark-mode', String(darkMode));
  }, [darkMode]);

  // SSE event handler
  const onSSEEvent = useCallback((event) => {
    handleSSEEvent(event);
    // Trigger Today sidebar refetch when task data changes (any task add/update/
    // delete/move or completion-column move). Cheap: just bumps a counter.
    if (event && (
      event.type === 'task_created' ||
      event.type === 'task_updated' ||
      event.type === 'task_deleted' ||
      event.type === 'task_moved'
    )) {
      setTodayRefreshKey(k => k + 1);
    }
  }, [handleSSEEvent]);

  useSSE(onSSEEvent);

  // Persist view in localStorage
  useEffect(() => {
    localStorage.setItem('task-view', view);
  }, [view]);

  // Keyboard shortcut for command palette
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Apply filters to all tasks across all columns
  const filteredTasksByColumn = React.useMemo(() => {
    if (!currentProject?.columns) return {};
    const allTasks = currentProject.columns.flatMap(col => col.tasks || []);
    const filtered = applyFilters(allTasks, filters);
    const filteredIds = new Set(filtered.map(t => t.id));

    const result = {};
    for (const col of currentProject.columns) {
      result[col.id] = (col.tasks || []).filter(t => filteredIds.has(t.id));
    }
    return result;
  }, [currentProject, filters]);

  // Compute active filter count for badge
  const activeFilterCount = [
    filters.dueDate && filters.dueDate !== 'none',
    filters.priorities?.length,
    filters.categories?.length
  ].filter(Boolean).length;

  function handleOpenCreateModal(columnId) {
    setCreateModalColumnId(columnId || null);
    setShowCreateModal(true);
  }

  function handleNewTask() {
    const firstCol = currentProject?.columns?.[0];
    setCreateModalColumnId(firstCol?.id || null);
    setShowCreateModal(true);
  }

  async function handleAddTask(columnId, title) {
    await createTask(columnId, title);
  }

  async function handleTaskClick(task) {
    setSelectedTask(task);
  }

  async function handleTaskUpdate(taskId, fields) {
    await updateTask(taskId, fields);
    if (selectedTask?.id === taskId) {
      const updated = tasks.find(t => t.id === taskId);
      if (updated) setSelectedTask({ ...updated, ...fields });
    }
  }

  async function handleTaskDelete(taskId) {
    await deleteTask(taskId);
    setSelectedTask(null);
  }

  async function handleMoveTask(taskId, columnId, position) {
    await moveTask(taskId, columnId, position);
  }

  async function handleCommandPaletteAction(action, data) {
    if (action === 'new-task') {
      handleNewTask();
    } else if (action === 'new-project') {
      setShowSettingsModal(true);
    } else if (action === 'view-board') {
      setView(VIEWS.BOARD);
    } else if (action === 'view-list') {
      setView(VIEWS.LIST);
    } else if (action === 'open-task') {
      setSelectedTask(data);
    }
  }

  async function handleCreateColumn(name) {
    const cols = currentProject?.columns || [];
    await api.createColumn(currentProject.id, { name, position: cols.length });
    await reload();
  }

  async function handleDeleteColumn(columnId) {
    await api.deleteColumn(columnId);
    await reload();
  }

  async function handleUpdateColumn(columnId, fields) {
    try {
      await api.updateColumn(columnId, fields);
    } catch (err) {
      console.error('Failed to update column:', err);
    }
  }

  async function handleNewProject() {
    setShowSettingsModal(true);
  }

  async function handleUpdateProject(id, fields) {
    try {
      await api.updateProject(id, fields);
      await reload();
    } catch (err) {
      console.error('Failed to update project:', err);
    }
  }

  async function handleDeleteProject(id) {
    try {
      await api.deleteProject(id);
      await reload();
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  }

  async function handleCreateProject({ name, darkMode }) {
    try {
      await api.createProject({ name, darkMode: darkMode ? 1 : 0 });
      await reload();
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  }

  if (projects.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100">
        <h1 className="text-2xl font-bold mb-2">Welcome to Virta</h1>
        <p className="text-slate-400 mb-6">You don&apos;t have any projects yet.</p>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium"
        >
          Create your first project
        </button>
        {showSettingsModal && (
          <SettingsModal
            categories={[]}
            projects={[]}
            onClose={() => setShowSettingsModal(false)}
            onCreateProject={handleCreateProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onCreateCategory={createCategory}
            onUpdateCategory={updateCategory}
            onDeleteCategory={deleteCategory}
            darkMode={darkMode}
            currentProject={null}
            columns={[]}
            onCreateColumn={handleCreateColumn}
            onUpdateColumn={handleUpdateColumn}
            onDeleteColumn={handleDeleteColumn}
            onReorderColumns={reorderColumns}
            onReorderCategories={reorderCategories}
            onReorderProjects={reorderProjects}
          />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
        <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
        <div className="text-red-400 text-sm">Error: {error}</div>
      </div>
    );
  }

  const columns = currentProject?.columns || [];
  const dm = darkMode;

  return (
    <div className={`min-h-screen flex flex-col ${dm ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <Toolbar
        view={view}
        onViewChange={setView}
        projects={projects}
        currentProject={currentProject}
        onProjectChange={(id) => {
          const p = projects.find(proj => proj.id === id);
          if (p) setCurrentProject(p);
        }}
        onNewTask={handleNewTask}
        onOpenCommandPalette={() => setShowCommandPalette(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onToggleFilters={() => setShowFilterBar(v => !v)}
        filterCount={activeFilterCount}
        darkMode={dm}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onNewProject={handleNewProject}
        calendarOpen={calendarOpen}
        onToggleCalendar={toggleCalendar}
      />

      {showFilterBar && (
        <FilterBar
          categories={categories}
          filters={filters}
          onChange={setFilters}
          darkMode={dm}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden p-4">
          {view === VIEWS.BOARD ? (
            <KanbanBoard
              project={currentProject}
              onTaskClick={handleTaskClick}
              onAddTask={handleAddTask}
              onMoveTask={handleMoveTask}
              onUpdateColumn={handleUpdateColumn}
              onOpenCreateModal={handleOpenCreateModal}
              categories={categories}
              filteredTasks={filteredTasksByColumn}
              darkMode={dm}
            />
          ) : (
            <TaskList
              project={currentProject}
              onTaskClick={handleTaskClick}
              onStatusChange={(taskId, columnId) => {
                const col = currentProject?.columns?.find(c => c.id === columnId);
                if (col) handleMoveTask(taskId, columnId, col.tasks?.length || 0);
              }}
              filteredTasks={applyFilters(
                currentProject?.columns?.flatMap(c => c.tasks || []) || [],
                filters
              )}
              darkMode={dm}
            />
          )}
        </main>

        <CalendarSidebar
          open={calendarOpen}
          onToggle={toggleCalendar}
          darkMode={dm}
          refreshKey={todayRefreshKey}
          onTaskClick={(taskId) => {
            // Find task and open modal
            const t = tasks.find(t => t.id === taskId);
            if (t) setSelectedTask(t);
          }}
        />
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          project={currentProject}
          categories={categories}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
          onAddNote={addNote}
          onDeleteNote={deleteNote}
          darkMode={dm}
        />
      )}

      {showCreateModal && (
        <TaskCreateModal
          columns={columns}
          categories={categories}
          defaultColumnId={createModalColumnId}
          onClose={() => setShowCreateModal(false)}
          darkMode={dm}
          onCreate={async (fields) => {
            try {
              const colId = fields.columnId || columns[0]?.id;
              if (!colId) return;
              const task = await api.createTask({
                columnId: colId,
                title: fields.title,
                description: fields.description,
                dueDate: fields.dueDate,
                priority: fields.priority,
                assignees: fields.assignees,
                categoryId: fields.categoryId
              });
              // Create any staged subtasks in parallel. Failures here don't
              // unwind the task — the user can still add subtasks via the
              // task modal. We log so issues are visible in the console.
              if (task && task.id && Array.isArray(fields.subtasks) && fields.subtasks.length > 0) {
                const results = await Promise.allSettled(
                  fields.subtasks.map(st => api.createSubtask(task.id, { title: st.title }))
                );
                const failed = results.filter(r => r.status === 'rejected');
                if (failed.length > 0) {
                  console.warn(`Created task but ${failed.length}/${results.length} subtask(s) failed:`, failed);
                }
              }
            } catch (err) {
              console.error('Failed to create task:', err);
            }
          }}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          categories={categories}
          onClose={() => setShowSettingsModal(false)}
          onCreateCategory={createCategory}
          onUpdateCategory={updateCategory}
          onDeleteCategory={deleteCategory}
          darkMode={dm}
          projects={projects}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
          onCreateProject={handleCreateProject}
          currentProject={currentProject}
          columns={currentProject?.columns || []}
          onCreateColumn={handleCreateColumn}
          onUpdateColumn={handleUpdateColumn}
          onDeleteColumn={handleDeleteColumn}
          onReorderColumns={reorderColumns}
          onReorderCategories={reorderCategories}
          onReorderProjects={reorderProjects}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          onAction={handleCommandPaletteAction}
          tasks={tasks}
        />
      )}
    </div>
  );
}