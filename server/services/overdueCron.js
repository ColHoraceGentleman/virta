// Overdue cron for Virta Books — Phase B.
// Daily at 6AM, flips `sent` → `overdue` for past-due invoices.
// Toggled off by default; honors settings_invoices.auto_mark_overdue.
//
// Per the task spec: stays INSIDE the existing task-manager Node process.
// Uses node-cron to schedule. The scheduled job is registered ONCE at server boot,
// and the cron tick checks the settings row each time — so toggling in the
// Settings page takes effect within 24 hours without a restart.

import cron from 'node-cron';
import db from '../db.js';
import { sendInvoiceEmail } from './email.js';

const TASK_LABEL = '0 6 * * *'; // 6 AM every day

// Flip `sent` → `overdue` for any sent invoices whose due_date is in the past.
// Returns the number of invoices flipped.
export function runOverdueSweep() {
  const today = new Date().toISOString().slice(0, 10);
  const result = db.prepare(`
    UPDATE invoices
    SET status = 'overdue', updated_at = datetime('now')
    WHERE status = 'sent' AND due_date < ?
  `).run(today);
  if (result.changes > 0) {
    console.log(`[Books/OverdueCron] Flipped ${result.changes} invoice(s) sent → overdue`);
  }
  return result.changes;
}

// Send overdue notification emails for invoices that have just been flipped
// to overdue (or are still overdue and haven't had a notification sent yet).
// For Phase B v1, we send ONE email per overdue invoice on the sweep.
// v2 could track "last_notified_at" to avoid re-notifying the same one every day.
export async function runOverdueNotifications() {
  const settings = db.prepare('SELECT * FROM settings_invoices WHERE id = 1').get();
  if (!settings || !settings.auto_mark_overdue) return { sent: 0, skipped: 'disabled' };
  const messageTemplate = settings.overdue_message || 'This is a friendly reminder that invoice {number} is past due. Thanks!';

  const overdueRows = db.prepare(`
    SELECT i.*, c.email AS customer_email, c.name AS customer_name
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.status = 'overdue' AND c.email IS NOT NULL AND c.email != ''
  `).all();

  let sent = 0;
  for (const inv of overdueRows) {
    const text = messageTemplate
      .replace(/\{number\}/g, inv.number)
      .replace(/\{customer_name\}/g, inv.customer_name || '')
      .replace(/\{amount\}/g, Number(inv.total).toFixed(2))
      .replace(/\{due_date\}/g, inv.due_date);
    try {
      await sendInvoiceEmail({
        to: inv.customer_email,
        subject: `Invoice ${inv.number} is past due`,
        text,
      });
      sent++;
    } catch (e) {
      console.warn(`[Books/OverdueCron] Failed to send overdue email for ${inv.number}:`, e.message);
    }
  }
  return { sent };
}

// Wire the cron. Call once at server boot. Idempotent — guarded by a module-level flag.
let scheduled = false;
export function startOverdueCron() {
  if (scheduled) return;
  scheduled = true;
  cron.schedule(TASK_LABEL, async () => {
    try {
      const settings = db.prepare('SELECT * FROM settings_invoices WHERE id = 1').get();
      if (!settings || !settings.auto_mark_overdue) {
        // Feature disabled — silent skip.
        return;
      }
      runOverdueSweep();
      await runOverdueNotifications();
    } catch (err) {
      console.error('[Books/OverdueCron] tick failed:', err.message);
    }
  });
  console.log('[Books/OverdueCron] Scheduled — runs daily at 6 AM (auto-mark-overdue toggle honored at tick time)');
}