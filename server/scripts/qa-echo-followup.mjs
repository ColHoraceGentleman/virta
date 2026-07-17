#!/usr/bin/env node
// Echo QA follow-up: retry the 3 tests that didn't have evidence in the first pass
// 1. Asset tests with proper matched-with (Asset 1100 as cat, Asset 1000 as mat)
// 2. Sage warning via Playwright using the OpenClaw-installed playwright-core path
// 3. T4-name retried with a real name pattern (ECHO-T1)

import fs from 'node:fs';
import { execSync } from 'node:child_process';

const STATE = JSON.parse(fs.readFileSync('/tmp/echo-state.json', 'utf-8'));
const BASE = STATE.base;

// Pull a second asset account (Equipment 1100) for the Asset tests
const all = await fetch(`${BASE}/books/accounts?limit=500`).then((r) => r.json());
const accounts = all.data || [];
const asset1000 = accounts.find((a) => a.code === '1000');
const asset1100 = accounts.find((a) => a.code === '1100');
const exp6010 = accounts.find((a) => a.code === '6010');
const inc4000 = accounts.find((a) => a.code === '4000');
const liab2000 = accounts.find((a) => a.code === '2000');
const eq3000 = accounts.find((a) => a.code === '3000');

const created = [];
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: r.status, json };
}
async function post(name, body) {
  const r = await api('POST', '/books/journal/entries', body);
  if (r.status === 200 && r.json?.data?.id) created.push(r.json.data.id);
  return r;
}

const followup = []; // {id, ok, evidence, error}

// T1a retry — Asset +100, Equipment category, Account 1000 matched-with
{
  const r = await post('ECHO-T1a (retry)', {
    txn_date: '2026-07-09', type: 'asset',
    category_account_id: asset1100.id,
    matched_account_id: asset1000.id,
    name: 'ECHO-T1a Asset +100', amount: 100,
  });
  if (r.status !== 200) {
    followup.push({ id: 'T1a', ok: false, error: `POST ${r.status}: ${JSON.stringify(r.json)}` });
  } else {
    const lines = r.json.data.lines;
    const cat = lines.find((l) => l.account_id === asset1100.id);
    const mat = lines.find((l) => l.account_id === asset1000.id);
    const catSide = cat.debit > 0 ? 'debit' : 'credit';
    const matSide = mat.debit > 0 ? 'debit' : 'credit';
    const catMag = Math.max(cat.debit, cat.credit);
    const matMag = Math.max(mat.debit, mat.credit);
    const ok = catSide === 'debit' && matSide === 'credit' && catMag === 100 && matMag === 100;
    followup.push({
      id: 'T1a', ok,
      evidence: `Equipment cat=${catSide}(${catMag}) Account 1000 mat=${matSide}(${matMag})`,
      error: ok ? null : `Expected cat=debit(100) mat=credit(100); got cat=${catSide}(${catMag}) mat=${matSide}(${matMag})`,
    });
  }
}

// T1b retry — Asset -50
{
  const r = await post('ECHO-T1b (retry)', {
    txn_date: '2026-07-09', type: 'asset',
    category_account_id: asset1100.id,
    matched_account_id: asset1000.id,
    name: 'ECHO-T1b Asset -50', amount: -50,
  });
  if (r.status !== 200) {
    followup.push({ id: 'T1b', ok: false, error: `POST ${r.status}: ${JSON.stringify(r.json)}` });
  } else {
    const lines = r.json.data.lines;
    const cat = lines.find((l) => l.account_id === asset1100.id);
    const mat = lines.find((l) => l.account_id === asset1000.id);
    const catSide = cat.debit > 0 ? 'debit' : 'credit';
    const matSide = mat.debit > 0 ? 'debit' : 'credit';
    const catMag = Math.max(cat.debit, cat.credit);
    const matMag = Math.max(mat.debit, mat.credit);
    const ok = catSide === 'credit' && matSide === 'debit' && catMag === 50 && matMag === 50;
    followup.push({
      id: 'T1b', ok,
      evidence: `Equipment cat=${catSide}(${catMag}) Account 1000 mat=${matSide}(${matMag})`,
      error: ok ? null : `Expected cat=credit(50) mat=debit(50); got cat=${catSide}(${catMag}) mat=${matSide}(${matMag})`,
    });
  }
}

// T3 retry — Sage warning via Playwright with the correct path
{
  const script = `
import { chromium } from '/opt/homebrew/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs';
const out = { url: null, warningFound: false, warningText: null, consoleErrors: [] };
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') out.consoleErrors.push(msg.text()); });
await page.goto('http://localhost:3001/books/transactions', { waitUntil: 'networkidle' });
// Click "New entry" button (could be in toolbar)
const newBtn = page.locator('button:has-text("New entry"), a:has-text("New entry"), button:has-text("+ New entry")').first();
await newBtn.waitFor({ state: 'visible', timeout: 10000 });
await newBtn.click();
const dialog = page.locator('[role="dialog"], .modal, dialog').first();
await dialog.waitFor({ state: 'visible', timeout: 5000 });
// Expand Matched with
const addMatched = page.locator('a:has-text("+ Add Matched with"), button:has-text("+ Add Matched with"), a:has-text("Matched with"), [data-action="add-matched"]').first();
await addMatched.waitFor({ state: 'visible', timeout: 5000 });
await addMatched.click();
// Pick the Business Credit Card select option
const sel = page.locator('select').filter({ hasText: 'Credit' }).first();
await sel.waitFor({ state: 'visible', timeout: 5000 });
await sel.selectOption({ label: 'Business Credit Card' });
await page.waitForTimeout(400);
const warningText = 'Heads up: This account is usually updated by statement imports.';
const warn = page.locator(\`text=\${warningText}\`);
out.warningFound = await warn.count() > 0;
if (out.warningFound) out.warningText = (await warn.first().textContent())?.trim();
out.url = page.url();
await browser.close();
console.log(JSON.stringify(out));
`;
  fs.writeFileSync('/tmp/echo-warn-test-v2.mjs', script);
  let parsed = null;
  try {
    const out = execSync('node /tmp/echo-warn-test-v2.mjs', { encoding: 'utf-8', timeout: 90_000 });
    const lines = out.trim().split('\n');
    parsed = JSON.parse(lines[lines.length - 1]);
    followup.push({
      id: 'T3',
      ok: parsed.warningFound === true,
      evidence: `text="${parsed.warningText}" consoleErrors=${parsed.consoleErrors.length}`,
      error: parsed.warningFound ? null : `Warning not found in DOM. consoleErrors=${JSON.stringify(parsed.consoleErrors)}`,
    });
  } catch (err) {
    followup.push({
      id: 'T3', ok: false, error: `Playwright run failed: ${String(err.message || err).slice(0, 500)}`,
    });
  }
}

// T4-name retry — use a name pattern that actually has rows (ECHO-T1)
{
  const r = await api('GET', '/books/journal/entries?name_q=ECHO-T1&limit=500');
  const rows = r.json?.data ?? [];
  const allMatch = rows.every((e) => (e.name || '').includes('ECHO-T1'));
  // Sanity: also confirm the inverse — using 'no-such-token' returns 0
  const none = await api('GET', '/books/journal/entries?name_q=zzzzzNoSuchEntryXyz&limit=500');
  const noneRows = none.json?.data ?? [];
  followup.push({
    id: 'T4-name',
    ok: r.status === 200 && allMatch && rows.length === 8 && noneRows.length === 0,
    evidence: `name_q=ECHO-T1 returned ${rows.length} rows (all match), name_q=zzzzzNoSuchEntryXyz returned ${noneRows.length}`,
    error: null,
  });
}

// Print
for (const f of followup) {
  const tag = f.ok ? '✅' : '❌';
  console.log(`${tag} ${f.id}${f.evidence ? ' — ' + f.evidence : ''}${f.error ? '\n   error: ' + f.error : ''}`);
}

fs.writeFileSync('/tmp/echo-followup.json', JSON.stringify({ created, followup }, null, 2));
console.log(`\nFollowup created entry IDs (for cleanup): ${created.length}`);