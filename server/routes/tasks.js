import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import db, { generateId } from '../db.js';
import * as taskService from '../services/taskService.js';
import { broadcast } from '../services/sseService.js';
import { createCalendarEvent } from '../services/calendarService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const attachmentsDir = join(__dirname, '..', '..', 'data', 'attachments');

// Ensure attachments directory exists
fs.mkdirSync(attachmentsDir, { recursive: true });

const upload = multer({
  dest: attachmentsDir,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { projectId, columnId, priority, dueBefore, search } = req.query;
    const tasks = taskService.getAllTasks({ projectId, columnId, priority, dueBefore, search });
    res.json({ data: tasks });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { columnId, title, description, dueDate, priority, assignees, categoryId, addToCalendar, calendarId } = req.body;
    if (!columnId || !title) {
      return res.status(400).json({ error: 'columnId and title are required', code: 'VALIDATION_ERROR' });
    }
    const task = taskService.createTask({ columnId, title, description, dueDate, priority, assignees, categoryId });
    broadcast({ type: 'task_created', data: task });

    // Optionally push to Google Calendar immediately (when TaskCreateModal checkbox is checked).
    // Failures here are non-fatal — the task is already created, we just skip the calendar link.
    let calendarEvent = null;
    if (addToCalendar && calendarId) {
      try {
        calendarEvent = await createCalendarEvent({
          calendarId,
          taskId: task.id,
          title: task.title,
          description: task.description || '',
          startDateTime: dueDate ? `${dueDate}T00:00:00` : new Date().toISOString().split('T')[0] + 'T00:00:00',
          allDay: true
        });
      } catch (calErr) {
        console.warn('[tasks] calendar push failed (non-fatal):', calErr.message);
      }
    }

    res.json({ data: { ...task, calendarEvent } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const task = taskService.getTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const task = taskService.updateTask(req.params.id, req.body);
    if (!task) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });
    broadcast({ type: 'task_updated', data: task });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = taskService.deleteTask(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });
    broadcast({ type: 'task_deleted', data: { id: req.params.id } });
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.patch('/:id/move', async (req, res) => {
  try {
    const { columnId, position } = req.body;
    if (!columnId || position === undefined) {
      return res.status(400).json({ error: 'columnId and position are required', code: 'VALIDATION_ERROR' });
    }
    const task = taskService.moveTask(req.params.id, { columnId, position });
    if (!task) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });
    broadcast({ type: 'task_moved', data: task });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.get('/:taskId/notes', async (req, res) => {
  try {
    const notes = taskService.getTaskNotes(req.params.taskId);
    res.json({ data: notes });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.post('/:taskId/notes', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'content is required', code: 'VALIDATION_ERROR' });
    }
    const note = taskService.addTaskNote(req.params.taskId, { content });
    broadcast({ type: 'note_added', data: note });
    res.json({ data: note });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// Attachment routes
router.post('/:taskId/attachments', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded', code: 'VALIDATION_ERROR' });
    const id = generateId();
    // Move to task-specific subfolder
    const taskDir = path.join(attachmentsDir, req.params.taskId);
    fs.mkdirSync(taskDir, { recursive: true });
    const storedPath = path.join(taskDir, `${id}-${req.file.originalname}`);
    fs.renameSync(req.file.path, storedPath);
    // Sanitize filename for safe storage and Header use
    const safeFilename = req.file.originalname.replace(/["\r\n;/\\]/g, '_');
    db.prepare(
      'INSERT INTO task_attachments (id, task_id, filename, mimetype, size_bytes, stored_path) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, req.params.taskId, safeFilename, req.file.mimetype, req.file.size, storedPath);
    const attachment = db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(id);
    broadcast({ type: 'attachment_added', data: { taskId: req.params.taskId, attachment } });
    res.json({ data: attachment });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.get('/:taskId/attachments', async (req, res) => {
  try {
    const attachments = db.prepare('SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC').all(req.params.taskId);
    res.json({ data: attachments });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;