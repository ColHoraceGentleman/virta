import { Router } from 'express';
import * as taskService from '../services/taskService.js';
import { broadcast } from '../services/sseService.js';

const router = Router();

router.delete('/:id', async (req, res) => {
  try {
    const deleted = taskService.deleteNote(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Note not found', code: 'NOT_FOUND' });
    broadcast({ type: 'note_deleted', data: { id: req.params.id } });
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;