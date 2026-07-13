// Virta Books — Setup Wizard Foundation (B2a-prime)
// Business REST endpoints.
//
// Routes (mounted at /api/v1/books/businesses):
//   GET   /current         → the singleton business row (or 404)
//   POST  /                → create the business row (201)
//   PATCH /current         → partial update
//
// Envelope convention matches the rest of booksApi: { data } / { error, code }.

import { Router } from 'express';
import {
  getCurrentBusiness,
  createBusiness,
  updateBusiness,
} from '../../services/businessService.js';

const router = Router();

router.get('/current', (req, res) => {
  try {
    const biz = getCurrentBusiness();
    if (!biz) {
      return res.status(404).json({ error: 'No business configured', code: 'NOT_FOUND' });
    }
    res.json({ data: biz });
  } catch (err) {
    console.error('[Books/Businesses] getCurrent failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.post('/', (req, res) => {
  try {
    const biz = createBusiness(req.body || {});
    res.status(201).json({ data: biz });
  } catch (err) {
    const msg = String(err && err.message || '');
    const isValidation = /required|invalid|must be|must match/i.test(msg);
    if (isValidation) {
      return res.status(400).json({ error: msg, code: 'VALIDATION_ERROR' });
    }
    console.error('[Books/Businesses] create failed', err);
    res.status(500).json({ error: msg, code: 'SERVER_ERROR' });
  }
});

router.patch('/current', (req, res) => {
  try {
    const current = getCurrentBusiness();
    if (!current) {
      return res.status(404).json({ error: 'No business configured', code: 'NOT_FOUND' });
    }
    const biz = updateBusiness(current.id, req.body || {});
    res.json({ data: biz });
  } catch (err) {
    const msg = String(err && err.message || '');
    if (/not found/i.test(msg)) {
      return res.status(404).json({ error: msg, code: 'NOT_FOUND' });
    }
    const isValidation = /required|invalid|must be|must match/i.test(msg);
    if (isValidation) {
      return res.status(400).json({ error: msg, code: 'VALIDATION_ERROR' });
    }
    console.error('[Books/Businesses] update failed', err);
    res.status(500).json({ error: msg, code: 'SERVER_ERROR' });
  }
});

export default router;