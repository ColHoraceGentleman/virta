// Email service for Virta Books — Phase B.
// Sends invoices and overdue notices via nodemailer direct SMTP.
// SMTP credentials live in macOS Keychain (NOT env vars, NOT the DB).
// The DB stores host/port/user/from_email + a "keychain service" label;
// the password is fetched on-demand via `security find-generic-password`.

import { execFileSync } from 'child_process';
import nodemailer from 'nodemailer';
import db from '../db.js';

const DEFAULT_KEYCHAIN_SERVICE = 'com.virta.books.smtp';

// Validate the SMTP password before it touches any shell / disk path.
// The `security` CLI is invoked via execFile (args array, shell:false) so it never sees a
// shell interpreter, so strictly speaking a password can contain almost anything. We still
// restrict the input because:
//
//  1. App passwords for Gmail / Outlook etc. are ASCII-printable by convention.
//  2. Some characters could break keychain round-trips on certain macOS versions or get
//     corrupted when pasted into log lines / PDFs / emails.
//  3. Defense in depth against future code regressions that don't pass argv-safe.
//
// Rejected: control chars (0x00-0x1F, 0x7F), and shell metacharacters ; & | > <
// (the ones most likely to cause a problem if any future caller regresses to execSync).
// Allowed: any other character including " ' $ ` \ space. Length 1..256.
function isValidSmtpPassword(pw) {
  if (typeof pw !== 'string') return false;
  if (pw.length === 0 || pw.length > 256) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\x00-\x1f\x7f;&|<>\n\r]/.test(pw);
}

// Validate the keychain service label (a domain-reversed identifier like com.virta.books.smtp).
// We also gate the read path so a caller can't smuggle weird input through this parameter.
// eslint-disable-next-line no-useless-escape
const KEYCHAIN_SERVICE_RE = /^[A-Za-z0-9._-]{1,128}$/;
function isValidKeychainService(s) {
  return typeof s === 'string' && KEYCHAIN_SERVICE_RE.test(s);
}

// Fetch the SMTP password from the macOS Keychain.
// Returns null if not found OR if Keychain is unavailable (e.g. CI / headless).
// We do NOT cache the password in memory between calls — each send reads fresh,
// so changing the password in the Keychain doesn't require a server restart.
//
// SECURITY (B1 fix): invocation goes through execFile (args array, shell:false). The keychain
// service name is validated as a domain-reversed identifier; if a caller ever plumbs a
// user-controlled value here we still won't pass it through a shell.
export function getSmtpPassword(keychainService = DEFAULT_KEYCHAIN_SERVICE) {
  try {
    if (!isValidKeychainService(keychainService)) return null;
    const out = execFileSync(
      'security',
      ['find-generic-password', '-s', keychainService, '-w'],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return out.trim();
  } catch (e) {
    return null;
  }
}

// Save the SMTP password to the macOS Keychain. Overwrites if it already exists.
//
// SECURITY (B1 fix): the password NEVER touches a shell interpreter. We invoke
// `security add-generic-password ... -w <password>` via execFile with args array
// (`shell:false` semantics — Node passes argv directly to execve, no /bin/sh involved).
// The password is also validated against isValidSmtpPassword first; this is defense in
// depth that also stops buggy callers from writing junk that round-trips badly.
export function setSmtpPassword(password, keychainService = DEFAULT_KEYCHAIN_SERVICE) {
  if (!isValidSmtpPassword(password)) {
    console.error('[Books/Email] Refusing to save SMTP password: contains disallowed characters or wrong type');
    return false;
  }
  if (!isValidKeychainService(keychainService)) {
    console.error('[Books/Email] Refusing to save SMTP password: invalid keychain service name');
    return false;
  }
  try {
    // Try delete first (overwrite semantics). Ignore failure — the entry may not exist yet.
    try {
      execFileSync(
        'security',
        ['delete-generic-password', '-s', keychainService],
        { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch { /* entry didn't exist yet */ }

    execFileSync(
      'security',
      ['add-generic-password', '-s', keychainService, '-a', 'smtp', '-w', password, '-U'],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }
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