import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';

export function useTasks() {
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [darkMode, setDarkModeState] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ref so SSE handler can always read the latest currentProject.id without
  // needing to be recreated (avoids stale closure and Strict Mode side-effects).
  const currentProjectIdRef = useRef(null);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
    loadCategories();
  }, []);

  // Keep ref in sync so SSE handler always has the latest project id
  useEffect(() => {
    currentProjectIdRef.current = currentProject?.id ?? null;
  }, [currentProject?.id]);

  // Reload categories whenever the current project changes
  useEffect(() => {
    if (currentProject?.id) {
      loadCategories();
    }
  }, [currentProject?.id]);

  // Sync darkMode from project whenever currentProject changes
  useEffect(() => {
    if (currentProject) {
      const dm = currentProject.dark_mode !== 0;
      setDarkModeState(dm);
      document.documentElement.classList.toggle('dark', dm);
    }
  }, [currentProject?.id, currentProject?.dark_mode]);

  function setDarkMode(val) {
    setDarkModeState(val);
    document.documentElement.classList.toggle('dark', val);
    if (currentProject) {
      api.updateProject(currentProject.id, { darkMode: val ? 1 : 0 }).catch(err => {
        console.error('Failed to persist dark mode:', err);
      });
    }
  }

  // Load project details + tasks when currentProject changes
  useEffect(() => {
    if (currentProject) {
      loadProjectData(currentProject.id);
    }
  }, [currentProject?.id]);

  async function loadProjects() {
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0 && !currentProject) {
        const defaultId = localStorage.getItem('virta-default-project');
        const preferred = defaultId ? data.find(p => p.id === defaultId) : null;
        setCurrentProject(preferred || data[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadProjectData(projectId) {
    try {
      const project = await api.getProject(projectId);
      setCurrentProject(project);
      // Flatten all tasks from all columns
      const allTasks = project.columns.flatMap(col => col.tasks || []);
      setTasks(allTasks);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createTask(columnId, title) {
    const task = await api.createTask({ columnId, title });
    return task;
  }

  async function updateTask(id, data) {
    const task = await api.updateTask(id, data);
    return task;
  }

  async function deleteTask(id) {
    await api.deleteTask(id);
  }

  async function moveTask(id, columnId, position) {
    const task = await api.moveTask(id, { columnId, position });
    return task;
  }

  async function addNote(taskId, content) {
    const note = await api.addNote(taskId, { content });
    return note;
  }

  async function deleteNote(noteId) {
    await api.deleteNote(noteId);
  }

  async function loadCategories() {
    try {
      const projectId = currentProject?.id ?? null;
      const data = await api.getCategories(projectId);
      setCategories(data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }

  async function createCategory(data) {
    const category = await api.createCategory({ ...data, projectId: currentProject?.id });
    setCategories(prev => [...prev, category]);
    return category;
  }

  async function updateCategory(id, data) {
    const category = await api.updateCategory(id, data);
    setCategories(prev => prev.map(c => c.id === id ? category : c));
    return category;
  }

  async function deleteCategory(id) {
    await api.deleteCategory(id);
    setCategories(prev => prev.filter(c => c.id !== id));
  }

  // Handle SSE events to keep local state in sync.
  // Optimistic task list updates are applied immediately; a full project
  // reload follows so the board columns stay consistent.
  function handleSSEEvent(event) {
    const { type, data } = event;
    const projectId = currentProjectIdRef.current;

    if (type === 'task_created') {
      setTasks(prev => prev.find(t => t.id === data.id) ? prev : [...prev, data]);
      if (projectId) loadProjectData(projectId);
    } else if (type === 'task_updated') {
      setTasks(prev => prev.map(t => t.id === data.id ? data : t));
      if (projectId) loadProjectData(projectId);
    } else if (type === 'task_deleted') {
      setTasks(prev => prev.filter(t => t.id !== data.id));
      if (projectId) loadProjectData(projectId);
    } else if (type === 'task_moved') {
      setTasks(prev => prev.map(t => t.id === data.id ? data : t));
      if (projectId) loadProjectData(projectId);
    } else if (
      type === 'column_updated' ||
      type === 'column_created' ||
      type === 'column_deleted'
    ) {
      // Column changes (including renames) require a full project reload
      // so column headers and task lists re-render with fresh data.
      if (projectId) loadProjectData(projectId);
    } else if (type === 'attachment_added') {
      // Attachment added — no special handling needed, board is already showing
    }
  }

  // ── Reorder helpers ──────────────────────────────────────────────────────────

  async function reorderProjects(id, direction) {
    const sorted = [...projects].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const idx = sorted.findIndex(p => p.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    const reordered = [...sorted];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];

    await Promise.all(
      reordered.map((proj, i) => api.updateProject(proj.id, { position: i }))
    );
    await reload();
  }

  async function reorderColumns(id, direction) {
    const cols = currentProject?.columns || [];
    const sorted = [...cols].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const idx = sorted.findIndex(c => c.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    const reordered = [...sorted];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];

    await Promise.all(
      reordered.map((col, i) => api.updateColumn(col.id, { position: i }))
    );
  }

  async function reorderCategories(id, direction) {
    // Work from a clean sorted copy by index, ignoring raw position values
    // to avoid collision bugs from stale/duplicate positions
    const sorted = [...categories].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const idx = sorted.findIndex(c => c.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    // Swap the two items in the array
    const reordered = [...sorted];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];

    // Re-index all positions sequentially to prevent collisions
    await Promise.all(
      reordered.map((cat, i) => api.updateCategory(cat.id, { position: i }))
    );
    await loadCategories();
  }

  return {
    projects,
    currentProject,
    tasks,
    categories,
    loading,
    error,
    setCurrentProject,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    addNote,
    deleteNote,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderProjects,
    reorderColumns,
    reorderCategories,
    darkMode,
    setDarkMode,
    handleSSEEvent,
    reload: loadProjects
  };
}