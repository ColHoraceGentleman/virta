import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db.js';

const router = Router();
const attachmentsBaseDir = path.join(process.cwd(), 'data', 'attachments');

router.get('/:id/download', async (req, res) => {
  try {
    const attachment = db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(req.params.id);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found', code: 'NOT_FOUND' });
    if (!fs.existsSync(attachment.stored_path)) {
      return res.status(404).json({ error: 'File not found on disk', code: 'NOT_FOUND' });
    }
    // Path traversal guard
    const resolvedPath = path.resolve(attachment.stored_path);
    if (!resolvedPath.startsWith(attachmentsBaseDir)) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    // Sanitize filename for Content-Disposition
    const safeFilename = attachment.filename.replace(/["\r\n;/\\]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', attachment.mimetype || 'application/octet-stream');
    res.sendFile(attachment.stored_path);
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const attachment = db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(req.params.id);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found', code: 'NOT_FOUND' });
    // Delete file from disk
    if (fs.existsSync(attachment.stored_path)) {
      fs.unlinkSync(attachment.stored_path);
    }
    db.prepare('DELETE FROM task_attachments WHERE id = ?').run(req.params.id);
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;