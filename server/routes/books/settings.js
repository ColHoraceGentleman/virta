// Virta Books — Setup Wizard Foundation (B2a-prime)
// Per-business settings REST endpoints.
//
// Routes (mounted at /api/v1/books/settings):
//   GET  /          → all settings for the current business as { data: { key: value } }
//   PUT  /:key      → upsert one setting; body is { value }
//   GET  /:key      → one setting as { data: { key, value } } or 404
//
// Settings are scoped to the current business (the singleton row from the
// businesses router). If no business row exists, GET / returns an empty map
// (idempotent — the wizard hasn't been run yet) and PUT /:key 404s.

import { Router } from 'express';
import {
  getCurrentBusiness,
  getSettings,
  getSetting,
  updateSetting,
} from '../../services/businessService.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const biz = getCurrentBusiness();
    if (!biz) {
      // No business yet — return an empty map rather than 404. The wizard
      // hasn't been run; settings will attach once the user completes it.
      return res.json({ data: {} });
    }
    res.json({ data: getSettings(biz.id) });
  } catch (err) {
    console.error('[Books/Settings] list failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.put('/:key', (req, res) => {
  try {
    const biz = getCurrentBusiness();
    if (!biz) {
      return res.status(404).json({ error: 'No business configured', code: 'NOT_FOUND' });
    }
    const { key } = req.params;
    const body = req.body;
    // Reject missing/empty body — silently creating a key with value:null is a footgun.
    // Explicit { value: null } is allowed (clears the setting); undefined means no body at all.
    if (body === undefined || body === null) {
      return res.status(400).json({ error: 'Request body is required (expected { value })', code: 'VALIDATION_ERROR' });
    }
    if (!Object.prototype.hasOwnProperty.call(body, 'value')) {
      return res.status(400).json({ error: 'Request body must include a "value" field', code: 'VALIDATION_ERROR' });
    }
    const { value } = body;
    const row = updateSetting(biz.id, key, value);
    res.json({ data: row });
  } catch (err) {
    console.error('[Books/Settings] upsert failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

router.get('/:key', (req, res) => {
  try {
    const biz = getCurrentBusiness();
    if (!biz) {
      return res.status(404).json({ error: 'No business configured', code: 'NOT_FOUND' });
    }
    const row = getSetting(biz.id, req.params.key);
    if (!row) {
      return res.status(404).json({ error: `Setting not found: ${req.params.key}`, code: 'NOT_FOUND' });
    }
    res.json({ data: row });
  } catch (err) {
    console.error('[Books/Settings] get failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

export default router;