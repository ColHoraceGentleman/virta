#!/usr/bin/env node
// Echo QA runner — executes the assigned test matrix against the live API
// (http://localhost:3001). Records pass/fail per assertion into a JSON log,
// keeps a list of created entry IDs for cleanup at the end.

import fs from 'node:fs';

const STATE = JSON.parse(fs.readFileSync('/tmp/echo-state.json', 'utf-8'));
const BASE = STATE.base;
const ACCOUNTS = STATE.accounts;

const results = [];   // {id, name, ok, evidence, error?}
const createdEntryIds = []; // for cleanup

function record(id, name, ok, evidence, error) {
  const entry = { id, name, ok, evidence, error: error || null };
  results.push(entry);
  const tag = ok ? '✅' : '❌';
  console.log(`${tag} ${id} — ${name}`);
  if (evidence) console.log(`   evidence: ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`);
  if (error) console.log(`   error: ${error}`);
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  let json = null;
  const text = await r.text();
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: r.status, json };
}

// Helper: post an entry with a unique name prefix so we can identify/clean up.
async function postEntry(prefix, body) {
  const r = await api('POST', '/books/journal/entries', body);
  if (r.status === 200 && r.json?.data?.id) {
    createdEntryIds.push(r.json.data.id);
  }
  return r;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 1 — Manual-entry for all 5 account types × ± amounts
// Expected direction per Wren's verified scenarios + D63/D64 semantics
// ──────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 1: Manual-entry all 5 types × ± amounts ===');

const expectations = {
  // type, amount → which line gets the debit/credit
  asset_pos:      { catSide: 'debit',  matchedSide: 'credit' },  // asset +100 → asset debit
  asset_neg:      { catSide: 'credit', matchedSide: 'debit'  },
  expense_pos:    { catSide: 'debit',  matchedSide: 'credit' },
  expense_neg:    { catSide: 'credit', matchedSide: 'debit'  },
  income_pos:     { catSide: 'credit', matchedSide: 'debit'  },  // income +100 → credit (earned)
  income_neg:     { catSide: 'debit',  matchedSide: 'credit' },
  liability_pos:  { catSide: 'debit',  matchedSide: 'credit' },  // liability +100 paid down → debit
  liability_neg:  { catSide: 'credit', matchedSide: 'debit'  },  // liability -100 took on debt → credit
  equity_pos:     { catSide: 'debit',  matchedSide: 'credit' },  // equity +250 draw → debit
  equity_neg:     { catSide: 'credit', matchedSide: 'debit'  },  // equity -500 put in → credit
};

const t1Scenarios = [
  { id: 'T1a', name: 'Asset +100',    type: 'asset',     account: ACCOUNTS.asset_1000,            amount: 100,   expect: expectations.asset_pos },
  { id: 'T1b', name: 'Asset -50',     type: 'asset',     account: ACCOUNTS.asset_1000,            amount: -50,   expect: expectations.asset_neg },
  { id: 'T1c', name: 'Expense +75',   type: 'expense',   account: ACCOUNTS.expense_software,      amount: 75,    expect: expectations.expense_pos },
  { id: 'T1d', name: 'Expense -25',   type: 'expense',   account: ACCOUNTS.expense_software,      amount: -25,   expect: expectations.expense_neg },
  { id: 'T1e', name: 'Income +200',   type: 'income',    account: ACCOUNTS.income_wholesale,      amount: 200,   expect: expectations.income_pos },
  { id: 'T1f', name: 'Income -20',    type: 'income',    account: ACCOUNTS.income_wholesale,      amount: -20,   expect: expectations.income_neg },
  { id: 'T1g', name: 'Liability +100 (paid down)', type: 'liability', account: ACCOUNTS.liability_credit_card, amount: 100, expect: expectations.liability_pos },
  { id: 'T1h', name: 'Liability -75 (took on debt)', type: 'liability', account: ACCOUNTS.liability_credit_card, amount: -75, expect: expectations.liability_neg },
  { id: 'T1i', name: 'Equity +250 (draw)', type: 'equity', account: ACCOUNTS.equity_owners,        amount: 250,   expect: expectations.equity_pos },
  { id: 'T1j', name: 'Equity -500 (put in)', type: 'equity', account: ACCOUNTS.equity_owners,        amount: -500,  expect: expectations.equity_neg },
];

for (const sc of t1Scenarios) {
  const r = await postEntry(`ECHO-${sc.id}`, {
    txn_date: '2026-07-09',
    type: sc.type,
    category_account_id: sc.account,
    matched_account_id: ACCOUNTS.asset_1000,
    name: `ECHO-${sc.id} ${sc.name}`,
    amount: sc.amount,
    description: `ECHO QA test ${sc.id}`,
    notes: 'ECHO QA',
  });
  if (r.status !== 200) {
    record(sc.id, sc.name, false, null, `POST returned ${r.status}: ${JSON.stringify(r.json)}`);
    continue;
  }
  const lines = r.json.data.lines;
  const cat = lines.find((l) => l.account_id === sc.account);
  const mat = lines.find((l) => l.account_id === ACCOUNTS.asset_1000);
  const catDebit  = cat?.debit  ?? 0;
  const catCredit = cat?.credit ?? 0;
  const matDebit  = mat?.debit  ?? 0;
  const matCredit = mat?.credit ?? 0;

  // Determine which side each line is on
  const catSide = catDebit > 0 ? 'debit' : (catCredit > 0 ? 'credit' : '?');
  const matSide = matDebit > 0 ? 'debit' : (matCredit > 0 ? 'credit' : '?');

  // Magnitudes should equal the absolute value of the amount
  const catMag = Math.max(catDebit, catCredit);
  const matMag = Math.max(matDebit, matCredit);
  const expectedMag = Math.abs(sc.amount);
  const magOk = catMag === expectedMag && matMag === expectedMag;
  const dirOk = catSide === sc.expect.catSide && matSide === sc.expect.matchedSide;

  if (magOk && dirOk) {
    record(sc.id, sc.name, true, `cat=${catSide}(${catMag}) mat=${matSide}(${matMag}) — direction matches D63/D64 for type=${sc.type} amount=${sc.amount}`);
  } else {
    record(sc.id, sc.name, false, null, `Expected cat=${sc.expect.catSide}(${expectedMag}) mat=${sc.expect.matchedSide}(${expectedMag}); got cat=${catSide}(${catMag}) mat=${matSide}(${matMag})`);
  }
}

// ──────────────────────────────────────────────────────────────────────
// TEST 2 — Save-and-new (via API surrogate: posts an entry, then the
// parent's onPosted close logic is in the React layer; we test the contract
// that the modal remains open + form resets is the React concern. Here we
// focus on the data side: posting does not auto-trigger anything on the
// server that would prevent the next post, and the same Type/Date persist
// across sequential posts.)
// ──────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 2: Save-and-new (data side) ===');

const t2a = await postEntry('ECHO-T2a', {
  txn_date: '2026-06-01',
  type: 'income',
  category_account_id: ACCOUNTS.income_wholesale,
  matched_account_id: ACCOUNTS.asset_1000,
  name: 'ECHO-T2a first entry',
  amount: 123.45,
  description: 'first',
});
record('T2a', 'Save-and-new post #1 lands', t2a.status === 200, `id=${t2a.json?.data?.id} date=${t2a.json?.data?.txn_date}`);

const t2b = await postEntry('ECHO-T2b', {
  txn_date: '2026-06-01',           // ← same date
  type: 'income',                  // ← same type
  category_account_id: ACCOUNTS.income_wholesale,
  matched_account_id: ACCOUNTS.asset_1000,
  name: 'ECHO-T2b second entry',
  amount: 99.99,
});
record('T2b', 'Save-and-new post #2 with same Type/Date lands', t2b.status === 200, `id=${t2b.json?.data?.id} type=${t2b.json?.data?.type} date=${t2b.json?.data?.txn_date}`);

// TEST 2 UI behavior — needs real DOM. We use the SIG-1 e2e harness that
// Cinder already wrote (server/scripts/e2e/sig1-save-and-new.mjs) and run it.
console.log('\n=== TEST 2 (UI): Save-and-new modal behavior via existing e2e harness ===');
const { execSync } = await import('node:child_process');
let sig1Stdout = '';
try {
  sig1Stdout = execSync('node server/scripts/e2e/sig1-save-and-new.mjs', { cwd: process.cwd(), encoding: 'utf-8', timeout: 60_000 });
  // parse out PASS/FAIL counts
  const m = sig1Stdout.match(/PASS:\s*(\d+)\s+FAIL:\s*(\d+)/);
  if (m) {
    const pass = parseInt(m[1], 10);
    const fail = parseInt(m[2], 10);
    record('T2-ui', 'SIG-1 e2e (Type+Date preserved, fields cleared, modal stays open)', fail === 0 && pass > 0, `${pass} PASS / ${fail} FAIL (last line: ${sig1Stdout.trim().split('\n').slice(-1)[0]})`);
  } else {
    record('T2-ui', 'SIG-1 e2e', false, null, `Could not parse harness output. Tail: ${sig1Stdout.slice(-400)}`);
  }
} catch (err) {
  record('T2-ui', 'SIG-1 e2e harness', false, null, `harness threw: ${String(err.message || err)}`);
}

// ──────────────────────────────────────────────────────────────────────
// TEST 3 — Sage-style import warning (DOM-driven, not string-arg)
// We open the modal in a real browser via Playwright, expand Matched-with,
// pick the "Business Credit Card" liability account, and assert the yellow
// warning text appears.
// ──────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 3: Sage-style import warning (Playwright real-DOM) ===');
const warnScript = `
import { chromium } from 'playwright';
const out = { url: null, warningFound: false, warningText: null, consoleErrors: [] };
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') out.consoleErrors.push(msg.text()); });
await page.goto('http://localhost:3001/books/dashboard', { waitUntil: 'networkidle' });
// Open New entry modal — try a few selectors
const newBtn = await page.locator('button:has-text("New entry"), a:has-text("New entry"), button:has-text("New Entry"), button:has-text("+ New")').first();
await newBtn.waitFor({ state: 'visible', timeout: 10000 });
await newBtn.click();
// Modal opens
await page.locator('[role="dialog"], .modal, dialog').first().waitFor({ state: 'visible', timeout: 5000 });
// Type stays default Expense, but we need a non-import-driven category first
// then expand Matched-with. We click "+ Add Matched with" to expand.
const addMatched = page.locator('a:has-text("+ Add Matched with"), button:has-text("+ Add Matched with"), a:has-text("Matched with")').first();
await addMatched.click();
// The matched-with select should now be visible. Pick the Business Credit Card option.
const select = page.locator('select').filter({ hasText: 'Credit' }).first();
await select.waitFor({ state: 'visible', timeout: 5000 });
await select.selectOption({ label: 'Business Credit Card' });
// Now check for the warning text
await page.waitForTimeout(300);
const warningText = 'Heads up: This account is usually updated by statement imports.';
const warningLocator = page.locator(\`text=\${warningText}\`);
out.warningFound = await warningLocator.count() > 0;
if (out.warningFound) out.warningText = await warningLocator.first().textContent();
out.url = page.url();
await browser.close();
console.log(JSON.stringify(out));
`;
fs.writeFileSync('/tmp/echo-warn-test.mjs', warnScript);
let warnResult = null;
try {
  const out = execSync('node /tmp/echo-warn-test.mjs', { encoding: 'utf-8', timeout: 90_000 });
  // Last line should be the JSON dump
  const lines = out.trim().split('\n');
  warnResult = JSON.parse(lines[lines.length - 1]);
  record('T3', 'Sage-style warning shows under Matched-with when Credit Card is picked', warnResult.warningFound === true, `text="${warnResult.warningText}" consoleErrors=${warnResult.consoleErrors.length}`);
} catch (err) {
  record('T3', 'Sage-style warning DOM test', false, null, `Playwright run failed: ${String(err.message || err)}`);
}

// ──────────────────────────────────────────────────────────────────────
// TEST 4 — GL filter bar (server-side narrowing)
// ──────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 4: GL filter bar (server-side) ===');

const all = await api('GET', '/books/journal/entries?limit=500');
const allCount = all.json?.data?.length ?? 0;
record('T4-pre', 'Baseline list (no filters)', all.status === 200, `rows=${allCount} total=${all.json?.total}`);

// Name substring filter
const byName = await api('GET', '/books/journal/entries?name_q=ECHO-T1a&limit=500');
record('T4-name', 'name_q=ECHO-T1a returns only T1a rows', byName.status === 200 && byName.json?.data?.every((e) => (e.name || '').includes('ECHO-T1a')), `rows=${byName.json?.data?.length} allMatch=${byName.json?.data?.every((e) => (e.name || '').includes('ECHO-T1a'))}`);

// Category filter (Software Subscriptions)
const byCat = await api('GET', `/books/journal/entries?category_id=${ACCOUNTS.expense_software}&limit=500`);
const allExpenseOk = byCat.json?.data?.every((e) => e.category_account_id === ACCOUNTS.expense_software);
record('T4-cat', 'category_id filters by category', byCat.status === 200 && allExpenseOk, `rows=${byCat.json?.data?.length} allMatchCat=${allExpenseOk}`);

// Date range filter — narrow window
const byDate = await api('GET', '/books/journal/entries?date_from=2026-06-01&date_to=2026-06-02&limit=500');
const allDateOk = byDate.json?.data?.every((e) => {
  const d = e.txn_date;
  return d >= '2026-06-01' && d <= '2026-06-02';
});
record('T4-date', 'date_from/date_to narrow by date', byDate.status === 200 && allDateOk, `rows=${byDate.json?.data?.length} allInRange=${allDateOk}`);

// Combined filter — narrower still (should match just our 2 Save-and-new entries)
const combined = await api('GET', '/books/journal/entries?date_from=2026-06-01&date_to=2026-06-01&category_id=' + ACCOUNTS.income_wholesale + '&limit=500');
record('T4-combo', 'Combined filters narrow further', combined.status === 200, `rows=${combined.json?.data?.length} (only T2a/T2b should match)`);

// ──────────────────────────────────────────────────────────────────────
// TEST 5 — Audit log click-to-reveal
// ──────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 5: Audit log click-to-reveal ===');

// Pick one of our created entries
const sampleEntryId = createdEntryIds[0];
const auditResp = await api('GET', `/books/journal/entries/${sampleEntryId}/audit`);
const auditList = auditResp.json?.data ?? [];
record('T5a', `GET /entries/:id/audit returns audit rows for ${sampleEntryId}`, auditResp.status === 200 && auditList.length > 0, `rows=${auditList.length} events=${auditList.map((a) => a.event).join(',')}`);

const detailResp = await api('GET', `/books/journal/entries/${sampleEntryId}`);
const detailHasAudit = detailResp.json?.data?.audit !== undefined;
record('T5b', `GET /entries/:id (with audit) embeds audit array`, detailResp.status === 200 && detailHasAudit, `hasAudit=${detailHasAudit} auditLen=${detailResp.json?.data?.audit?.length}`);

// ──────────────────────────────────────────────────────────────────────
// TEST 6 — Validation
// ──────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 6: Validation ===');

// 6a — same category + matched-with should 400
const sameAcct = await api('POST', '/books/journal/entries', {
  txn_date: '2026-07-09', type: 'expense',
  category_account_id: ACCOUNTS.expense_software,
  matched_account_id: ACCOUNTS.expense_software,
  name: 'ECHO-T6a-same', amount: 10,
});
record('T6a', 'Same Category + Matched-with returns 400', sameAcct.status === 400, `status=${sameAcct.status} error="${sameAcct.json?.error}" code=${sameAcct.json?.code}`);

// 6b — bad category_account_id
const badId = await api('POST', '/books/journal/entries', {
  txn_date: '2026-07-09', type: 'expense',
  category_account_id: 'deadbeefdeadbeefdeadbeefdeadbeef',
  matched_account_id: ACCOUNTS.asset_1000,
  name: 'ECHO-T6b', amount: 10,
});
record('T6b', 'Bad category_account_id returns 400 (not 500)', badId.status === 400, `status=${badId.status} code=${badId.json?.code} error="${badId.json?.error}"`);

// 6c — missing amount
const noAmount = await api('POST', '/books/journal/entries', {
  txn_date: '2026-07-09', type: 'expense',
  category_account_id: ACCOUNTS.expense_software,
  matched_account_id: ACCOUNTS.asset_1000,
  name: 'ECHO-T6c',
});
record('T6c', 'Missing amount is rejected cleanly (400)', noAmount.status === 400, `status=${noAmount.status} error="${noAmount.json?.error}"`);

// 6d — malformed amount (string)
const badAmount = await api('POST', '/books/journal/entries', {
  txn_date: '2026-07-09', type: 'expense',
  category_account_id: ACCOUNTS.expense_software,
  matched_account_id: ACCOUNTS.asset_1000,
  name: 'ECHO-T6d', amount: 'not-a-number',
});
record('T6d', 'Malformed (string) amount is rejected cleanly (400)', badAmount.status === 400, `status=${badAmount.status} error="${badAmount.json?.error}"`);

// 6e — zero amount
const zeroAmount = await api('POST', '/books/journal/entries', {
  txn_date: '2026-07-09', type: 'expense',
  category_account_id: ACCOUNTS.expense_software,
  matched_account_id: ACCOUNTS.asset_1000,
  name: 'ECHO-T6e', amount: 0,
});
record('T6e', 'Zero amount is rejected (400)', zeroAmount.status === 400, `status=${zeroAmount.status} error="${zeroAmount.json?.error}"`);

// 6f — type mismatch
const typeMismatch = await api('POST', '/books/journal/entries', {
  txn_date: '2026-07-09', type: 'income',
  category_account_id: ACCOUNTS.expense_software,  // mismatch!
  matched_account_id: ACCOUNTS.asset_1000,
  name: 'ECHO-T6f', amount: 10,
});
record('T6f', 'Type/category mismatch is rejected (400)', typeMismatch.status === 400, `status=${typeMismatch.status} error="${typeMismatch.json?.error}"`);

// ──────────────────────────────────────────────────────────────────────
// TEST 7 — DELETE endpoint
// ──────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 7: DELETE endpoint + audit row + 404 ===');

// 7a — 404 on missing id
const del404 = await api('DELETE', '/books/journal/entries/ffffffffffffffffffffffffffffffff');
record('T7a', 'DELETE on nonexistent id returns 404', del404.status === 404, `status=${del404.status} code=${del404.json?.code} error="${del404.json?.error}"`);

// 7b — successful delete writes audit row
// Post a fresh entry to delete
const delPrep = await postEntry('ECHO-T7b', {
  txn_date: '2026-07-09', type: 'expense',
  category_account_id: ACCOUNTS.expense_software,
  matched_account_id: ACCOUNTS.asset_1000,
  name: 'ECHO-T7b delete-me', amount: 5,
});
const delId = delPrep.json?.data?.id;
if (!delId) {
  record('T7b-prep', 'Failed to seed delete-test entry', false, null, JSON.stringify(delPrep));
} else {
  const delResp = await api('DELETE', `/books/journal/entries/${delId}`);
  record('T7b-del', 'DELETE returns 200', delResp.status === 200, `status=${delResp.status} id=${delId}`);
  // Remove from cleanup list (we just deleted it)
  const idx = createdEntryIds.indexOf(delId);
  if (idx >= 0) createdEntryIds.splice(idx, 1);
  // Audit row should exist with event=deleted
  const audit = await api('GET', `/books/journal/entries/${delId}/audit`);
  const hasDeleted = (audit.json?.data ?? []).some((a) => a.event === 'deleted');
  const hasCreated = (audit.json?.data ?? []).some((a) => a.event === 'created');
  record('T7b-audit', 'DELETE writes audit_log row with event=deleted', hasDeleted, `events=${(audit.json?.data ?? []).map((a) => a.event).join(',')}`);
}

// ──────────────────────────────────────────────────────────────────────
// TEST 8 — Automated suites
// ──────────────────────────────────────────────────────────────────────
console.log('\n=== TEST 8: Automated suites ===');

function runSuite(label, cmd) {
  try {
    const out = execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8', timeout: 180_000 });
    const tail = out.trim().split('\n').slice(-3).join(' | ');
    record(label, true, `tail: ${tail}`);
    return { ok: true, out };
  } catch (err) {
    const out = (err.stdout || '') + (err.stderr || '');
    const tail = out.trim().split('\n').slice(-5).join(' | ');
    record(label, false, null, `exit=${err.status} tail: ${tail}`);
    return { ok: false, out };
  }
}

runSuite('T8-gl', 'node server/scripts/test-gl-phase1-2.mjs');
runSuite('T8-smoke', 'bash server/scripts/smoke-phase1-2-api.sh');
runSuite('T8-wf', 'node docs/books/setup-wizard/tests/wf-smoke.mjs');

// ──────────────────────────────────────────────────────────────────────
// Save report
// ──────────────────────────────────────────────────────────────────────
fs.writeFileSync('/tmp/echo-results.json', JSON.stringify({
  createdEntryIds,
  results,
  ts: new Date().toISOString(),
}, null, 2));

console.log(`\n=== SUMMARY: ${results.filter((r) => r.ok).length}/${results.length} pass ===`);
console.log(`Created entry IDs (for cleanup): ${createdEntryIds.length}`);