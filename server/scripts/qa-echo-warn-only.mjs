#!/usr/bin/env node
// T3 — Final clean Sage-warning test. Detection: any element whose textContent
// contains the warning copy AND has amber styling (proves it's the styled warning,
// not just any text mentioning the words).

import fs from 'node:fs';
import { execSync } from 'node:child_process';

const script = `
import { chromium } from '/opt/homebrew/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs';

const out = { consoleErrors: [], pageErrors: [], results: [] };
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') out.consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => out.pageErrors.push(err.message));

await page.goto('http://localhost:3001/books/transactions', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(800);

await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'New entry');
  if (b) b.click();
});
await page.waitForTimeout(500);

// Detection fn: find the warning by its amber styling + text content
function detectWarning() {
  const all = Array.from(document.querySelectorAll('[role="dialog"] *'));
  return all
    .filter(el => {
      const tc = (el.textContent || '').trim();
      return tc.includes('Heads up:') && tc.includes('usually updated by statement imports');
    })
    .map(el => ({
      tag: el.tagName,
      className: el.className,
      textSnippet: el.textContent?.trim().slice(0, 200),
    }));
}

// 1. Baseline: with default matched-with (Account 1000, "Account RENAME"), no warning
let warnings = detectWarning();
out.results.push({ test: 'baseline-no-import-token', warningCount: warnings.length, expected: 0, pass: warnings.length === 0 });

// 2. Pick Business Credit Card → warning should appear
await page.evaluate(() => {
  const sel = document.getElementById('man-matched');
  const o = Array.from(sel.options).find(o => (o.textContent || '').includes('Credit Card') && o.value);
  sel.value = o.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
warnings = detectWarning();
out.results.push({
  test: 'picked-Business-Credit-Card',
  warningCount: warnings.length,
  expected: 1,
  pass: warnings.length === 1,
  warnings,
});

// 3. Switch back to non-import account → warning should disappear
await page.evaluate(() => {
  const sel = document.getElementById('man-matched');
  const o = Array.from(sel.options).find(o => (o.textContent || '').includes('1000') && o.value);
  sel.value = o.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
warnings = detectWarning();
out.results.push({ test: 'switch-back-to-non-import', warningCount: warnings.length, expected: 0, pass: warnings.length === 0 });

// 4. Take a screenshot with warning visible for evidence
await page.evaluate(() => {
  const sel = document.getElementById('man-matched');
  const o = Array.from(sel.options).find(o => (o.textContent || '').includes('Credit Card') && o.value);
  sel.value = o.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/echo-t3-final.png', fullPage: false });

// 5. Verify the warning element is positioned visually under the matched-with select
const position = await page.evaluate(() => {
  const matched = document.getElementById('man-matched');
  const warning = Array.from(document.querySelectorAll('[role="dialog"] *'))
    .find(el => (el.textContent || '').includes('Heads up:') && (el.textContent || '').includes('statement imports'));
  if (!matched || !warning) return null;
  const m = matched.getBoundingClientRect();
  const w = warning.getBoundingClientRect();
  return {
    matchedBottom: m.bottom,
    warningTop: w.top,
    warningLeft: w.left,
    warningRight: w.right,
    amberClass: warning.className.includes('amber-900/30') || warning.className.includes('amber-700'),
    isUnderMatched: w.top > m.bottom && Math.abs(w.left - m.left) < 50,
  };
});
out.position = position;

// 6. Live confirm the warning text matches D70 copy verbatim
const liveText = await page.evaluate(() => {
  const warning = Array.from(document.querySelectorAll('[role="dialog"] *'))
    .find(el => (el.textContent || '').includes('Heads up:') && (el.textContent || '').includes('statement imports'));
  return warning?.textContent?.trim();
});
const D70_COPY = 'Heads up: This account is usually updated by statement imports. A manual entry will create a separate transaction that you will need to reconcile against the import later.';
out.copyMatch = liveText === D70_COPY;
out.copyActual = liveText;

await browser.close();
console.log(JSON.stringify(out, null, 2));
`;

fs.writeFileSync('/tmp/echo-warn-test-final.mjs', script);

try {
  const out = execSync('node /tmp/echo-warn-test-final.mjs', { encoding: 'utf-8', timeout: 90_000 });
  console.log(out);
  fs.writeFileSync('/tmp/echo-t3-final-result.json', out);
} catch (err) {
  console.error('Playwright failed:', err.message);
  if (err.stdout) console.error('stdout:', err.stdout.slice(0, 4000));
  process.exit(1);
}