import db, { generateId } from '../db.js';

export function getAllProjects() {
  return db.prepare('SELECT * FROM projects ORDER BY position ASC, created_at ASC').all();
}

export function getProjectById(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

export function createProject({ name, description, color, darkMode, defaultAddToCalendar }) {
  const id = generateId();
  const DEFAULT_COLUMNS = ['Backlog', 'Prioritized', 'Active', 'Completed'];

  const createProjectTx = db.transaction(() => {
    db.prepare(
      'INSERT INTO projects (id, name, description, color, dark_mode, default_add_to_calendar) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      name,
      description || null,
      color || '#6366f1',
      darkMode !== undefined ? (darkMode ? 1 : 0) : 1,
      defaultAddToCalendar ? 1 : 0
    );
    DEFAULT_COLUMNS.forEach((colName, index) => {
      createColumn(id, { name: colName, position: index });
    });
  });
  createProjectTx();

  return getProjectById(id);
}

export function updateProject(id, { name, description, color, darkMode, position, defaultAddToCalendar }) {
  const current = getProjectById(id);
  if (!current) return null;

  let sql;
  let params;
  if (darkMode !== undefined && position !== undefined) {
    sql = "UPDATE projects SET name = ?, description = ?, color = ?, dark_mode = ?, position = ?, updated_at = datetime('now') WHERE id = ?";
    params = [name ?? current.name, description ?? current.description, color ?? current.color, darkMode ? 1 : 0, position, id];
  } else if (darkMode !== undefined) {
    sql = "UPDATE projects SET name = ?, description = ?, color = ?, dark_mode = ?, updated_at = datetime('now') WHERE id = ?";
    params = [name ?? current.name, description ?? current.description, color ?? current.color, darkMode ? 1 : 0, id];
  } else if (position !== undefined) {
    sql = "UPDATE projects SET name = ?, description = ?, color = ?, position = ?, updated_at = datetime('now') WHERE id = ?";
    params = [name ?? current.name, description ?? current.description, color ?? current.color, position, id];
  } else {
    sql = "UPDATE projects SET name = ?, description = ?, color = ?, updated_at = datetime('now') WHERE id = ?";
    params = [name ?? current.name, description ?? current.description, color ?? current.color, id];
  }

  db.prepare(sql).run(...params);

  // default_add_to_calendar is independent of the legacy fields above — write it separately
  // if it was supplied. Keeps the dynamic-SQL builder simple.
  if (defaultAddToCalendar !== undefined) {
    db.prepare(
      "UPDATE projects SET default_add_to_calendar = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(defaultAddToCalendar ? 1 : 0, id);
  }

  return getProjectById(id);
}

export function deleteProject(id) {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getProjectWithDetails(id) {
  const project = getProjectById(id);
  if (!project) return null;

  const columns = db.prepare(
    'SELECT * FROM columns WHERE project_id = ? ORDER BY position ASC'
  ).all(id);

  const columnsWithTasks = columns.map(col => {
    const tasks = db.prepare(
      'SELECT * FROM tasks WHERE column_id = ? ORDER BY position ASC'
    ).all(col.id);
    return { ...col, tasks };
  });

  return { ...project, columns: columnsWithTasks };
}

export function createColumn(projectId, { name, position }) {
  const id = generateId();
  if (position === undefined) {
    const maxPos = db.prepare('SELECT MAX(position) as maxPos FROM columns WHERE project_id = ?').get(projectId);
    position = (maxPos?.maxPos ?? -1) + 1;
  }
  db.prepare(
    'INSERT INTO columns (id, project_id, name, position) VALUES (?, ?, ?, ?)'
  ).run(id, projectId, name, position);
  return db.prepare('SELECT * FROM columns WHERE id = ?').get(id);
}

export function updateColumn(id, { name, position }) {
  const current = db.prepare('SELECT * FROM columns WHERE id = ?').get(id);
  if (!current) return null;
  db.prepare(
    'UPDATE columns SET name = ?, position = ? WHERE id = ?'
  ).run(name ?? current.name, position ?? current.position, id);
  return db.prepare('SELECT * FROM columns WHERE id = ?').get(id);
}

export function deleteColumn(id) {
  const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(id);
  if (!col) return false;

  const allCols = db.prepare(
    'SELECT * FROM columns WHERE project_id = ? ORDER BY position ASC'
  ).all(col.project_id);
  if (allCols.length <= 1) {
    throw new Error('Cannot delete the last column in a project');
  }

  const firstCol = allCols.find(c => c.id !== id);
  if (firstCol) {
    db.prepare('UPDATE tasks SET column_id = ? WHERE column_id = ?').run(firstCol.id, id);
  }
  const result = db.prepare('DELETE FROM columns WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getAllTasks({ projectId, columnId, priority, dueBefore, search } = {}) {
  let query = 'SELECT t.*, c.name as column_name, c.project_id FROM tasks t JOIN columns c ON t.column_id = c.id WHERE 1=1';
  const params = [];

  if (projectId) {
    query += ' AND c.project_id = ?';
    params.push(projectId);
  }
  if (columnId) {
    query += ' AND t.column_id = ?';
    params.push(columnId);
  }
  if (priority) {
    query += ' AND t.priority = ?';
    params.push(priority);
  }
  if (dueBefore) {
    query += ' AND t.due_date <= ?';
    params.push(dueBefore);
  }
  if (search) {
    query += ' AND t.title LIKE ?';
    params.push(`%${search}%`);
  }

  query += ' ORDER BY t.position ASC';
  const rows = db.prepare(query).all(...params);
  return rows.map(row => ({
    ...row,
    assignees: parseAssignees(row.assignees)
  }));
}

export function getTaskById(id) {
  const row = db.prepare('SELECT t.*, c.name as column_name, c.project_id FROM tasks t JOIN columns c ON t.column_id = c.id WHERE t.id = ?').get(id);
  if (!row) return null;
  return { ...row, assignees: parseAssignees(row.assignees) };
}

function parseAssignees(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

export function createTask({ columnId, title, description, dueDate, priority, assignees, categoryId }) {
  const id = generateId();
  const maxPos = db.prepare('SELECT MAX(position) as maxPos FROM tasks WHERE column_id = ?').get(columnId);
  const position = (maxPos?.maxPos ?? -1) + 1;

  db.prepare(
    'INSERT INTO tasks (id, column_id, title, description, due_date, priority, position, assignees, category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id, columnId, title, description || null,
    dueDate || null, priority || 'low', position,
    JSON.stringify(Array.isArray(assignees) ? assignees : []),
    categoryId || null
  );

  return getTaskById(id);
}

export function updateTask(id, { title, description, dueDate, priority, columnId, assignees, categoryId }) {
  const current = getTaskById(id);
  if (!current) return null;

  if (columnId && columnId !== current.column_id) {
    const maxPos = db.prepare('SELECT MAX(position) as maxPos FROM tasks WHERE column_id = ?').get(columnId);
    const position = (maxPos?.maxPos ?? -1) + 1;
    db.prepare(
      "UPDATE tasks SET column_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(columnId, position, id);
  }

  db.prepare(
    "UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ?, assignees = ?, category_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(
    title ?? current.title,
    description ?? current.description,
    dueDate ?? current.due_date,
    priority ?? current.priority,
    assignees !== undefined ? JSON.stringify(Array.isArray(assignees) ? assignees : []) : JSON.stringify(Array.isArray(current.assignees) ? current.assignees : []),
    categoryId !== undefined ? (categoryId || null) : current.category_id,
    id
  );
  return getTaskById(id);
}

export function deleteTask(id) {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

export function moveTask(id, { columnId, position }) {
  const current = getTaskById(id);
  if (!current) return null;

  // Shift positions of other tasks in target column
  db.prepare(
    'UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ?'
  ).run(columnId, position);

  db.prepare(
    "UPDATE tasks SET column_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(columnId, position, id);

  return getTaskById(id);
}

export function getTaskNotes(taskId) {
  return db.prepare('SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
}

export function addTaskNote(taskId, { content }) {
  const id = generateId();
  db.prepare(
    'INSERT INTO task_notes (id, task_id, content) VALUES (?, ?, ?)'
  ).run(id, taskId, content);
  return db.prepare('SELECT * FROM task_notes WHERE id = ?').get(id);
}

export function deleteNote(id) {
  const result = db.prepare('DELETE FROM task_notes WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getCategories(projectId) {
  if (projectId) {
    return db.prepare('SELECT * FROM categories WHERE project_id = ? ORDER BY position ASC, name ASC').all(projectId);
  }
  return db.prepare('SELECT * FROM categories ORDER BY position ASC, name ASC').all();
}

export function createCategory({ name, color, darkColor, projectId }) {
  const id = generateId();
  const maxPos = db.prepare(
    'SELECT MAX(position) as maxPos FROM categories WHERE project_id = ?'
  ).get(projectId || null);
  const position = (maxPos?.maxPos ?? -1) + 1;
  db.prepare(
    'INSERT INTO categories (id, name, color, dark_color, project_id, position) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, color || '#6366f1', darkColor || null, projectId || null, position);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

export function updateCategory(id, { name, color, darkColor, position }) {
  const current = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!current) return null;
  // darkColor === undefined  → leave as-is
  // darkColor === null       → explicitly clear
  // darkColor === '#hex'     → set
  db.prepare('UPDATE categories SET name = ?, color = ?, dark_color = ?, position = ? WHERE id = ?')
    .run(
      name ?? current.name,
      color ?? current.color,
      darkColor !== undefined ? darkColor : current.dark_color,
      position !== undefined ? position : current.position,
      id
    );
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

export function deleteCategory(id) {
  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return result.changes > 0;
}