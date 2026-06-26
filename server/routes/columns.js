import { Router } from 'express';
import * as taskService from '../services/taskService.js';
import { broadcast } from '../services/sseService.js';

const router = Router();

router.patch('/:id', async (req, res) => {
  try {
    const column = taskService.updateColumn(req.params.id, req.body);
    if (!column) return res.status(404).json({ error: 'Column not found', code: 'NOT_FOUND' });
    broadcast({ type: 'column_updated', data: column });
    res.json({ data: column });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = taskService.deleteColumn(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Column not found', code: 'NOT_FOUND' });
    broadcast({ type: 'column_deleted', data: { id: req.params.id } });
    res.json({ data: { success: true } });
  } catch (err) {
    if (err.message.includes('last column')) {
      return res.status(400).json({ error: err.message, code: 'LAST_COLUMN' });
    }
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;