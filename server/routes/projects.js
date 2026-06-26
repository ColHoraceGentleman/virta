import { Router } from 'express';
import * as taskService from '../services/taskService.js';
import { broadcast } from '../services/sseService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const projects = taskService.getAllProjects();
    res.json({ data: projects });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, color, darkMode } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required', code: 'VALIDATION_ERROR' });
    const project = taskService.createProject({ name, description, color, darkMode });
    broadcast({ type: 'project_created', data: project });
    res.json({ data: project });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const project = taskService.getProjectWithDetails(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' });
    res.json({ data: project });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const project = taskService.updateProject(req.params.id, req.body);
    if (!project) return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' });
    broadcast({ type: 'project_updated', data: project });
    res.json({ data: project });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = taskService.deleteProject(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' });
    broadcast({ type: 'project_deleted', data: { id: req.params.id } });
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.post('/:id/columns', async (req, res) => {
  try {
    const { name, position } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required', code: 'VALIDATION_ERROR' });
    const column = taskService.createColumn(req.params.id, { name, position });
    broadcast({ type: 'column_created', data: column });
    res.json({ data: column });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;