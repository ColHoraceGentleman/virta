#!/usr/bin/env node
// Records a silent E.2 reconciliation demo with Playwright's video capture.
// The script creates a temporary draft reconciliation only if the selected
// account has no open draft, then cancels that draft before exiting.

import { chromium } from '/opt/homebrew/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:3001';
const DEMO_DIR = path.resolve('/Users/colonelhoracegentleman/clawd/projects/task-manager/demos');
const TMP_DIR = path.join(DEMO_DIR, '.tmp-e2-video');
const WEBM_OUT = path.join(DEMO_DIR, '2026.07.07-E2-reconcile.webm');
const MP4_OUT = path.join(DEMO_DIR, '2026.07.07-E2-reconcile.mp4');
const POSTER_OUT = path.join(DEMO_DIR, '2026.07.07-E2-reconcile-poster.png');
const NOTES_OUT = path.join(DEMO_DIR, '2026.07.07-E2-reconcile-notes.md');
const AS_OF_DATE = '2026-12-31';

let createdDraftId = null;
let preexistingDraftId = null;

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

async function getReconList() {
  return api('/reconcile');
}

async function cleanupDraft() {
  if (!createdDraftId) return;
  try {
    await api(`/reconcile/${createdDraftId}`, { method: 'DELETE' });
    console.log(`Cleaned up temporary draft ${createdDraftId}`);
  } catch (err) {
    console.error(`WARNING: failed to clean up temporary draft ${createdDraftId}: ${err.message}`);
  }
}

async function caption(page, text, ms = 1400) {
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

  const accounts = await getReconList();
  const account = accounts.find(a => a.account_code === '2000')
    || accounts.find(a => a.account_type === 'liability')
    || accounts[0];
  if (!account) throw new Error('No reconciliation accounts found.');
  preexistingDraftId = account.open_reconciliation?.id || null;

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
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  try {
    await page.goto(`${BASE}/books/reconcile`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('text=Reconcile', { timeout: 10000 });
    await caption(page, 'E.2 reconciliation starts with an account list: status, stale flag, prior balance, and a per-account Reconcile action.', 2300);

    await page.locator('tr', { hasText: account.account_name }).locator('button', { hasText: 'Reconcile' }).click();
    await page.waitForURL(`**/books/reconcile/${account.account_id}`, { timeout: 10000 });
    await page.waitForTimeout(700);
    await caption(page, `Account gate for ${account.account_code} ${account.account_name}: as-of-date replaces the old calendar-month model.`, 2200);

    if (preexistingDraftId) {
      await caption(page, 'This account already had an open draft, so the demo uses it without deleting existing work.', 1700);
    } else {
      await page.locator('input[type="date"]').fill(AS_OF_DATE);
      await caption(page, 'Starting a temporary draft as of 2026-12-31 so Patrick can see the working reconciliation surface.', 1700);
      await page.locator('button', { hasText: 'Start reconciliation' }).click();
      await page.waitForSelector('text=Draft reconciliation as of', { timeout: 10000 });
      const refreshed = await getReconList();
      createdDraftId = refreshed.find(a => a.account_id === account.account_id)?.open_reconciliation?.id || null;
    }

    await page.waitForTimeout(800);
    await caption(page, 'Working view: statement balance, books balance, diff, close button, and two transaction columns.', 2400);

    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    if (checkboxCount > 1) {
      await caption(page, 'Clearing one transaction moves it from Uncleared to Cleared and updates the running balance.', 1700);
      await checkboxes.nth(1).click();
      await page.waitForTimeout(1200);
      await caption(page, 'The Cleared column now shows the checked transaction and running balance.', 2000);

      const transactionLabels = page.locator('li span.cursor-pointer');
      if (await transactionLabels.count()) {
        await transactionLabels.first().click();
        await page.waitForTimeout(900);
        await caption(page, 'Clicking a transaction expands the shared TransactionEditor inline inside reconciliation.', 2400);
      }
    } else {
      await caption(page, 'This data set has no uncleared row available for the checkbox demo, but the working view rendered correctly.', 2000);
    }

    await caption(page, 'Known open Wren review items remain: stale-clearing semantics and delete-cleared transaction behavior need E.3 fixes before acceptance.', 2800);

    await page.screenshot({ path: POSTER_OUT, fullPage: false });

    if (createdDraftId) {
      await page.locator('button', { hasText: 'Cancel and delete reconciliation' }).click();
      await page.waitForTimeout(1200);
      await caption(page, 'Temporary draft canceled; the demo leaves the shared Books data clean.', 1700);
      createdDraftId = null;
    }
  } finally {
    await context.close();
    await browser.close();
    await cleanupDraft();
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
    '# E.2 Reconciliation Demo',
    '',
    `Recorded: 2026.07.07`,
    `Route: ${BASE}/books/reconcile`,
    `Account: ${account.account_code} ${account.account_name}`,
    '',
    'Covers:',
    '- Account list / status gate',
    '- Per-account as-of-date gate',
    '- Draft reconciliation working view',
    '- Clearing a transaction into the Cleared column',
    '- Inline TransactionEditor entry point',
    '',
    'Known open items shown/mentioned:',
    '- Wren B1: staleness does not clear on exact revert yet',
    '- Wren B2: deleting a cleared transaction still needs the E.3 fix',
    '- Wren significant: account_id change on cleared transaction needs explicit mutation handling',
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
  await cleanupDraft();
  process.exit(1);
});
