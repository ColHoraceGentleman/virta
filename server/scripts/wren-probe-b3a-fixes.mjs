// Standalone Wren verification probe for B3a-fixes round.
// Verifies:
//  A. System-account (Review Later) Hide/Delete guard (disabled spans, tooltip, no-op click)
//  A-negative. Non-system row (Advertising) Hide/Delete still work
//  B. IRS_LINE_OPTIONS popover shows Line 15a/15b/25a/25b for the 4 new rows
// Run: node server/scripts/wren-probe-b3a-fixes.mjs
import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9226;
const APP_URL = 'http://localhost:5173';
const STORAGE_KEY = 'virta_books:wizard:categories:state';

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
  return send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
}
async function evalValue(send, expr) {
  const r = await evalInPage(send, expr);
  return r && r.result ? r.result.value : undefined;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(id, label, pass, detail) {
  results.push({ id, label, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${id}  ${label}${detail ? '  · ' + detail : ''}`);
}

async function main() {
  const userDataDir = `/tmp/chrome-wren-probe-b3a-fixes-${Date.now()}`;
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
    '--window-size=1280,1400', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const waitForChrome = async () => {
    for (let i = 0; i < 80; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch {}
      await wait(100);
    }
    throw new Error('chrome did not start');
  };
  await waitForChrome();

  const newTarget = await fetch(
    `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP_URL + '/books/categories/wizard')}`,
    { method: 'PUT' }
  ).then((r) => r.json());
  const ws = await new Promise((resolve, reject) => {
    const w = new WebSocket(newTarget.webSocketDebuggerUrl);
    w.addEventListener('open', () => resolve(w));
    w.addEventListener('error', reject);
  });
  const send = makeSend(ws);
  await send('Runtime.enable');
  await send('Page.enable');
  await wait(1500);

  await evalInPage(send, `window.localStorage.removeItem('${STORAGE_KEY}')`);
  await evalInPage(send, `window.location.reload()`);
  await wait(1500);

  // Advance to step 2
  await evalInPage(send, `document.querySelector('[data-testid="cat-wizard-step1-next"]').click()`);
  await wait(500);

  const step2Present = await evalValue(send, `!!document.querySelector('[data-testid="cat-wizard-step2"]')`);
  check('SETUP', 'Step 2 rendered', step2Present);

  // Find Review Later row's account id via the disabled hide span
  const reviewLaterInfo = await evalValue(send, `
    (function(){
      const hideSpan = document.querySelector('[data-testid^="expense-hide-disabled-"]');
      const deleteSpan = document.querySelector('[data-testid^="expense-delete-disabled-"]');
      const rows = Array.from(document.querySelectorAll('[data-testid^="expense-name-"]'));
      const reviewLaterRow = rows.find(r => r.textContent.trim().includes('Review Later'));
      return {
        hideExists: !!hideSpan,
        hideTitle: hideSpan ? hideSpan.getAttribute('title') : null,
        hideTag: hideSpan ? hideSpan.tagName : null,
        deleteExists: !!deleteSpan,
        deleteTitle: deleteSpan ? deleteSpan.getAttribute('title') : null,
        deleteTag: deleteSpan ? deleteSpan.tagName : null,
        reviewLaterRowText: reviewLaterRow ? reviewLaterRow.closest('tr').textContent.replace(/\\s+/g,' ').trim() : null,
      };
    })()
  `);
  check('A-1', 'Review Later Hide renders as disabled <span> with exact tooltip', reviewLaterInfo.hideExists && reviewLaterInfo.hideTag === 'SPAN' && reviewLaterInfo.hideTitle === "Review Later can't be hidden or deleted.", `title="${reviewLaterInfo.hideTitle}"`);
  check('A-2', 'Review Later Delete renders as disabled <span> with exact tooltip', reviewLaterInfo.deleteExists && reviewLaterInfo.deleteTag === 'SPAN' && reviewLaterInfo.deleteTitle === "Review Later can't be hidden or deleted.", `title="${reviewLaterInfo.deleteTitle}"`);
  check('A-3', 'Review Later row visible in Step 2 table', !!reviewLaterInfo.reviewLaterRowText, reviewLaterInfo.reviewLaterRowText);

  // Confirm clicking spans is a no-op: count rows before/after a click sequence
  const countBefore = await evalValue(send, `document.querySelectorAll('[data-testid^="expense-name-"]').length`);
  await evalInPage(send, `document.querySelector('[data-testid^="expense-hide-disabled-"]').click()`);
  await evalInPage(send, `document.querySelector('[data-testid^="expense-delete-disabled-"]').click()`);
  await wait(300);
  const countAfter = await evalValue(send, `document.querySelectorAll('[data-testid^="expense-name-"]').length`);
  const modalOpenedAfterClick = await evalValue(send, `!!document.querySelector('[data-testid="expense-delete-confirm-modal"], [data-testid*="delete-confirm"]')`);
  check('A-4', 'Clicking disabled spans is a no-op (no row removed, no confirm modal)', countBefore === countAfter && !modalOpenedAfterClick, `before=${countBefore} after=${countAfter} modalOpened=${modalOpenedAfterClick}`);

  // Negative test: Advertising (non-system) Hide + Delete still work
  const advInfo = await evalValue(send, `
    (function(){
      const rows = Array.from(document.querySelectorAll('tr'));
      const advRow = rows.find(r => {
        const nameCell = r.querySelector('[data-testid^="expense-name-"]');
        return nameCell && nameCell.textContent.trim() === 'Advertising';
      });
      if (!advRow) return { found: false };
      const hideBtn = advRow.querySelector('[data-testid^="expense-hide-"]:not([data-testid*="disabled"])');
      const deleteEl = advRow.querySelector('[data-testid^="expense-delete-"]');
      return {
        found: true,
        hideIsButton: hideBtn ? hideBtn.tagName === 'BUTTON' : false,
        hideLabel: hideBtn ? hideBtn.textContent.trim() : null,
        deleteTag: deleteEl ? deleteEl.tagName : null,
      };
    })()
  `);
  check('A-neg-1', 'Advertising (non-system) Hide is an active <button>, not disabled', advInfo.found && advInfo.hideIsButton, `hideLabel=${advInfo.hideLabel}`);

  // Click Advertising's Hide button and confirm label flips
  await evalInPage(send, `
    (function(){
      const rows = Array.from(document.querySelectorAll('tr'));
      const advRow = rows.find(r => {
        const nameCell = r.querySelector('[data-testid^="expense-name-"]');
        return nameCell && nameCell.textContent.trim() === 'Advertising';
      });
      const hideBtn = advRow.querySelector('[data-testid^="expense-hide-"]:not([data-testid*="disabled"])');
      hideBtn.click();
    })()
  `);
  await wait(300);
  const advLabelAfter = await evalValue(send, `
    (function(){
      const rows = Array.from(document.querySelectorAll('tr'));
      const advRow = rows.find(r => {
        const nameCell = r.querySelector('[data-testid^="expense-name-"]');
        return nameCell && nameCell.textContent.trim() === 'Advertising';
      });
      const hideBtn = advRow.querySelector('[data-testid^="expense-hide-"]:not([data-testid*="disabled"])');
      return hideBtn ? hideBtn.textContent.trim() : null;
    })()
  `);
  check('A-neg-2', 'Advertising Hide still works (label flips to Unhide)', advLabelAfter === 'Unhide', `label=${advLabelAfter}`);

  // B: IRS line popover checks. Open tax-line popover for 4 rows and confirm selected value.
  async function checkTaxLine(rowName, expectedLine, checkId) {
    const val = await evalValue(send, `
      (async function(){
        const rows = Array.from(document.querySelectorAll('tr'));
        const row = rows.find(r => {
          const nameCell = r.querySelector('[data-testid^="expense-name-"]');
          return nameCell && nameCell.textContent.trim() === ${JSON.stringify(rowName)};
        });
        if (!row) return { found: false };
        const taxCell = row.querySelector('[data-testid^="expense-taxline-badge-"]');
        if (!taxCell) return { found: true, cellFound: false, text: row.textContent };
        return { found: true, cellFound: true, text: taxCell.textContent.trim() };
      })()
    `);
    check(checkId, `${rowName} tax-line cell shows ${expectedLine}`, val.found && val.cellFound && val.text === expectedLine, `text="${val.text}"`);
  }
  await checkTaxLine('Mortgage Interest', 'Line 15a', 'B-1');
  await checkTaxLine('Interest', 'Line 15b', 'B-2');
  await checkTaxLine('Utilities', 'Line 25a', 'B-3');
  await checkTaxLine('Phone', 'Line 25b', 'B-4');

  // Also open the popover <select> for one row and confirm the actual <option selected> matches
  const popoverSelect = await evalValue(send, `
    (async function(){
      const rows = Array.from(document.querySelectorAll('tr'));
      const row = rows.find(r => {
        const nameCell = r.querySelector('[data-testid^="expense-name-"]');
        return nameCell && nameCell.textContent.trim() === 'Mortgage Interest';
      });
      const taxCell = row.querySelector('[data-testid^="expense-taxline-badge-"]');
      taxCell.click();
      await new Promise(r => setTimeout(r, 300));
      const select = document.querySelector('select[data-testid^="expense-taxline-select-"], select');
      if (!select) return { found: false };
      return { found: true, value: select.value };
    })()
  `);
  check('B-5', 'Mortgage Interest tax-line popover <select> value = Line 15a', popoverSelect.found && popoverSelect.value === 'Line 15a', `value="${popoverSelect.value}"`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} probe checks passing`);
  if (failed.length) {
    console.log('FAILED:', failed.map((f) => f.id).join(', '));
  }

  await send('Page.close').catch(() => {});
  chrome.kill();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('PROBE ERROR', e);
  process.exit(2);
});
