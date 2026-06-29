// Email service for Virta Books — Phase B.
// Sends invoices and overdue notices via nodemailer direct SMTP.
// SMTP credentials live in macOS Keychain (NOT env vars, NOT the DB).
// The DB stores host/port/user/from_email + a "keychain service" label;
// the password is fetched on-demand via `security find-generic-password`.

import { execSync } from 'child_process';
import nodemailer from 'nodemailer';
import db from '../db.js';

const DEFAULT_KEYCHAIN_SERVICE = 'com.virta.books.smtp';

// Fetch the SMTP password from the macOS Keychain.
// Returns null if not found OR if Keychain is unavailable (e.g. CI / headless).
// We do NOT cache the password in memory between calls — each send reads fresh,
// so changing the password in the Keychain doesn't require a server restart.
export function getSmtpPassword(keychainService = DEFAULT_KEYCHAIN_SERVICE) {
  try {
    const out = execSync(
      `security find-generic-password -s "${keychainService}" -w 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return out.trim();
  } catch (e) {
    return null;
  }
}

// Save the SMTP password to the macOS Keychain. Overwrites if it already exists.
export function setSmtpPassword(password, keychainService = DEFAULT_KEYCHAIN_SERVICE) {
  try {
    // Try update first; if that fails, add.
    try {
      execSync(
        `security delete-generic-password -s "${keychainService}" 2>/dev/null`,
        { encoding: 'utf8', timeout: 5000 }
      );
    } catch { /* didn't exist */ }
    execSync(
      `security add-generic-password -s "${keychainService}" -a "smtp" -w "${String(password).replace(/"/g, '\\"')}" -U`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return true;
  } catch (e) {
    console.error('[Books/Email] Failed to save password to Keychain:', e.message);
    return false;
  }
}

// Read the SMTP settings row (singleton, id = 1). Returns null if DB row missing.
export function getSmtpSettings() {
  const row = db.prepare('SELECT * FROM settings_invoices WHERE id = 1').get();
  if (!row) return null;
  return {
    host: row.smtp_host,
    port: row.smtp_port,
    user: row.smtp_user,
    from_email: row.smtp_from_email || row.smtp_user,
    keychain_service: row.smtp_keychain_service || DEFAULT_KEYCHAIN_SERVICE,
  };
}

export function isSmtpConfigured() {
  const s = getSmtpSettings();
  if (!s || !s.host || !s.port || !s.user) return false;
  // Password check is deferred to send time (avoids Keychain touch on every read).
  return true;
}

// Build a nodemailer transporter from current settings + Keychain password.
// Throws if any required piece is missing.
function buildTransporter() {
  const s = getSmtpSettings();
  if (!s || !s.host || !s.port || !s.user) {
    const err = new Error('SMTP is not configured. Open Settings → Invoices → Email.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }
  const password = getSmtpPassword(s.keychain_service);
  if (!password) {
    const err = new Error(
      `SMTP password not found in macOS Keychain under service "${s.keychain_service}". Re-save it from Settings → Invoices → Email.`
    );
    err.code = 'SMTP_PASSWORD_MISSING';
    throw err;
  }
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465, // SMTPS on 465, STARTTLS on 587
    auth: { user: s.user, pass: password },
  });
}

// Send an email with the PDF attached.
// args: { to, subject, text, html?, pdf?: { filename, content (Buffer) } }
// Returns { messageId } on success. Throws on failure.
export async function sendInvoiceEmail({ to, subject, text, html, pdf }) {
  const transporter = buildTransporter();
  const s = getSmtpSettings();
  const from = s.from_email || s.user;
  const opts = {
    from,
    to,
    subject,
    text,
  };
  if (html) opts.html = html;
  if (pdf) opts.attachments = [{ filename: pdf.filename, content: pdf.content }];
  const info = await transporter.sendMail(opts);
  return { messageId: info.messageId };
}

// Quick SMTP connectivity test (for the Settings page).
// Returns { ok: true, host, port } on success; throws on failure.
export async function testSmtpConnection() {
  const transporter = buildTransporter();
  const s = getSmtpSettings();
  await transporter.verify();
  return { ok: true, host: s.host, port: s.port, user: s.user };
}