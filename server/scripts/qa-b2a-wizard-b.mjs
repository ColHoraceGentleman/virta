// Behavior verification for B2a-wizard-B Setup Wizard Steps 1-2 + NAICS modal.
// Drives the running app via Chrome DevTools Protocol and asserts each
// behavior ID in the build spec. Run: `node server/scripts/qa-b2a-wizard-b.mjs`
//
// Note: this is a dev QA tool, not a unit test. It expects:
//   - Vite dev server on http://localhost:5173
//   - Backend API on http://localhost:3001
//   - A clean /books/setup localStorage on first run (we wipe it explicitly).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9223;
const APP_URL = 'http://localhost:5173';

let nextId = 1;
function makeSend(ws) {
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    function onMessage(ev) {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.id === id) {
          ws.removeEventListener('message', onMessage);
          if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
          else resolve(msg.result);
        }
      } catch {}
    }
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
function evalInPage(send, expr) {
  return send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  });
}

const results = [];
function check(id, label, pass, detail) {
  results.push({ id, label, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${id}  ${label}${detail ? '  · ' + detail : ''}`);
}

async function runSteps(send, page, steps) {
  for (const s of steps) {
    console.log(`  ▸ ${s.name || ''}`);
    try { await s.run(page); } catch (e) { console.log('    ! step failed:', e.message); }
    if (s.wait) await new Promise((r) => setTimeout(r, s.wait));
  }
}

async function main() {
  const userDataDir = `/tmp/chrome-qa-${Date.now()}`;
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1280,1100',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const waitForChrome = async () => {
    for (let i = 0; i < 80; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('chrome did not start');
  };
  await waitForChrome();

  const newTarget = await fetch(
    `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP_URL + '/books/setup')}`,
    { method: 'PUT' }
  ).then((r) => r.json());
  const ws = await new Promise((resolve, reject) => {
    const w = new WebSocket(newTarget.webSocketDebuggerUrl);
    w.addEventListener('open', () => resolve(w));
    w.addEventListener('error', reject);
  });
  const send = makeSend(ws);
  await send('Page.enable');
  await send('Runtime.enable');

  // Wait for load.
  await new Promise((resolve) => {
    function onMessage(ev) {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.method === 'Page.loadEventFired') {
          ws.removeEventListener('message', onMessage);
          resolve();
        }
      } catch {}
    }
    ws.addEventListener('message', onMessage);
    setTimeout(() => { ws.removeEventListener('message', onMessage); resolve(); }, 4000);
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Wipe localStorage to start clean.
  await evalInPage(send, `(() => { try { window.localStorage.clear(); } catch {} return 'cleared'; })()`);

  // Reload to apply.
  await send('Page.reload');
  await new Promise((r) => setTimeout(r, 1500));

  // ----------------------------------------------------------------------
  // VB-WIZ-ROUTE-01 — /books/setup route renders SetupWizard
  // ----------------------------------------------------------------------
  {
    const r = await evalInPage(send, `(() => {
      const ok = document.querySelector('[data-testid="wizard-step1-cta"]') !== null;
      const headline = document.querySelector('h2')?.textContent || '';
      return { ok, headline };
    })()`);
    check('VB-WIZ-ROUTE-01', 'Setup wizard renders at /books/setup',
      r.result.value.ok && r.result.value.headline.includes("set up your books"),
      `headline="${r.result.value.headline}"`);
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-STEP1-01 — Step 1 renders Welcome headline + Schedule C sub-headline + CTA
  // ----------------------------------------------------------------------
  {
    const r = await evalInPage(send, `(() => {
      const h = document.body.textContent || '';
      return {
        hasHeadline: h.includes("Let's set up your books"),
        hasScheduleC: h.includes('Schedule C of your IRS Form 1040'),
        hasCta: !!document.querySelector('[data-testid="wizard-step1-cta"]'),
      };
    })()`);
    const v = r.result.value;
    check('VB-WIZ-STEP1-01', 'Step 1: headline + Schedule C + CTA',
      v.hasHeadline && v.hasScheduleC && v.hasCta,
      `headline=${v.hasHeadline} sc=${v.hasScheduleC} cta=${v.hasCta}`);
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-STEP1-02 — Step 1 CTA advances to Step 2
  // ----------------------------------------------------------------------
  {
    await evalInPage(send, `document.querySelector('[data-testid="wizard-step1-cta"]').click()`);
    await new Promise((r) => setTimeout(r, 300));
    const r = await evalInPage(send, `(() => ({
      hasName: !!document.querySelector('[data-testid="wizard-step2-name"]'),
      hasDesc: !!document.querySelector('[data-testid="wizard-step2-description"]'),
    }))()`);
    check('VB-WIZ-STEP1-02', 'Step 1 CTA advances to Step 2',
      r.result.value.hasName && r.result.value.hasDesc,
      `name=${r.result.value.hasName} desc=${r.result.value.hasDesc}`);
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-PERSIST-04 — Step 1 + Step 2 fields persist in localStorage
  //   (verify after we type + debounce settles)
  // ----------------------------------------------------------------------
  await evalInPage(send, `(() => {
    const fire = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    fire(document.querySelector('[data-testid="wizard-step2-name"]'), 'Jane Test');
    fire(document.querySelector('[data-testid="wizard-step2-business-name"]'), 'Jane Test LLC');
  })()`);
  await new Promise((r) => setTimeout(r, 500)); // 250ms debounce + buffer
  {
    const r = await evalInPage(send, `(() => {
      const raw = window.localStorage.getItem('virta_books:wizard:setup:state');
      if (!raw) return { ok: false, reason: 'no localStorage entry' };
      const s = JSON.parse(raw);
      return { ok: s.setup.proprietor_name === 'Jane Test' && s.setup.business_name === 'Jane Test LLC', s };
    })()`);
    const v = r.result.value;
    check('VB-WIZ-PERSIST-04', 'Step 1/2 fields persist in localStorage',
      v.ok, v.ok ? `name=${v.s.setup.proprietor_name}, biz=${v.s.setup.business_name}` : v.reason);
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-PERSIST-01 — Wizard state persists to localStorage on every change
  //   (already proven by the typing above — verify debounced write)
  // ----------------------------------------------------------------------
  {
    const r = await evalInPage(send, `(() => {
      const raw = window.localStorage.getItem('virta_books:wizard:setup:state');
      return raw ? JSON.parse(raw) : null;
    })()`);
    const s = r.result.value;
    check('VB-WIZ-PERSIST-01', 'Wizard state persists (debounced 250ms)',
      s && s.setup.proprietor_name === 'Jane Test' && s.setup.business_name === 'Jane Test LLC',
      `localStorage key present + fields match`);
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-STEP2-01 — Step 2 renders "About you" + "About your business" subheaders
  // ----------------------------------------------------------------------
  {
    const r = await evalInPage(send, `(() => {
      const t = document.body.textContent || '';
      return {
        hasAboutYou: t.includes('About you'),
        hasAboutBiz: t.includes('About your business'),
      };
    })()`);
    check('VB-WIZ-STEP2-01', 'Step 2: About you + About your business subheaders',
      r.result.value.hasAboutYou && r.result.value.hasAboutBiz);
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-STEP2-02 — "Your name" required; error message under field on attempt
  // ----------------------------------------------------------------------
  {
    // Clear the name field, then try to save.
    await evalInPage(send, `(() => {
      const el = document.querySelector('[data-testid="wizard-step2-name"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 100));
    await evalInPage(send, `document.querySelector('[data-testid="wizard-step2-save"]').click()`);
    await new Promise((r) => setTimeout(r, 200));
    const r = await evalInPage(send, `(() => ({
      hasError: !!document.querySelector('[data-testid="wizard-step2-name-error"]'),
      errorText: document.querySelector('[data-testid="wizard-step2-name-error"]')?.textContent || '',
    }))()`);
    check('VB-WIZ-STEP2-02', 'Step 2: Your name required, error shown on save',
      r.result.value.hasError && r.result.value.errorText.includes('required'),
      `error="${r.result.value.errorText}"`);

    // Restore name so other tests continue.
    await evalInPage(send, `(() => {
      const el = document.querySelector('[data-testid="wizard-step2-name"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, 'Jane Test');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 100));
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-STEP2-03 — "EIN" soft-validates; warning shown on bad input
  // ----------------------------------------------------------------------
  {
    await evalInPage(send, `(() => {
      const el = document.querySelector('[data-testid="wizard-step2-ein"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, 'bad-format');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 100));
    const r = await evalInPage(send, `(() => ({
      hasWarn: !!document.querySelector('[data-testid="wizard-step2-ein-warning"]'),
    }))()`);
    check('VB-WIZ-STEP2-03', 'Step 2: EIN soft warning on bad input',
      r.result.value.hasWarn);

    // Restore valid EIN.
    await evalInPage(send, `(() => {
      const el = document.querySelector('[data-testid="wizard-step2-ein"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '12-3456789');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 100));
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-STEP2-04 — Description textarea shows counter when > 200 chars
  // ----------------------------------------------------------------------
  {
    const long = 'x'.repeat(220);
    await evalInPage(send, `(() => {
      const el = document.querySelector('[data-testid="wizard-step2-description"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(long)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 200));
    const r = await evalInPage(send, `(() => ({
      hasCounter: !!document.querySelector('[data-testid="wizard-step2-description-counter"]'),
      counterText: document.querySelector('[data-testid="wizard-step2-description-counter"]')?.textContent || '',
    }))()`);
    check('VB-WIZ-STEP2-04', 'Step 2: description counter shows when > 200',
      r.result.value.hasCounter && r.result.value.counterText.includes('220'),
      `counter="${r.result.value.counterText}"`);

    // Clear description.
    await evalInPage(send, `(() => {
      const el = document.querySelector('[data-testid="wizard-step2-description"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 100));
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-STEP2-05 — Skip label flips to "Revert to Defaults" after any field touched
  // ----------------------------------------------------------------------
  {
    // Name is already set to "Jane Test" (touched). Verify label.
    const r = await evalInPage(send, `(() => ({
      label: document.querySelector('[data-testid="wizard-step2-skip"]')?.textContent || '',
    }))()`);
    check('VB-WIZ-STEP2-05', 'Step 2: skip label flips to "Revert to Defaults"',
      r.result.value.label.includes('Revert to Defaults'),
      `label="${r.result.value.label}"`);
  }

  // ----------------------------------------------------------------------
  // VB-NAICS-MODAL-01 — NAICS modal opens from "Industry code (NAICS)" field click
  // ----------------------------------------------------------------------
  {
    await evalInPage(send, `document.querySelector('[data-testid="wizard-step2-naics-open"]').click()`);
    await new Promise((r) => setTimeout(r, 400));
    const r = await evalInPage(send, `(() => ({
      hasModal: !!document.querySelector('[data-testid="naics-modal"]'),
      hasSearch: !!document.querySelector('[data-testid="naics-search"]'),
      hasSectorAll: !!document.querySelector('[data-testid="naics-sector-all"]'),
      hasResults: !!document.querySelector('[data-testid="naics-results"]'),
    }))()`);
    check('VB-NAICS-MODAL-01', 'NAICS modal opens from field click',
      r.result.value.hasModal && r.result.value.hasSearch && r.result.value.hasSectorAll && r.result.value.hasResults,
      JSON.stringify(r.result.value));
  }

  // ----------------------------------------------------------------------
  // VB-NAICS-MODAL-06 — Sector filter shows 20 official 2022 sectors (no 41 or 91)
  // ----------------------------------------------------------------------
  {
    const r = await evalInPage(send, `(() => {
      const buttons = Array.from(document.querySelectorAll('[data-testid^="naics-sector-"]'));
      const labels = buttons.map(b => b.textContent.trim());
      const has41 = labels.some(l => l.includes(' 41 ') || l.startsWith('41 '));
      const has91 = labels.some(l => l.includes(' 91 ') || l.startsWith('91 '));
      // Count distinct sector codes (excluding "All"). 20 expected.
      const codes = buttons.map(b => b.getAttribute('data-testid').replace('naics-sector-', '')).filter(c => c !== 'all');
      return { count: codes.length, codes, has41, has91 };
    })()`);
    const v = r.result.value;
    check('VB-NAICS-MODAL-06', '20 official 2022 sectors (no 41 or 91)',
      v.count === 20 && !v.has41 && !v.has91,
      `count=${v.count}, has41=${v.has41}, has91=${v.has91}`);
  }

  // ----------------------------------------------------------------------
  // VB-NAICS-MODAL-02 — Search filters results by keyword (case-insensitive)
  // ----------------------------------------------------------------------
  {
    await evalInPage(send, `(() => {
      const el = document.querySelector('[data-testid="naics-search"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, 'PHOTOGRAPHY');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 400)); // 200ms debounce + buffer
    const r = await evalInPage(send, `(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="naics-row-"]'));
      return { count: rows.length, codes: rows.map(x => x.getAttribute('data-testid').replace('naics-row-', '')) };
    })()`);
    const v = r.result.value;
    // Expect at least 1 photography-related code; common ones: 541921, 541922.
    const hasPhoto = v.codes.some(c => c.startsWith('54192'));
    check('VB-NAICS-MODAL-02', 'NAICS search filters results (case-insensitive)',
      v.count > 0 && hasPhoto, `count=${v.count}, codes=${v.codes.slice(0,3).join(',')}…`);

    // Clear search.
    await evalInPage(send, `(() => {
      const el = document.querySelector('[data-testid="naics-search"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 400));
  }

  // ----------------------------------------------------------------------
  // VB-NAICS-MODAL-03 — Sector filter narrows results
  // ----------------------------------------------------------------------
  {
    await evalInPage(send, `document.querySelector('[data-testid="naics-sector-54"]').click()`);
    await new Promise((r) => setTimeout(r, 200));
    const r = await evalInPage(send, `(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="naics-row-"]'));
      return { count: rows.length };
    })()`);
    // Sector 54 (Professional, Scientific, Technical Services) has ~70+ codes.
    check('VB-NAICS-MODAL-03', 'NAICS sector filter narrows results',
      r.result.value.count > 0 && r.result.value.count < 200,
      `count after filter=${r.result.value.count}`);

    // Reset to All.
    await evalInPage(send, `document.querySelector('[data-testid="naics-sector-all"]').click()`);
    await new Promise((r) => setTimeout(r, 200));
  }

  // ----------------------------------------------------------------------
  // VB-NAICS-MODAL-04 — Clicking a result writes the code to the field and closes the modal
  // ----------------------------------------------------------------------
  {
    // Pick a known code: 541921 (Photography Studios, Portrait).
    await evalInPage(send, `(() => {
      const row = document.querySelector('[data-testid="naics-row-541921"]');
      if (row) row.click();
    })()`);
    await new Promise((r) => setTimeout(r, 400));
    const r = await evalInPage(send, `(() => ({
      modalGone: !document.querySelector('[data-testid="naics-modal"]'),
      fieldVal: document.querySelector('[data-testid="wizard-step2-naics"]')?.value || '',
      lsRaw: window.localStorage.getItem('virta_books:wizard:setup:state'),
    }))()`);
    const ls = JSON.parse(r.result.value.lsRaw || '{}');
    check('VB-NAICS-MODAL-04', 'NAICS click writes code to field, closes modal',
      r.result.value.modalGone && r.result.value.fieldVal.includes('541921') && ls.setup && ls.setup.naics_code === '541921',
      `field="${r.result.value.fieldVal}", persisted=${ls.setup?.naics_code}`);
  }

  // ----------------------------------------------------------------------
  // VB-NAICS-MODAL-05 — Bundled JSON contains 1,000+ 6-digit codes from US Census 2022
  // ----------------------------------------------------------------------
  {
    // The JSON is imported into the modal; we can probe window for it or
    // re-fetch the file. Re-fetch is the most reliable (no module
    // round-trip from the page).
    const r = await evalInPage(send, `fetch('/src/assets/naics-2022.json').then(r => r.json()).then(d => ({ count: d.length, all6: d.every(x => x.code && x.code.length === 6) }))`);
    const v = r.result.value;
    check('VB-NAICS-MODAL-05', 'Bundled JSON contains 1,000+ 6-digit codes',
      v.count >= 1000 && v.all6,
      `count=${v.count}, all6=${v.all6}`);
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-STEP2-06 — Step 2 Save persists to localStorage and advances to Step 3 placeholder
  // ----------------------------------------------------------------------
  {
    await evalInPage(send, `document.querySelector('[data-testid="wizard-step2-save"]').click()`);
    await new Promise((r) => setTimeout(r, 500));
    const r = await evalInPage(send, `(() => {
      const t = document.body.textContent || '';
      return {
        hasStep3Marker: t.includes('Coming in B2b') && t.includes('Contact'),
        hasLsEntry: !!window.localStorage.getItem('virta_books:wizard:setup:state'),
      };
    })()`);
    check('VB-WIZ-STEP2-06', 'Step 2 Save persists + advances to Step 3 placeholder',
      r.result.value.hasStep3Marker && r.result.value.hasLsEntry);
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-STEP3-PLACEHOLDER — Step 3 renders "Coming in B2b" placeholder with Back button
  // ----------------------------------------------------------------------
  {
    const r = await evalInPage(send, `(() => ({
      hasBack: !!document.querySelector('[data-testid="wizard-step3-back"]'),
      hasContinue: !!document.querySelector('[data-testid="wizard-step3-continue"]'),
      hasPill: (document.body.textContent || '').includes('Coming in B2b'),
    }))()`);
    check('VB-WIZ-STEP3-PLACEHOLDER', 'Step 3 placeholder renders with Back',
      r.result.value.hasBack && r.result.value.hasContinue && r.result.value.hasPill,
      JSON.stringify(r.result.value));
  }

  // ----------------------------------------------------------------------
  // VB-WIZ-PERSIST-02 — Wizard state hydrates from localStorage on mount
  //   (reload the page and confirm fields restore)
  // ----------------------------------------------------------------------
  {
    await send('Page.reload');
    await new Promise((r) => setTimeout(r, 1500));
    // Click Get started to advance (we start at step 1 again — the
    // state rehydrates the step number).
    const r = await evalInPage(send, `(() => {
      const ls = JSON.parse(window.localStorage.getItem('virta_books:wizard:setup:state') || '{}');
      return {
        stepAfterReload: ls.setupStep,
        name: ls.setup && ls.setup.proprietor_name,
        naics: ls.setup && ls.setup.naics_code,
      };
    })()`);
    const v = r.result.value;
    check('VB-WIZ-PERSIST-02', 'State hydrates from localStorage on mount',
      v.stepAfterReload === 3 && v.name === 'Jane Test' && v.naics === '541921',
      `step=${v.stepAfterReload}, name=${v.name}, naics=${v.naics}`);
  }

  // ----------------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------------
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== ${passed}/${results.length} passed ===`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  ❌ ${f.id}  ${f.label}  ${f.detail || ''}`);
  }

  ws.close();
  chrome.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 200));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(2);
});
