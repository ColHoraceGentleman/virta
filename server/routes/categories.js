import { Router } from 'express';
import db, { generateId } from '../db.js';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../services/taskService.js';
import { broadcast } from '../services/sseService.js';

const router = Router();

router.get('/:id', async (req, res) => {
  try {
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found', code: 'NOT_FOUND' });
    res.json({ data: category });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.get('/', async (req, res) => {
  try {
    const projectId = req.query.projectId || null;
    const categories = getCategories(projectId);
    res.json({ data: categories });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, color, projectId } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' });
    const category = createCategory({ name, color, projectId });
    res.json({ data: category });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Category name already exists', code: 'CONFLICT' });
    }
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const category = updateCategory(req.params.id, req.body);
    if (!category) return res.status(404).json({ error: 'Category not found', code: 'NOT_FOUND' });
    broadcast({ type: 'category_updated', data: category });
    res.json({ data: category });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Category name already exists', code: 'CONFLICT' });
    }
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = deleteCategory(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Category not found', code: 'NOT_FOUND' });
    broadcast({ type: 'category_deleted', data: { id: req.params.id } });
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;