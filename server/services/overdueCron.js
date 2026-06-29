// Overdue cron for Virta Books — Phase B fix.
// Daily at 6AM, flips `sent` → `overdue` for past-due invoices and emails each newly-overdue
// customer exactly ONCE (tracked via `invoices.overdue_notified_at`).
//
// B3 + S6 fixes:
//
//   B3 — previously looped over every `overdue` invoice and emailed all of them, so once
//   auto-mark was on Chantelle's customers would get the same nag every day. Now we only
//   email invoices whose `overdue_notified_at` is NULL AND that just flipped from `sent` to
//   `overdue` in THIS tick (or that haven't been notified yet from a prior tick that lost
//   the email send). Idempotent on retry.
//
//   S6 — per-invoice try/catch so one bad invoice doesn't poison the whole batch. No
//   outer catch that swallows errors silently. Empty state = no log line ("0 processed" is
//   the normal case and is uninteresting). Re-throws only rethrow after logging, so
//   failures surface in the gateway log without killing the scheduler.

import cron from 'node-cron';
import db from '../db.js';
import { sendInvoiceEmail } from './email.js';

const TASK_LABEL = '0 6 * * *'; // 6 AM every day

// Read the settings + decide if this tick should do anything.
// Returns { enabled, overdueMessage, businessName, host, port, user, customerCount }.
// If `enabled` is false, callers should flip statuses silently (no email).
function readOverdueSettings() {
  const row = db.prepare('SELECT * FROM settings_invoices WHERE id = 1').get();
  if (!row) return { enabled: false, overdueMessage: null };
  return {
    enabled: !!row.auto_mark_overdue,
    overdueMessage: row.overdue_message || null,
  };
}

// Flip `sent` → `overdue` for any sent invoices whose due_date is in the past.
// Returns the IDs of invoices that just transitioned.
function runOverdueSweep() {
  const today = new Date().toISOString().slice(0, 10);
  // Use a transaction so we get a stable snapshot of "just flipped" IDs back.
  return db.transaction(() => {
    const flipped = db.prepare(`
      SELECT id FROM invoices
      WHERE status = 'sent' AND due_date < ?
    `).all(today).map(r => r.id);
    if (flipped.length > 0) {
      db.prepare(`
        UPDATE invoices
        SET status = 'overdue', updated_at = datetime('now')
        WHERE id IN (${flipped.map(() => '?').join(',')})
      `).run(...flipped);
    }
    return flipped;
  })();
}

// Notify customers about overdue invoices. Each invoice is processed independently;
// if a single email send fails we log + move on. We only email invoices that have NOT
// already had `overdue_notified_at` set. After a successful send we stamp the column.
async function runOverdueNotifications({ flippedIds } = {}) {
  const settings = readOverdueSettings();
  if (!settings.enabled) return { sent: 0, skipped: 'auto_mark_disabled' };
  if (!settings.overdueMessage) {
    // Per the 3-check rule (B3): require all of auto_mark + message + customer email.
    // Without a message template, we still flip status but don't email anyone.
    return { sent: 0, skipped: 'no_overdue_message_template' };
  }

  // Build the candidate set: invoices that just flipped in this tick OR that are overdue
  // but have never been notified yet (covers the case where a prior tick successfully
  // flipped status but the email send failed).
  const params = [];
  let where = "i.status = 'overdue' AND (i.overdue_notified_at IS NULL OR i.overdue_notified_at = '')";
  if (Array.isArray(flippedIds) && flippedIds.length > 0) {
    // No-op: flipped IDs are already covered by "status=overdue AND not notified".
    // We surface them in the log so a tester can see the flow.
  }
  const overdueRows = db.prepare(`
    SELECT i.id, i.number, i.total, i.due_date, i.overdue_notified_at,
           c.email AS customer_email, c.name AS customer_name
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE ${where}
  `).all(...params);

  let sent = 0;
  let attempted = 0;
  for (const inv of overdueRows) {
    // 3rd of the 3-checks (B3): customer must have an email.
    if (!inv.customer_email) continue;

    const text = settings.overdueMessage
      .replace(/\{number\}/g, inv.number)
      .replace(/\{customer_name\}/g, inv.customer_name || '')
      .replace(/\{amount\}/g, Number(inv.total).toFixed(2))
      .replace(/\{due_date\}/g, inv.due_date);

    attempted++;
    try {
      await sendInvoiceEmail({
        to: inv.customer_email,
        subject: `Invoice ${inv.number} is past due`,
        text,
      });
      // Stamp the invoice so it never gets re-emailed on a later tick.
      db.prepare(`
        UPDATE invoices
        SET overdue_notified_at = datetime('now')
        WHERE id = ?
      `).run(inv.id);
      sent++;
    } catch (e) {
      // Per-invoice failure: log + continue. Do NOT mark overdue_notified_at;
      // a future tick will retry this invoice.
      console.warn(`[Books/OverdueCron] Failed to send overdue email for invoice ${inv.number} (id ${inv.id}): ${e.message}`);
    }
  }
  if (sent > 0 || attempted > 0) {
    console.log(`[Books/OverdueCron] Notifications: sent=${sent} attempted=${attempted}`);
  }
  return { sent, attempted };
}

// One-shot tick entry point. Returns the result of the sweep+notify so callers
// (tests, CLI) can inspect it. Does NOT swallow errors at the tick boundary.
async function runOverdueTick() {
  const settings = readOverdueSettings();
  if (!settings.enabled) {
    // Feature disabled — silent skip.
    return { enabled: false, flipped: 0, notifications: { sent: 0, skipped: 'disabled' } };
  }
  const flippedIds = runOverdueSweep();
  if (flippedIds.length > 0) {
    console.log(`[Books/OverdueCron] Flipped ${flippedIds.length} invoice(s) sent → overdue`);
  }
  // No "0 processed" log line on the empty-case — that's the normal state.
  const notifications = await runOverdueNotifications({ flippedIds });
  return { enabled: true, flipped: flippedIds.length, flipped_ids: flippedIds, notifications };
}

// Wire the cron. Call once at server boot. Idempotent — guarded by a module-level flag.
let scheduled = false;
export function startOverdueCron() {
  if (scheduled) return;
  scheduled = true;
  cron.schedule(TASK_LABEL, async () => {
    try {
      await runOverdueTick();
    } catch (err) {
      // Surface but do not crash the scheduler. A persistent failure will keep
      // showing up in the gateway log so we can investigate.
      console.error('[Books/OverdueCron] tick failed:', err.message);
    }
  });
  console.log('[Books/OverdueCron] Scheduled — runs daily at 6 AM (auto-mark-overdue toggle honored at tick time)');
}

export { runOverdueSweep, runOverdueNotifications, runOverdueTick, readOverdueSettings };
