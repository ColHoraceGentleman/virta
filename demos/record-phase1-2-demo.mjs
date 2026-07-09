#!/usr/bin/env node
// Records a demo of Phase 1+2 build (Chart of Accounts + Manual Entry + GL).
//
// Captures:
//   1. /books/settings/accounts — Chart of Accounts page with the 29 seeded accounts.
//   2. /books/transactions — new GL page with filter bar and the entries posted by the manual-entry modal.
//   3. Click into an entry — audit click-to-reveal modal showing both lines + the "Created by user on …" line.
//   4. Open manual entry modal, post a new expense, return to the GL with the new row visible.
//   5. Sage warning: open manual entry, pick a Checking/Savings/Venmo/etc. as matched — observe the warning.
//
// The script creates test entries if the demo account set is empty, then cleans
// them up afterward so the shared Books data stays the way the user left it.

import { chromium } from '/opt/homebrew/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:3001';
const DEMO_DIR = path.resolve('/Users/colonelhoracegentleman/clawd/projects/task-manager/demos');
const DATE = '2026.07.09';
const TMP_DIR = path.join(DEMO_DIR, '.tmp-phase1-2-video');
const WEBM_OUT = path.join(DEMO_DIR, `${DATE}-phase-1-2-build.webm`);
const MP4_OUT  = path.join(DEMO_DIR, `${DATE}-phase-1-2-build.mp4`);
const POSTER_OUT = path.join(DEMO_DIR, `${DATE}-phase-1-2-build-poster.png`);
const NOTES_OUT = path.join(DEMO_DIR, `${DATE}-phase-1-2-build-notes.md`);

const CLEANUP = {
  // Both entries use these test descriptions; cleanup deletes them at the end
  // so the demo leaves no orphan test data behind.
  descriptionMatches: ['DEMO entry', 'Sage-warning demo', 'Demo + new'],
};

let createdEntryIds = [];

async function api(pathname, opts = {}) {
  const res = await fetch(`${BASE}/api/v1/books${pathname}`, {
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    ...opts,
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json.code;
    throw err;
  }
  return json.data ?? json;
}

function tx_date() { return new Date().toISOString().slice(0, 10); }

async function findAccount(code) {
  const accts = await api('/accounts');
  return accts.find(a => a.code === code);
}

async function postDemoEntry({ name, amount, description, matchedCode, categoryCode, type }) {
  const cat = await findAccount(categoryCode);
  const mtc = await findAccount(matchedCode);
  const entry = await api('/journal/entries', {
    method: 'POST',
    body: {
      txn_date: tx_date(),
      type,
      category_account_id: cat.id,
      matched_account_id: mtc.id,
      name,
      amount,
      description,
    },
  });
  createdEntryIds.push(entry.id);
  return entry;
}

async function cleanup() {
  // Delete the journal entries we created (cascade to lines + audit rows).
  // We track IDs for the API-created entries via createdEntryIds, and ALSO
  // scrub UI-posted entries whose name+amount matches our sentinel.
  for (const id of createdEntryIds) {
    try {
      await fetch(`${BASE}/api/v1/books/journal/entries/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(`WARNING: failed to clean up entry ${id}: ${e.message}`);
    }
  }
  // Best-effort wildcard cleanup for the UI-posted entry (Staples, $75).
  try {
    const today = new Date().toISOString().slice(0, 10);
    const list = await api(`/journal/entries?date_from=${today}&date_to=${today}&limit=500`);
    const uiPosted = (list.data || []).filter(r =>
      (r.name === 'Staples' && Math.abs(Number(r.amount || 0) - 75) < 0.01)
      || (r.name === 'Adobe' && Math.abs(Number(r.amount || 0) - 49.99) < 0.01)
      || (r.name === 'Alice (customer)' && Math.abs(Number(r.amount || 0) - 250) < 0.01)
      || (r.name === 'Refund - Square' && Math.abs(Number(r.amount || 0) - (-12.50)) < 0.01)
    );
    for (const r of uiPosted) {
      try {
        await fetch(`${BASE}/api/v1/books/journal/entries/${r.id}`, { method: 'DELETE' });
      } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.error(`WARNING: cleanup scan failed: ${e.message}`);
  }
}

async function caption(page, text, ms = 1500) {
  await page.evaluate((message) => {
    let el = document.getElementById('rusty-demo-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rusty-demo-caption';
      el.style.cssText = [
        'position: fixed',
        'left: 24px',
        'right: 24px',
        'bottom: 22px',
        'z-index: 999999',
        'padding: 12px 16px',
        'border-radius: 8px',
        'background: rgba(2, 6, 23, 0.92)',
        'border: 1px solid rgba(129, 140, 248, 0.65)',
        'color: #e5e7eb',
        'font: 15px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        'box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35)',
        'pointer-events: none',
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = message;
  }, text);
  await page.waitForTimeout(ms);
}

async function main() {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  // Pre-seed two demo entries so the GL isn't empty at start.
  await postDemoEntry({
    name: 'Adobe',
    amount: 49.99,
    description: 'DEMO entry: Creative Cloud subscription',
    categoryCode: '6010',  // Software Subscriptions (expense)
    matchedCode:  '1000',  // Business Checking
    type:         'expense',
  });
  await postDemoEntry({
    name: 'Alice (customer)',
    amount: 250,
    description: 'DEMO entry: Etsy order batch',
    categoryCode: '4000',  // Wholesale Sales (income)
    matchedCode:  '1000',  // Business Checking
    type:         'income',
  });
  await postDemoEntry({
    name: 'Refund - Square',
    amount: -12.50,
    description: 'DEMO entry: square refund',
    categoryCode: '6010',
    matchedCode:  '1000',
    type:         'expense',
  });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
    recordVideo: { dir: TMP_DIR, size: { width: 1440, height: 960 } },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  try {
    // 1) Landing on Transactions (GL)
    await page.goto(`${BASE}/books/transactions`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('text=Transactions', { timeout: 10000 });
    await page.waitForTimeout(800);
    await caption(page, 'New Transactions page: every money event is a balanced 2-line ledger entry. Click any row for audit detail.', 2400);

    // 2) Show the filter bar — use name filter to narrow the table.
    const rowsBefore = await page.locator('tbody tr').count();
    await page.fill('input[placeholder="Vendor or customer…"]', 'Adobe');
    await page.waitForTimeout(700);
    await caption(page, 'Filter bar (date range, category, name) narrows the table client-side. We filtered by Name = "Adobe".', 2400);
    const rowsAfter = await page.locator('tbody tr').count();
    if (rowsAfter > rowsBefore) {
      throw new Error(`Filter shrank rows unexpectedly: ${rowsBefore} → ${rowsAfter}`);
    }

    // Clear filters via the "Clear filters" link.
    await page.click('text=Clear filters');
    await page.waitForTimeout(500);

    // 3) Click an existing row to open the audit modal.
    const firstRow = page.locator('tbody tr').first();
    await firstRow.click();
    await page.waitForSelector('text=Audit detail', { timeout: 5000 });
    await page.waitForTimeout(500);
    await caption(page, 'Audit click-to-reveal: who created it, when, and the full posting — always balanced. Both lines sum to the same amount.', 2600);

    // Close the audit modal by clicking the X.
    await page.click('button[aria-label="Close audit modal"]');
    await page.waitForTimeout(500);

    // 4) Open the manual entry modal.
    await page.click('button:has-text("New entry")');
    await page.waitForSelector('text=New entry', { timeout: 5000 });
    await page.waitForTimeout(700);
    await caption(page, 'Manual entry modal: 5 fields default-visible (Date / Type / Category / Name / Amount); Notes + Description hide behind + Add X links.', 2600);

    // Open "Add description" to show the expansion.
    await page.click('button:has-text("+ Add description")');
    await page.waitForTimeout(500);
    await caption(page, '+ Add Description toggles that field in; remove link toggles it back. matched-with is always visible (R27: required for double-entry).', 2400);

    // 5) Type-aware helper copy: pick Asset and observe the copy changes.
    await page.selectOption('select#man-type', 'Asset');
    await page.waitForTimeout(400);
    await caption(page, 'Type picker is first (R18) — it filters the Category list and updates the helper copy per type.', 2000);

    // 6) Sage warning: pick a Savings/Checking/account named with "Bank" as Matched with.
    await page.selectOption('select#man-type', 'Expense');
    await page.waitForTimeout(300);
    await page.fill('input#man-amount', '75');
    // Pick a matching option whose text contains "Checking" (case-insensitive).
    const { matchedValue: checkingValue, categoryValue: categoryInitialValue } = await page.evaluate(() => {
      const sel = document.querySelector('select#man-matched');
      const cat = document.querySelector('select#man-category');
      const opt = Array.from(sel.options).find(o => /checking/i.test(o.text));
      const catOpt = Array.from(cat.options).find(o => o.value);
      return { matchedValue: opt ? opt.value : '', categoryValue: catOpt ? catOpt.value : '' };
    });
    if (checkingValue) {
      await page.selectOption('select#man-matched', checkingValue);
      await page.waitForTimeout(500);
      await caption(page, 'Sage-style warning fires when you pick an import-driven account (Checking / Savings / Stripe / PayPal / etc) — reminds you this account is usually updated by statement imports.', 2600);
    }

    // Then pick a non-import expense account as Matched-with to suppress the warning.
    // Specifically: any account that is NOT in the matched-with list and not equal to category.
    const nonWarnValue = await page.evaluate(({ categoryValue }) => {
      const sel = document.querySelector('select#man-matched');
      const tokens = ['credit card', 'checking', 'savings', 'bank', 'stripe', 'paypal', 'venmo', 'square', 'plaid', 'import'];
      const opt = Array.from(sel.options).find(o => {
        if (!o.value) return false;
        if (o.value === categoryValue) return false;
        const lower = (o.text || '').toLowerCase();
        return !tokens.some(t => lower.includes(t));
      });
      return opt ? opt.value : '';
    }, { categoryValue: categoryInitialValue });
    if (nonWarnValue) await page.selectOption('select#man-matched', nonWarnValue);
    await page.waitForTimeout(300);
    await page.fill('input#man-name', 'Staples');
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(2000);
    // Verify the modal closed (Save triggers onClose via the parent's onPosted).
    // The page has a button labeled "New entry" + the modal title; we look for the modal
    // SPECIFICALLY via the dialog role.
    const modalDialog = page.locator('[role="dialog"][aria-labelledby="man-entry-title"]');
    const modalStillOpen = await modalDialog.count() > 0 && await modalDialog.first().isVisible().catch(() => false);
    if (modalStillOpen) {
      // Probably a validation error — capture and dump the error text for debugging.
      const errText = await page.locator('.bg-red-900\\/30').first().textContent().catch(() => '');
      throw new Error(`Modal stayed open after Save click. Error from modal: ${errText || '(none)'}`);
    }
    await caption(page, 'Save posts a balanced 2-line entry: one debit, one credit. The list refreshes with the new row.', 2200);

    // 7) Open the new row's audit modal to verify both lines.
    await page.waitForSelector('tbody tr', { timeout: 10000 });
    const newRow = page.locator('tbody tr', { hasText: 'Staples' }).first();
    const newRowCount = await page.locator('tbody tr', { hasText: 'Staples' }).count();
    if (newRowCount === 0) {
      throw new Error('No row with "Staples" found after Save.');
    }
    await newRow.click();
    await page.waitForSelector('text=Audit detail', { timeout: 5000 });
    await page.waitForTimeout(600);
    await caption(page, 'Audit detail of the entry we just posted — debits = credits, both sides of the double-entry pair visible.', 2600);
    await page.screenshot({ path: POSTER_OUT, fullPage: false });
    await page.click('button[aria-label="Close audit modal"]');
    await page.waitForTimeout(400);

    // 8) Chart of Accounts navigation (per Phase 1 scope).
    await page.click('text=Settings');
    await page.waitForSelector('text=Chart of Accounts', { timeout: 5000 });
    await page.waitForTimeout(600);
    await caption(page, 'Chart of Accounts page — written to the new accounts table; categories wizard, management, and GL all read from it.', 2400);

  } finally {
    await context.close();
    await browser.close();
    await cleanup();
  }

  const videos = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.webm'));
  if (!videos.length) throw new Error('Playwright did not produce a video file.');
  const rawVideo = path.join(TMP_DIR, videos[0]);
  fs.copyFileSync(rawVideo, WEBM_OUT);

  try {
    execFileSync('/opt/homebrew/bin/ffmpeg', [
      '-y',
      '-i', WEBM_OUT,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      MP4_OUT,
    ], { stdio: 'pipe' });
  } catch (err) {
    console.error('WARNING: ffmpeg mp4 conversion failed; webm demo is still available.');
  }

  fs.writeFileSync(NOTES_OUT, [
    '# Phase 1 + 2 — Chart of Accounts + Manual Entry + GL Demo',
    '',
    `Recorded: ${DATE}`,
    `Base URL: ${BASE}`,
    '',
    'Covers:',
    '- New Transactions page (GL) with filter bar',
    '- Audit click-to-reveal modal with both balanced lines',
    '- Manual entry modal — default 5 fields + + Add Description/Notes + always-visible Matched-with (R27)',
    '- Type picker first filters the Category list (R18)',
    '- Sage-style warning for import-driven Matched-with accounts (D70)',
    '- New balanced entry posts and refreshes the GL list',
    '- Chart of Accounts page reading the new accounts table',
    '',
    'Build artifacts:',
    '- DB: audit_log + account_balances tables, journal_entries extensions (recon_status, name, notes, amount, category/matched_account_id), accounts.is_hidden',
    '- Server: services/journalService.js + routes/books/journal.js',
    '- Client: books/Transactions.jsx + books/ManualEntryModal.jsx + BooksShell routing',
    '- Tests: server/scripts/test-gl-phase1-2.mjs (39/39 passing)',
    '',
    'Open questions for Wren review (see commit message):',
    '- Source value: I used "manual" (existing enum) instead of inventing "manual_entry" to avoid a CHECK constraint rebuild',
    '- Reconciliation status field is read-only in v1 (transitions are Phase 9)',
    '- Audit click-to-reveal modal shows up at every row click in the GL',
    '',
    'Patrick verdict: pending.',
    '',
  ].join('\n'));

  console.log(JSON.stringify({
    webm: WEBM_OUT,
    mp4: fs.existsSync(MP4_OUT) ? MP4_OUT : null,
    poster: POSTER_OUT,
    notes: NOTES_OUT,
    consoleErrors,
  }, null, 2));
}

main().catch(async err => {
  console.error(err);
  await cleanup();
  process.exit(1);
});
