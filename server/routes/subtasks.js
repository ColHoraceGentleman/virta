import { Router } from 'express';
import * as subtaskService from '../services/subtaskService.js';
import { broadcast } from '../services/sseService.js';

const router = Router({ mergeParams: true });

// GET /api/v1/tasks/:taskId/subtasks — list all subtasks for a parent task
router.get('/tasks/:taskId/subtasks', (req, res) => {
  try {
    const subtasks = subtaskService.listSubtasks(req.params.taskId);
    res.json({ data: subtasks });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/tasks/:taskId/subtasks — create a new subtask
router.post('/tasks/:taskId/subtasks', (req, res) => {
  try {
    const { title, description, dueDate, position } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'title is required', code: 'VALIDATION_ERROR' });
    }
    const subtask = subtaskService.createSubtask({
      taskId: req.params.taskId,
      title,
      description,
      dueDate,
      position
    });
    broadcast({ type: 'subtask_created', data: subtask });
    res.json({ data: subtask });
  } catch (err) {
    if (err.message === 'Parent task not found') {
      return res.status(404).json({ error: err.message, code: 'NOT_FOUND' });
    }
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/tasks/:taskId/subtasks/reorder — reorder subtasks within a task
// Body: { ids: ["id1", "id2", ...] } in desired order
router.post('/tasks/:taskId/subtasks/reorder', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids must be an array', code: 'VALIDATION_ERROR' });
    }
    const subtasks = subtaskService.reorderSubtasks(req.params.taskId, ids);
    broadcast({ type: 'subtasks_reordered', data: { taskId: req.params.taskId, subtasks } });
    res.json({ data: subtasks });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// PATCH /api/v1/subtasks/:id — update a subtask
router.patch('/subtasks/:id', (req, res) => {
  try {
    const subtask = subtaskService.updateSubtask(req.params.id, req.body);
    if (!subtask) return res.status(404).json({ error: 'Subtask not found', code: 'NOT_FOUND' });
    broadcast({ type: 'subtask_updated', data: subtask });
    res.json({ data: subtask });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// DELETE /api/v1/subtasks/:id — delete a subtask
router.delete('/subtasks/:id', (req, res) => {
  try {
    const deleted = subtaskService.deleteSubtask(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Subtask not found', code: 'NOT_FOUND' });
    broadcast({ type: 'subtask_deleted', data: { id: req.params.id } });
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;