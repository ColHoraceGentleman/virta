import db, { generateId } from '../db.js';

export function listSubtasks(taskId) {
  return db.prepare(
    'SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC, created_at ASC'
  ).all(taskId);
}

export function getSubtask(id) {
  return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id);
}

export function createSubtask({ taskId, title, description, dueDate, position }) {
  if (!taskId || !title) {
    throw new Error('taskId and title are required');
  }
  // Verify parent task exists (FK will also enforce this, but a clear 404 in the route is nicer)
  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
  if (!task) {
    throw new Error('Parent task not found');
  }
  const id = generateId();

  // Auto-position: append to end (max + 1) within the task. If position is
  // explicitly provided, use it (allows client-driven reordering).
  let pos = position;
  if (pos === undefined || pos === null) {
    const max = db.prepare(
      'SELECT MAX(position) as maxPos FROM subtasks WHERE task_id = ?'
    ).get(taskId);
    pos = (max?.maxPos ?? -1) + 1;
  }

  db.prepare(`
    INSERT INTO subtasks (id, task_id, title, description, due_date, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, taskId, title, description || null, dueDate || null, pos);

  return getSubtask(id);
}

export function updateSubtask(id, { title, description, dueDate, completed, position }) {
  const current = getSubtask(id);
  if (!current) return null;

  // Auto-manage completed_at: set when flipping 0→1, clear when 1→0.
  let completedAt = current.completed_at;
  if (completed !== undefined && Boolean(completed) !== Boolean(current.completed)) {
    completedAt = completed ? new Date().toISOString().replace('T', ' ').replace(/\..*$/, '') : null;
  }

  db.prepare(`
    UPDATE subtasks SET
      title        = ?,
      description  = ?,
      due_date     = ?,
      completed    = ?,
      completed_at = ?,
      position     = ?,
      updated_at   = datetime('now')
    WHERE id = ?
  `).run(
    title ?? current.title,
    description !== undefined ? description : current.description,
    dueDate !== undefined ? dueDate : current.due_date,
    completed !== undefined ? (completed ? 1 : 0) : current.completed,
    completedAt,
    position !== undefined ? position : current.position,
    id
  );
  return getSubtask(id);
}

export function deleteSubtask(id) {
  const result = db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Reorder subtasks. Accepts an array of subtask IDs in the desired order.
 * Reassigns positions to sequential integers (0, 1, 2, ...) to avoid
 * fractional-position collisions.
 */
export function reorderSubtasks(taskId, ids) {
  const stmt = db.prepare('UPDATE subtasks SET position = ?, updated_at = datetime(\'now\') WHERE id = ? AND task_id = ?');
  const tx = db.transaction((taskId, ids) => {
    ids.forEach((id, i) => stmt.run(i, id, taskId));
  });
  tx(taskId, ids);
  return listSubtasks(taskId);
}