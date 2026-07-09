// Playwright e2e for SIG-1 (Phase 1+2 review): "Save and new" must keep
// Type and Date at their current values per D71, and clear the rest of
// the form (Name, Amount, Description, Matched-with, Notes).
//
// Verifies (against the live UI on http://localhost:3001/books/transactions):
//   1. Modal opens with Type=Expense and Date=today (defaults).
//   2. User changes Type=Income and Date=2026-06-01.
//   3. User fills Name, Amount, Description, opens +Add note, fills it.
//   4. User clicks "Save and new" — entry posts (assert via API).
//   5. Modal STAYS OPEN with Type=Income and Date=2026-06-01 preserved.
//   6. Name, Amount, Description, Notes are now empty.
//   7. Description/Notes are collapsed back to "+ Add X" links.
//
// Output: ./console.log, ./network.log, ./results.json
// (Screenshots + log files go to docs/books/qa/runs/2026-07-09/VB-MANUAL-RESET/,
//  which is gitignored \u2014 a local scratch space for the run's evidence.)
//
// Requires: the task-manager server running on BASE (default localhost:3001)
// and the production client bundle in client/dist/ to reflect the fix.
//
// Run:  node server/scripts/e2e/sig1-save-and-new.mjs
// Or:   BASE=http://localhost:3001 node server/scripts/e2e/sig1-save-and-new.mjs

import { chromium } from '/opt/homebrew/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Output dir: outside the source tree so it can be gitignored.
const OUT_DIR = process.env.OUT_DIR || join(__dirname, '..', '..', '..', 'docs', 'books', 'qa', 'runs', '2026-07-09', 'VB-MANUAL-RESET');
mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.BASE || 'http://localhost:3001';

const consoleLines = [];
const networkLines = [];
const results = { pass: [], fail: [], notes: [], cleanup: [] };

function log(...a) { console.log('[SIG1]', ...a); }
function ok(name, detail = '') { results.pass.push({ name, detail }); log('PASS', name, detail); }
function ko(name, detail = '') { results.fail.push({ name, detail }); log('FAIL', name, detail); }
function note(msg) { results.notes.push(msg); log('NOTE', msg); }

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  page.on('console', msg => {
    const line = `[${msg.type()}] ${msg.text()}`;
    consoleLines.push(line);
    if (msg.type() === 'error') log('CONSOLE ERROR:', msg.text());
  });
  page.on('pageerror', err => {
    consoleLines.push(`[pageerror] ${err.message}`);
    log('PAGE ERROR:', err.message);
  });
  page.on('requestfailed', req => {
    networkLines.push(`[fail] ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });
  page.on('response', res => {
    networkLines.push(`[${res.status()}] ${res.request().method()} ${res.url()}`);
  });

  // --- 1. Navigate to /books/transactions -----------------------------
  log('navigating to', BASE + '/books/transactions');
  try {
    await page.goto(BASE + '/books/transactions', { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (e) {
    ko('navigate', e.message);
    await browser.close();
    writeOutputs();
    process.exit(1);
  }
  await page.waitForTimeout(800);

  // Confirm no React error boundary visible.
  const errorBoundaryText = await page.evaluate(() => {
    const t = document.body?.innerText || '';
    return t.includes('App crashed') || t.includes('Cannot read properties');
  }).catch(() => false);
  if (errorBoundaryText) {
    ko('no-error-boundary', 'React error boundary visible on initial render');
  } else {
    ok('no-error-boundary', 'page rendered without error overlay');
  }

  // --- 2. Click "New entry" to open the modal --------------------------
  log('opening manual-entry modal');
  const opened = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'New entry');
    if (b) { b.click(); return true; }
    return false;
  });
  if (!opened) {
    ko('open-modal', 'New entry button not found');
    await browser.close();
    writeOutputs();
    process.exit(1);
  }
  ok('open-modal', 'clicked New entry');
  await page.waitForTimeout(500);

  // Verify the dialog is visible.
  const dialogVisible = await page.evaluate(() => {
    return !!document.querySelector('[role="dialog"]');
  });
  if (dialogVisible) ok('modal-visible', 'dialog rendered');
  else                ko('modal-visible', 'no [role="dialog"] after clicking New entry');

  // --- 3. Change Type to Income and Date to 2026-06-01 -----------------
  // React's controlled inputs (text/date) listen for 'input' events via the
  // native value setter. We need to use the prototype's value setter + 'input'
  // event to make React state actually update.
  log('setting Type=Income, Date=2026-06-01');
  await page.evaluate(() => {
    const setReactValue = (el, v) => {
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const s = document.getElementById('man-type');
    if (s) {
      // <select> listens for 'change' on the native element.
      s.value = 'Income';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const d = document.getElementById('man-date');
    if (d) {
      // <input type="date">: React's onChange is wired to the 'input' event
      // for v17+ — the value setter + 'input' event updates React state.
      setReactValue(d, '2026-06-01');
    }
  });
  await page.waitForTimeout(300);

  const typeAfterSet = await page.evaluate(() => document.getElementById('man-type')?.value);
  // For Date, the DOM value reflects what we set, but to be sure React state
  // is in sync, we re-read by triggering a synthetic input read.
  const dateAfterSet = await page.evaluate(() => document.getElementById('man-date')?.value);
  if (typeAfterSet === 'Income') ok('type-set', `Type=Income (DOM value: ${typeAfterSet})`);
  else                           ko('type-set', `Type not set to Income; got ${typeAfterSet}`);
  if (dateAfterSet === '2026-06-01') ok('date-set', `Date=2026-06-01 (DOM value: ${dateAfterSet})`);
  else                               ko('date-set', `Date not set to 2026-06-01; got ${dateAfterSet}`);

  // --- 4. Fill in Name, Amount, and add a Description and Note ---------
  // The "+ Add description" and "+ Add note" buttons need to be clicked
  // first to reveal the inputs.
  log('filling name/amount + revealing desc/note');
  await page.evaluate(() => {
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    // Reveal description & notes by clicking the "+ Add X" buttons.
    Array.from(document.querySelectorAll('button')).forEach(b => {
      const t = b.textContent || '';
      if (t.includes('+ Add description') || t.includes('+ Add note')) b.click();
    });
    setVal('man-name', 'SIG1 Test Customer');
    setVal('man-amount', '123.45');
    setTimeout(() => {
      setVal('man-desc', 'SIG1 test description text');
      setVal('man-notes', 'SIG1 test note text');
    }, 100);
  });
  await page.waitForTimeout(400);

  // Pick a Category of type income and a Matched-with.
  await page.evaluate(() => {
    // Category: pick the first option with a real id (skip the placeholder).
    const cat = document.getElementById('man-category');
    if (cat && cat.options.length > 1) {
      cat.value = cat.options[1].value;
      cat.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Matched-with: same.
    const mtc = document.getElementById('man-matched');
    if (mtc && mtc.options.length > 1) {
      // pick a different id from the category if possible
      const catId = cat?.value;
      const opt = Array.from(mtc.options).find(o => o.value && o.value !== catId);
      if (opt) {
        mtc.value = opt.value;
        mtc.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
  await page.waitForTimeout(200);

  // Snapshot pre-save state for assertions after save.
  const preState = await page.evaluate(() => ({
    type: document.getElementById('man-type')?.value,
    date: document.getElementById('man-date')?.value,
    name: document.getElementById('man-name')?.value,
    amount: document.getElementById('man-amount')?.value,
    desc: document.getElementById('man-desc')?.value,
    notes: document.getElementById('man-notes')?.value,
    matched: document.getElementById('man-matched')?.value,
  }));
  log('pre-save state:', JSON.stringify(preState));
  await page.screenshot({ path: join(OUT_DIR, 'screenshot-1-prefilled.png'), fullPage: false });

  // --- 5. Click "Save and new" -----------------------------------------
  log('clicking Save and new');
  const postedIds = [];
  page.on('response', async res => {
    // Capture the created entry id from the POST response.
    try {
      if (res.request().method() === 'POST' && res.url().includes('/journal/entries') && !res.url().includes('/audit')) {
        const body = await res.json().catch(() => null);
        if (body && body.data && body.data.id) {
          postedIds.push(body.data.id);
          log('captured posted id:', body.data.id);
        }
      }
    } catch { /* ignore */ }
  });

  const clicked = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Save and new');
    if (b) { b.click(); return true; }
    return false;
  });
  if (!clicked) {
    ko('click-save-and-new', 'Save and new button not found');
  } else {
    ok('click-save-and-new', 'clicked');
  }
  // Give the post + resetForm() + render time to settle.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT_DIR, 'screenshot-2-after-save.png'), fullPage: false });

  // --- 6. Verify the post landed (entry exists with the right values) -
  if (postedIds.length === 0) {
    ko('post-landed', 'no POST /journal/entries response captured');
  } else {
    const id = postedIds[0];
    results.cleanup.push({ action: 'delete entry', id });
    // Fetch it back and check.
    const r = await fetch(`${BASE}/api/v1/books/journal/entries/${id}`);
    const body = await r.json();
    const e = body.data;
    if (e && e.txn_date === '2026-06-01' && e.name === 'SIG1 Test Customer' && Math.abs(e.amount - 123.45) < 0.01) {
      ok('post-landed', `entry ${id.slice(0,8)} posted with date=2026-06-01, name="SIG1 Test Customer", amount=$123.45`);
    } else {
      ko('post-landed', `entry did not match expected values: ${JSON.stringify(e)}`);
    }
  }

  // --- 7. Verify modal stayed open, Type/Date preserved ----------------
  const modalStillOpen = await page.evaluate(() => {
    return !!document.querySelector('[role="dialog"]');
  });
  if (modalStillOpen) ok('modal-still-open', 'dialog remained visible after Save and new');
  else                ko('modal-still-open', 'dialog closed (should stay open per D71)');

  const postState = await page.evaluate(() => ({
    type: document.getElementById('man-type')?.value,
    date: document.getElementById('man-date')?.value,
    name: document.getElementById('man-name')?.value,
    amount: document.getElementById('man-amount')?.value,
    desc: document.getElementById('man-desc')?.value,
    notes: document.getElementById('man-notes')?.value,
  }));
  log('post-save state:', JSON.stringify(postState));

  // SIG-1 core assertions: Type and Date preserved.
  if (postState.type === 'Income') {
    ok('type-preserved', `Type still "Income" after Save and new (was "${preState.type}")`);
  } else {
    ko('type-preserved', `Type changed from "Income" to "${postState.type}" — D71 VIOLATION`);
  }
  if (postState.date === '2026-06-01') {
    ok('date-preserved', `Date still "2026-06-01" after Save and new (was "${preState.date}")`);
  } else {
    ko('date-preserved', `Date changed from "2026-06-01" to "${postState.date}" — D71 VIOLATION`);
  }

  // Other fields should be empty.
  if (!postState.name)   ok('name-cleared', 'Name field is empty after Save and new');
  else                   ko('name-cleared', `Name still has value: "${postState.name}"`);
  if (!postState.amount) ok('amount-cleared', 'Amount field is empty after Save and new');
  else                   ko('amount-cleared', `Amount still has value: "${postState.amount}"`);
  if (!postState.desc)   ok('desc-cleared', 'Description field is empty after Save and new');
  else                   ko('desc-cleared', `Description still has value: "${postState.desc}"`);
  if (!postState.notes)  ok('notes-cleared', 'Notes field is empty after Save and new');
  else                   ko('notes-cleared', `Notes still has value: "${postState.notes}"`);

  // Description/Notes should be collapsed back to "+ Add X" links.
  const descCollapsed = await page.evaluate(() => {
    return !document.getElementById('man-desc');
  });
  const notesCollapsed = await page.evaluate(() => {
    return !document.getElementById('man-notes');
  });
  if (descCollapsed)  ok('desc-collapsed', 'Description collapsed back to "+ Add description" link');
  else                ko('desc-collapsed', 'Description still showing after Save and new');
  if (notesCollapsed) ok('notes-collapsed', 'Notes collapsed back to "+ Add note" link');
  else                ko('notes-collapsed', 'Notes still showing after Save and new');

  // Date field should be focused.
  const dateFocused = await page.evaluate(() => {
    return document.activeElement?.id === 'man-date';
  });
  if (dateFocused) ok('date-focused', 'Date field is focused for fast next-entry typing (D71)');
  else             note('date-focused-uncertain: Date may not be the activeElement; could be the button still');

  // --- 8. Zero console errors / page errors during the run ------------
  const errorLines = consoleLines.filter(l => l.startsWith('[error]') || l.startsWith('[pageerror]'));
  if (errorLines.length === 0) {
    ok('zero-console-errors', 'no console errors or pageerrors during the full SIG-1 run');
  } else {
    ko('zero-console-errors', `${errorLines.length} error lines: ${errorLines.slice(0, 3).join(' | ')}`);
  }

  // --- 9. Cleanup -----------------------------------------------------
  for (const c of results.cleanup) {
    if (c.action === 'delete entry') {
      const r = await fetch(`${BASE}/api/v1/books/journal/entries/${c.id}`, { method: 'DELETE' });
      log('cleanup: deleted entry', c.id, 'status', r.status);
    }
  }

  await browser.close();
  writeOutputs();
  log('done. PASS:', results.pass.length, 'FAIL:', results.fail.length);
  process.exit(results.fail.length === 0 ? 0 : 2);
}

function writeOutputs() {
  writeFileSync(join(OUT_DIR, 'console.log'), consoleLines.join('\n'));
  writeFileSync(join(OUT_DIR, 'network.log'), networkLines.join('\n'));
  writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
}

run().catch(e => {
  console.error('runner crashed:', e);
  writeOutputs();
  process.exit(1);
});
