// One-off screenshot capture for B3a demos. Not part of the QA harness —
// just drives Chrome via CDP to the wizard steps and captures PNGs into
// demos/2026.07.14-b3a/. Run: node server/scripts/screenshot-b3a.mjs
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9226;
const APP_URL = 'http://localhost:5173';
const STORAGE_KEY = 'virta_books:wizard:categories:state';
const OUT_DIR = 'demos/2026.07.14-b3a';

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(send, name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT_DIR}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.log(`saved ${OUT_DIR}/${name}.png`);
}

async function main() {
  const userDataDir = `/tmp/chrome-shot-b3a-${Date.now()}`;
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
    '--window-size=1280,1000', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {}
    await wait(100);
  }

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
  await wait(1200);

  await evalInPage(send, `window.localStorage.removeItem('${STORAGE_KEY}')`);
  await evalInPage(send, `window.location.reload()`);
  await wait(1200);

  // Step 1 — Welcome
  await shot(send, 'step1-welcome');

  // Step 2 — Expenses (default sort)
  await evalInPage(send, `document.querySelector('[data-testid="cat-wizard-step1-next"]').click()`);
  await wait(500);
  await shot(send, 'step2-expenses');

  // Step 2 — sorted (click Name header to reverse)
  await evalInPage(send, `document.querySelector('[data-testid="expense-sort-name"]').click()`);
  await wait(300);
  await shot(send, 'step2-expenses-sorted');
  await evalInPage(send, `document.querySelector('[data-testid="expense-sort-name"]').click()`);
  await wait(300);

  // Step 3 — Income
  await evalInPage(send, `document.querySelector('[data-testid="cat-wizard-step2-next"]').click()`);
  await wait(500);
  await shot(send, 'step3-income');

  // Step 3 — sorted (click Name header)
  await evalInPage(send, `document.querySelector('[data-testid="income-sort-name"]').click()`);
  await wait(300);
  await shot(send, 'step3-income-sorted');

  ws.close();
  chrome.kill();
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
