// Virta Books — Phase B: Invoicing settings.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
//
// The settings_invoices table is a singleton (id = 1). This route exposes:
//   - auto_mark_overdue (boolean)
//   - overdue_message (template; supports {number}, {customer_name}, {amount}, {due_date})
//   - business_name, business_email, social_handle (used by the PDF footer + email)
//   - smtp_host, smtp_port, smtp_user, smtp_from_email, smtp_keychain_service
// The SMTP PASSWORD never lives in the DB. It's stored in macOS Keychain only,
// read at send-time via `security find-generic-password`.
// When the user sets/updates the password via this endpoint, we write it to Keychain.

import { Router } from 'express';
import db from '../../../db.js';
import { setSmtpPassword, getSmtpPassword, testSmtpConnection } from '../../../services/email.js';

const router = Router();

const ALLOWED_FIELDS = [
  'auto_mark_overdue', 'overdue_message',
  'business_name', 'business_email', 'social_handle',
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_from_email', 'smtp_keychain_service',
];

function loadSettings() {
  // Singleton row; the seed in db.js guarantees one exists.
  let row = db.prepare('SELECT * FROM settings_invoices WHERE id = 1').get();
  if (!row) {
    db.prepare('INSERT INTO settings_invoices (id) VALUES (1)').run();
    row = db.prepare('SELECT * FROM settings_invoices WHERE id = 1').get();
  }
  // Surface "smtp_configured" + whether a password is in the Keychain (without leaking it).
  // Don't actively probe Keychain on every read — that's expensive. Use a flag the
  // frontend can refresh by hitting POST /test-smtp.
  return {
    ...row,
    auto_mark_overdue: !!row.auto_mark_overdue,
    // Hide the (empty) password from the wire.
    smtp_password_set: false, // updated lazily; the frontend only needs to know "should I ask the user to type one?"
  };
}

function actuallyCheckPasswordIsSet(keychainService) {
  const pw = getSmtpPassword(keychainService);
  return !!(pw && pw.length > 0);
}

// GET /api/v1/books/settings/invoices
router.get('/', (req, res) => {
  try {
    const s = loadSettings();
    s.smtp_password_set = actuallyCheckPasswordIsSet(s.smtp_keychain_service);
    res.json({ data: s });
  } catch (err) {
    console.error('[Books/Settings/Invoices] get failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// PATCH /api/v1/books/settings/invoices
// Body: any subset of ALLOWED_FIELDS, plus optional `smtp_password` (write-only —
// stored in macOS Keychain, not echoed back).
router.patch('/', (req, res) => {
  try {
    const body = req.body || {};
    // Make sure the row exists.
    loadSettings();

    const updates = [];
    const values = [];
    for (const f of ALLOWED_FIELDS) {
      if (body[f] !== undefined) {
        if (f === 'smtp_port') {
          const port = parseInt(body[f], 10);
          if (!Number.isFinite(port) || port <= 0 || port > 65535) {
            return res.status(400).json({ error: 'smtp_port must be a valid TCP port', code: 'VALIDATION_ERROR' });
          }
          updates.push('smtp_port = ?'); values.push(port);
        } else if (f === 'auto_mark_overdue') {
          updates.push('auto_mark_overdue = ?'); values.push(body[f] ? 1 : 0);
        } else {
          updates.push(`${f} = ?`); values.push(body[f] === '' ? null : body[f]);
        }
      }
    }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      db.prepare(`UPDATE settings_invoices SET ${updates.join(', ')} WHERE id = 1`).run(...values);
    }

    // SMTP password — separate field, write to Keychain only.
    if (body.smtp_password !== undefined && body.smtp_password !== null && body.smtp_password !== '') {
      const settings = db.prepare('SELECT smtp_keychain_service FROM settings_invoices WHERE id = 1').get();
      const service = settings.smtp_keychain_service || 'com.virta.books.smtp';
      const pw = String(body.smtp_password);
      // Mirror the validator in services/email.js so we can return a clean 400 when the
      // client sent something we'd reject, vs. a 500 when the keychain CLI itself failed.
      const SHELL_UNSAFE = /[\x00-\x1f\x7f;&|<>\n\r]/;
      if (pw.length === 0 || pw.length > 256 || SHELL_UNSAFE.test(pw)) {
        return res.status(400).json({
          error: 'SMTP password contains disallowed characters (control chars, ; & | < >) or wrong length.',
          code: 'VALIDATION_ERROR',
        });
      }
      const ok = setSmtpPassword(pw, service);
      if (!ok) {
        return res.status(500).json({
          error: 'Failed to save SMTP password to macOS Keychain. Check permissions.',
          code: 'KEYCHAIN_WRITE_FAILED',
        });
      }
    }

    const s = loadSettings();
    s.smtp_password_set = actuallyCheckPasswordIsSet(s.smtp_keychain_service);
    res.json({ data: s });
  } catch (err) {
    console.error('[Books/Settings/Invoices] update failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/books/settings/invoices/test-smtp
// Tries to verify the SMTP connection with current settings + Keychain password.
// Returns { ok: true, ... } on success or { ok: false, error, code } on failure.
router.post('/test-smtp', async (req, res) => {
  try {
    const result = await testSmtpConnection();
    res.json({ data: result });
  } catch (err) {
    res.status(409).json({
      data: { ok: false },
      error: err.message,
      code: err.code || 'SMTP_TEST_FAILED',
    });
  }
});

export default router;