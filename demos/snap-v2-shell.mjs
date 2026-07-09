#!/usr/bin/env node
// Snapshot the v2 shell + verify the manual entry end-to-end flow stays intact.
//
// Captures:
//   1. /books                          → Dashboard stub
//   2. /books/setup                    → Setup Wizard stub
//   3. /books/categories               → Categories stub
//   4. /books/transactions             → Transactions page (built)
//   5. /books/settings                 → Settings → General
//   6. /books/settings/categories      → Settings → Categories submenu
//   7. /books/settings/other           → Settings → Other submenu
//   8. /books/unknown-route            → "Coming soon" stub
//
// Then exercises the manual-entry flow on /books/transactions:
//   - Click "New entry"
//   - Fill Date / Type / Category / Name / Amount
//   - Click Save
//   - Confirm the new entry shows in the GL
//
// Outputs:
//   demos/2026.07.09-v2-shell-rebuild.png  (5-link left rail + Dashboard stub OR Transactions)
//   demos/2026.07.09-v2-shell-rebuild-verification.md  (checklist of what was verified)

import { chromium } from '/opt/homebrew/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:3001';
const DEMO_DIR = path.resolve('/Users/colonelhoracegentleman/clawd/projects/task-manager/demos');
const DATE = '2026.07.09';
const POSTER_OUT = path.join(DEMO_DIR, `${DATE}-v2-shell-rebuild.png`);
const VERIF_OUT = path.join(DEMO_DIR, `${DATE}-v2-shell-rebuild-verification.md`);

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log((pass ? '✅' : '❌') + ' ' + label + (detail ? '  · ' + detail : ''));
}

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

async function findAccount(code) {
  const accts = await api('/accounts');
  return accts.find(a => a.code === code);
}

async function main() {
  fs.mkdirSync(DEMO_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(err.message));

  try {
    // 1. Dashboard stub.
    await page.goto(`${BASE}/books`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('text=Welcome to Virta Books', { timeout: 10000 });
    check('Dashboard renders "Welcome to Virta Books"', true);
    const dashPill = await page.locator('text=Available in Phase 11').count();
    check('Dashboard has "Available in Phase 11" pill', dashPill === 1, `count=${dashPill}`);

    // No v1 nav links anywhere.
    const v1Links = [
      'button:has-text("Invoices")',
      'button:has-text("Payments")',
      'button:has-text("Customers")',
      'button:has-text("Import")',
      'button:has-text("Categorize")',
      'button:has-text("Reports")',
      'button:has-text("Reconcile")',
    ];
    let v1Leaks = 0;
    for (const sel of v1Links) {
      const c = await page.locator(sel).count();
      if (c > 0) { v1Leaks++; console.log(`LEAK: ${sel} found in nav (count=${c})`); }
    }
    check('No v1 nav links (Invoices / Payments / Customers / Import / Categorize / Reports / Reconcile)', v1Leaks === 0, `leaks=${v1Leaks}`);

    // 5-link left rail.
    for (const label of ['Dashboard', 'Setup Wizard', 'Categories', 'Transactions', 'Settings']) {
      const c = await page.locator(`nav button:has-text("${label}")`).count();
      check(`Left rail has "${label}" link`, c === 1, `count=${c}`);
    }

    // Capture the poster snapshot here — left rail + Dashboard stub.
    await page.waitForTimeout(500);
    await page.screenshot({ path: POSTER_OUT, fullPage: false });
    check(`Snapshot saved to ${POSTER_OUT}`, fs.existsSync(POSTER_OUT));

    // 2. Setup Wizard stub.
    await page.click('nav button:has-text("Setup Wizard")');
    await page.waitForSelector('text=Let\'s set up your books.', { timeout: 5000 });
    const setupPill = await page.locator('text=Coming in Phase 1').count();
    check('Setup Wizard has "Coming in Phase 1" pill', setupPill >= 1, `count=${setupPill}`);

    // 3. Categories stub.
    await page.click('nav button:has-text("Categories")');
    await page.waitForSelector('button:has-text("Show All")', { timeout: 5000 });
    await page.waitForSelector('text=Search categories by name, code, or line', { timeout: 5000 }).catch(() => {
      // placeholder text isn't a DOM text node; that's OK — we have the chips instead
    });
    for (const chip of ['Show All', 'Expenses', 'Income', 'Assets/Liabilities/Equity']) {
      const c = await page.locator(`button:has-text("${chip}")`).count();
      check(`Categories has chip "${chip}"`, c === 1, `count=${c}`);
    }
    const catsPill = await page.locator('text=Coming in Phase 1').count();
    check('Categories has "Coming in Phase 1" pill', catsPill >= 1, `count=${catsPill}`);

    // 4. Transactions — the built page.
    await page.click('nav button:has-text("Transactions")');
    await page.waitForSelector('h1:has-text("Transactions")', { timeout: 5000 });
    const newEntryBtn = await page.locator('button:has-text("New entry")').count();
    check('Transactions page has "New entry" button', newEntryBtn === 1, `count=${newEntryBtn}`);
    check('Transactions URL is /books/transactions', page.url().endsWith('/books/transactions'));

    // 5. Settings → General (default).
    await page.click('nav button:has-text("Settings")');
    await page.waitForSelector('text=/^Settings$/', { timeout: 5000 });
    await page.waitForTimeout(500);
    const generalTab = await page.locator('main button:has-text("General")').count();
    const categoriesTab = await page.locator('main button:has-text("Categories")').count();
    const otherTab = await page.locator('main button:has-text("Other")').count();
    check('Settings has General tab', generalTab >= 1, `count=${generalTab}`);
    check('Settings has Categories tab', categoriesTab >= 1, `count=${categoriesTab}`);
    check('Settings has Other tab', otherTab >= 1, `count=${otherTab}`);

    // v1 submenu tabs that should be gone.
    for (const oldLabel of ['Chart of Accounts', 'Vendor Rules', 'Source Mappings']) {
      const c = await page.locator(`button:has-text("${oldLabel}")`).count();
      check(`Settings submenu no longer has "${oldLabel}"`, c === 0, `count=${c}`);
    }

    // 6. Settings → Categories sub-tab.
    await page.click('main button:has-text("Categories")');
    await page.waitForTimeout(400);
    check('Settings → Categories URL navigated', page.url().endsWith('/settings/categories'), `url=${page.url()}`);

    // 7. Settings → Other sub-tab.
    await page.click('main button:has-text("Other")');
    await page.waitForTimeout(400);
    check('Settings → Other URL navigated', page.url().endsWith('/settings/other'), `url=${page.url()}`);

    // 8. Unknown route → Coming soon.
    await page.goto(`${BASE}/books/some-future-surface`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForSelector('text=That page isn\'t wired up yet', { timeout: 5000 });
    const comingSoon = await page.locator('text=Coming soon').count();
    check('Unknown /books/* route shows "Coming soon" stub', comingSoon >= 1, `count=${comingSoon}`);

    // 9. Manual-entry end-to-end flow on the Transactions page.
    await page.goto(`${BASE}/books/transactions`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForSelector('h1:has-text("Transactions")', { timeout: 5000 });

    // Pre-clean: delete any leftover smoke entries from a prior run. The
    // script is idempotent and can re-run against a populated DB.
    try {
      const stale = await api(`/journal/entries?name_q=${encodeURIComponent('v2-shell-rebuild smoke')}&limit=50`);
      for (const r of stale.data || []) {
        await fetch(`${BASE}/api/v1/books/journal/entries/${r.id}`, { method: 'DELETE' });
      }
      if ((stale.data || []).length) await page.reload({ waitUntil: 'domcontentloaded' });
    } catch { /* best-effort */ }

    const rowsBefore = await page.locator('tbody tr').count();
    await page.click('button:has-text("New entry")');
    await page.waitForSelector('text=Pick the type of account', { timeout: 5000 });
    // Date is already today; pick a category that's an Expense and a matched cash.
    const cats = await api('/accounts');
    const catExp = cats.find(a => a.account_type === 'expense');
    const catCash = cats.find(a => a.account_type === 'asset');
    await page.fill('input#man-name', 'v2-shell-rebuild smoke');
    await page.fill('input#man-amount', '1.23');
    await page.selectOption('select#man-category', catExp.id);
    await page.selectOption('select#man-matched', catCash.id);
    await page.click('button:has-text("Save"):not(:has-text("new"))');
    await page.waitForSelector('h1:has-text("Transactions")', { timeout: 5000 });
    await page.waitForTimeout(500);
    const rowsAfter = await page.locator('tbody tr').count();
    check(
      'Manual entry: Save posted + GL reflowed',
      rowsAfter > rowsBefore,
      `rows before=${rowsBefore} after=${rowsAfter}`
    );
    const newRow = await page.locator('tbody tr', { hasText: 'v2-shell-rebuild smoke' }).count();
    check('Manual entry: new row is visible in the GL', newRow === 1, `count=${newRow}`);

    // Cleanup — best-effort delete the smoke entry.
    try {
      const today = new Date().toISOString().slice(0, 10);
      const list = await api(`/journal/entries?date_from=${today}&date_to=${today}&name_q=v2-shell-rebuild+smoke&limit=50`);
      for (const r of list.data || []) {
        if (r.name === 'v2-shell-rebuild smoke') {
          await fetch(`${BASE}/api/v1/books/journal/entries/${r.id}`, { method: 'DELETE' });
        }
      }
    } catch (e) {
      console.error(`Cleanup warning: ${e.message}`);
    }

    // Console / page errors should be zero except known-noise.
    const realErrors = consoleErrors.filter(e => !/Manifest|hot-update|favicon/i.test(e));
    check('No unexpected console errors', realErrors.length === 0, `count=${realErrors.length}`);
    if (realErrors.length) console.log('Console errors:', realErrors);
    check('No page errors', pageErrors.length === 0, `count=${pageErrors.length}`);
    if (pageErrors.length) console.log('Page errors:', pageErrors);

  } finally {
    await context.close();
    await browser.close();
  }

  // Write verification checklist.
  const passCount = checks.filter(c => c.pass).length;
  const failCount = checks.length - passCount;
  fs.writeFileSync(VERIF_OUT, [
    '# v2 Shell rebuild — verification',
    '',
    `Recorded: ${DATE}`,
    `Base URL: ${BASE}`,
    '',
    `Result: ${passCount}/${checks.length} checks passed.`,
    failCount === 0 ? 'All green.' : `\nFailures:\n${checks.filter(c => !c.pass).map(c => `  - ${c.label}${c.detail ? '  · ' + c.detail : ''}`).join('\n')}`,
    '',
    'Checks:',
    ...checks.map(c => `- ${c.pass ? '✅' : '❌'} ${c.label}${c.detail ? '  · `' + c.detail + '`' : ''}`),
    '',
    'Snapshot: `' + POSTER_OUT + '`',
    '',
  ].join('\n'));

  if (failCount > 0) {
    console.log(`\n${failCount} CHECK(S) FAILED — see ${VERIF_OUT}`);
    process.exit(1);
  } else {
    console.log(`\nAll ${passCount} checks passed. Snapshot: ${POSTER_OUT}`);
  }
}

main().catch(async err => {
  console.error(err);
  process.exit(1);
});
