import { Router } from 'express';
import { getUnreadEmails, markAsRead, getEmailSummary } from '../services/gmailService.js';

const router = Router();

// GET /api/v1/gmail/summary
router.get('/summary', async (req, res) => {
  try {
    const summary = await getEmailSummary();
    if (!summary) return res.status(401).json({ error: 'Gmail not authorized', code: 'NOT_AUTHORIZED' });
    res.json({ data: summary });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'GMAIL_ERROR' });
  }
});

// GET /api/v1/gmail/unread
router.get('/unread', async (req, res) => {
  try {
    const maxResults = Math.min(parseInt(req.query.maxResults) || 20, 50);
    const emails = await getUnreadEmails(maxResults);
    res.json({ data: emails, count: emails.length });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'GMAIL_ERROR' });
  }
});

// POST /api/v1/gmail/:messageId/read
router.post('/:messageId/read', async (req, res) => {
  try {
    await markAsRead(req.params.messageId);
    res.json({ data: { marked: true } });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'GMAIL_ERROR' });
  }
});

export default router;
