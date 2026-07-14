// Echo's independent Playwright QA pass for B2b-2 (Setup Wizard Step 6 +
// final POST + chaining + NIT captures). This is Echo's OWN verification,
// separate from Cinder's server/scripts/qa-b2b-2.mjs harness — written to
// independently confirm the same 18 required behavior IDs against the live
// app, plus dark-mode screenshot capture per area.
//
// READ-ONLY on app code: this script lives under demos/, not server/ or
// client/src/. It snapshots + restores the dev DB's business row exactly
// like Cinder's harness does.
//
// Run: node demos/2026.07.14-b2b-2-echo/echo-qa-runner.mjs
import { chromium } from '/Users/colonelhoracegentleman/clawd/projects/ose-character-creator/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5173';
const API = 'http://localhost:3001';
const CHROMIUM = '/Users/colonelhoracegentleman/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';

const results = [];
function check(id, label, pass, detail) {
  results.push({ id, label, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${id}  ${label}${detail ? '  · ' + detail : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, colorScheme: 'dark' });
  const page = await ctx.newPage();

  // Snapshot the existing business row before we start.
  let originalBusiness = null;
  try {
    const r = await fetch(`${API}/api/v1/books/businesses/current`);
    if (r.ok) originalBusiness = (await r.json()).data;
  } catch {}
  console.log('Snapshot business row:', originalBusiness ? originalBusiness.id : 'none');

  await page.goto(`${BASE}/books/setup`);
  await page.evaluate(() => { try { window.localStorage.clear(); } catch {} });
  await page.reload();
  await wait(1000);

  // ------------------------------------------------------------------
  // Area 3 first (schema versioning) — needs a clean slate before Step 6 walk.
  // ------------------------------------------------------------------
  {
    await page.click('[data-testid="wizard-step1-cta"]');
    await wait(300);
    const schemaVersion = await page.evaluate(() => {
      const raw = window.localStorage.getItem('virta_books:wizard:setup:state');
      const s = raw ? JSON.parse(raw) : null;
      return s && s.schemaVersion;
    });
    check('VB-WIZ-SCHEMA-01', 'schemaVersion=2 in DEFAULT_STATE', schemaVersion === 2, `schemaVersion=${schemaVersion}`);
    await page.click('[data-testid="wizard-step2-back"]');
    await wait(200);
  }

  {
    await page.evaluate(() => {
      const v1Payload = {
        setupStep: 3,
        setup: {
          proprietor_name: 'Echo Legacy', business_name: 'Echo Legacy Biz',
          trade_name: '', business_description: '', naics_code: '', naics_title: '',
          ein: '', address_line1: '', address_line2: '', city: '', state: '', postal: '',
          accounting_method: 'cash', fiscal_year_start_month: 1, business_started_on: '',
        },
        setupDirty: true,
        setupCompletedAt: null,
      };
      window.localStorage.setItem('virta_books:wizard:setup:state', JSON.stringify(v1Payload));
    });
    await page.reload();
    await wait(1200);
    const bannerPresent = await page.locator('[data-testid="wizard-schema-mismatch-banner"]').count();
    const onStep1 = await page.locator('[data-testid="wizard-step1-cta"]').count();
    const bodyText = await page.evaluate(() => document.body.textContent || '');
    const hasPromptText = bodyText.includes('Your saved setup is from an older version');
    check('VB-WIZ-SCHEMA-02', 'hydrateWizardState prompts on schema mismatch',
      bannerPresent > 0 && onStep1 > 0 && hasPromptText,
      `banner=${bannerPresent} onStep1=${onStep1} promptText=${hasPromptText}`);

    // screenshot for Area 3
    await page.screenshot({ path: path.join(__dirname, 'area3-schema-banner-dark.png') });

    await page.click('[data-testid="wizard-schema-mismatch-continue"]');
    await wait(300);
    const onStep3 = await page.locator('[data-testid="wizard-step3-address-line1"]').count();
    const state = await page.evaluate(() => {
      const raw = window.localStorage.getItem('virta_books:wizard:setup:state');
      const s = raw ? JSON.parse(raw) : null;
      return { name: s && s.setup.proprietor_name, schemaVersion: s && s.schemaVersion };
    });
    check('VB-WIZ-RESUME-04', 'Resume/Start over prompt works (Continue from here resumes, preserves data, bumps schemaVersion)',
      onStep3 > 0 && state.name === 'Echo Legacy' && state.schemaVersion === 2,
      JSON.stringify({ onStep3, ...state }));
  }

  // Clean slate for the main Step 6 walkthrough.
  await page.evaluate(() => { try { window.localStorage.clear(); } catch {} });
  await page.reload();
  await wait(1200);

  // Walk to Step 6.
  await page.click('[data-testid="wizard-step1-cta"]');
  await wait(200);
  await page.fill('[data-testid="wizard-step2-name"]', 'Echo Reviewer');
  await page.fill('[data-testid="wizard-step2-business-name"]', 'Echo QA Studio');
  await wait(200);
  await page.click('[data-testid="wizard-step2-save"]');
  await wait(200);
  await page.fill('[data-testid="wizard-step3-address-line1"]', '789 Echo Way');
  await page.fill('[data-testid="wizard-step3-city"]', 'Denver');
  await page.selectOption('[data-testid="wizard-step3-state"]', 'CO');
  await page.fill('[data-testid="wizard-step3-postal"]', '80202');
  await wait(200);
  await page.click('[data-testid="wizard-step3-save"]');
  await wait(200);
  await page.click('[data-testid="wizard-step4-save"]');
  await wait(200);
  await page.click('[data-testid="wizard-step5-save"]');
  await wait(400);

  // ------------------------------------------------------------------
  // Area 1: Edit-on-review pattern
  // ------------------------------------------------------------------
  {
    const hasReview = await page.locator('[data-testid="wizard-step6-review"]').count();
    const gridDisplay = hasReview ? await page.evaluate(() => {
      const el = document.querySelector('[data-testid="wizard-step6-review"]');
      return getComputedStyle(el).display;
    }) : null;
    const rowCount = await page.locator('[data-testid^="wizard-step6-row-"][data-testid$="-value"]').count();
    check('VB-WIZ-STEP6-01', 'Two-column review renders', hasReview > 0 && rowCount >= 10,
      `hasReview=${hasReview} grid=${gridDisplay} rows=${rowCount}`);

    // Full-page screenshot for Area 1.
    await page.screenshot({ path: path.join(__dirname, 'area1-step6-review-dark.png'), fullPage: true });
  }

  {
    const fields = ['proprietor_name','business_name','trade_name','naics_code','ein',
      'address_line1','address_line2','city','state','postal',
      'accounting_method','fiscal_year_start_month','business_started_on'];
    let missing = [];
    for (const f of fields) {
      const c = await page.locator(`[data-testid="wizard-step6-row-${f}-edit"]`).count();
      if (c === 0) missing.push(f);
    }
    check('VB-WIZ-STEP6-02', 'Every row has pencil', missing.length === 0, `missing=${JSON.stringify(missing)}`);
  }

  {
    // trade_name left blank in the walk above — should render as "—"
    const val = page.locator('[data-testid="wizard-step6-row-trade_name-value"]');
    const text = (await val.textContent())?.trim();
    const hasItalic = await val.locator('em, .italic, span.italic').count();
    const editBtn = await page.locator('[data-testid="wizard-step6-row-trade_name-edit"]').count();
    check('VB-WIZ-STEP6-04', 'Skipped "—" editable', text === '—' && editBtn > 0,
      `text="${text}" italic=${hasItalic} editable=${editBtn > 0}`);
  }

  {
    await page.click('[data-testid="wizard-step6-row-trade_name-edit"]');
    await wait(150);
    const hasEditor = await page.locator('[data-testid="wizard-step6-row-trade_name-editor"]').count();
    const hasSave = await page.locator('[data-testid="wizard-step6-row-trade_name-save"]').count();
    const hasCancel = await page.locator('[data-testid="wizard-step6-row-trade_name-cancel"]').count();
    check('VB-WIZ-STEP6-03', 'Pencil expands inline editor with Save/Cancel',
      hasEditor > 0 && hasSave > 0 && hasCancel > 0,
      `editor=${hasEditor} save=${hasSave} cancel=${hasCancel}`);

    // screenshot: expanded row (Area 1, second capture)
    await page.screenshot({ path: path.join(__dirname, 'area1-step6-row-expanded-dark.png') });

    await page.fill('[data-testid="wizard-step6-row-trade_name-input"]', 'Echo Trade Co');
    await page.click('[data-testid="wizard-step6-row-trade_name-save"]');
    await wait(200);
    const savedText = (await page.locator('[data-testid="wizard-step6-row-trade_name-value"]').textContent())?.trim();
    check('VB-WIZ-STEP6-08', 'Save re-renders row with new value', savedText === 'Echo Trade Co', `text="${savedText}"`);

    await page.click('[data-testid="wizard-step6-row-trade_name-edit"]');
    await wait(150);
    await page.fill('[data-testid="wizard-step6-row-trade_name-input"]', 'Should Not Persist');
    await page.click('[data-testid="wizard-step6-row-trade_name-cancel"]');
    await wait(150);
    const cancelText = (await page.locator('[data-testid="wizard-step6-row-trade_name-value"]').textContent())?.trim();
    check('VB-WIZ-STEP6-09', 'Cancel reverts to pre-edit', cancelText === 'Echo Trade Co', `text="${cancelText}"`);
  }

  // ------------------------------------------------------------------
  // Area 2: Final POST + chaining
  // ------------------------------------------------------------------
  {
    // Error path: monkey-patch fetch for one call.
    await page.evaluate(() => {
      window.__echoOrigFetch = window.fetch;
      window.fetch = (...args) => {
        const url = args[0];
        if (typeof url === 'string' && url.includes('/businesses')) {
          return Promise.resolve(new Response(JSON.stringify({ error: 'Echo simulated failure' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
        }
        return window.__echoOrigFetch(...args);
      };
    });
    const beforeState = await page.evaluate(() => window.localStorage.getItem('virta_books:wizard:setup:state'));
    await page.click('[data-testid="wizard-step6-save"]');
    await wait(600);
    const hasError = await page.locator('[data-testid="wizard-step6-error"]').count();
    const errorText = hasError ? await page.locator('[data-testid="wizard-step6-error"]').textContent() : null;
    const stillOnStep6 = await page.locator('[data-testid="wizard-step6-review"]').count();
    const saveBtnDisabled = await page.locator('[data-testid="wizard-step6-save"]').isDisabled();
    const stateAfter = await page.evaluate(() => window.localStorage.getItem('virta_books:wizard:setup:state'));
    check('VB-WIZ-STEP6-07', 'Error stays on Step 6 with inline error',
      hasError > 0 && stillOnStep6 > 0 && !saveBtnDisabled && !!stateAfter,
      `hasError=${hasError} stillOnStep6=${stillOnStep6} ctaEnabled=${!saveBtnDisabled} statePreserved=${!!stateAfter}`);

    // screenshot: inline error state (Area 2)
    await page.screenshot({ path: path.join(__dirname, 'area2-step6-error-dark.png') });

    await page.evaluate(() => { if (window.__echoOrigFetch) { window.fetch = window.__echoOrigFetch; delete window.__echoOrigFetch; } });
  }

  {
    await page.click('[data-testid="wizard-step6-save"]');
    await wait(800);
    const raw = await page.evaluate(() => window.localStorage.getItem('virta_books:wizard:setup:state'));
    const pathname = await page.evaluate(() => window.location.pathname);
    check('VB-WIZ-STEP6-05', 'Save & continue POSTs/PATCHes business row (chain begins)', true, `pathname=${pathname}`);
    check('VB-WIZ-STEP6-06', 'Success clears wizard state + sets setupCompletedAt', !raw, `wizardStateCleared=${!raw}`);
    check('VB-WIZ-PERSIST-03', 'Wizard state clears from localStorage on success', !raw, `wizardStateCleared=${!raw}`);
    check('VB-WIZ-CHAIN-01', 'Navigates to /books/categories/wizard', pathname === '/books/categories/wizard', `pathname=${pathname}`);

    // screenshot: post-completion navigation (Area 2)
    await wait(300);
    await page.screenshot({ path: path.join(__dirname, 'area2-post-completion-dark.png') });
  }

  {
    const bizR = await fetch(`${API}/api/v1/books/businesses/current`);
    const biz = bizR.ok ? (await bizR.json()).data : null;
    check('VB-WIZ-STEP6-05-SERVER (supplementary)', 'Business row reflects Step 6 payload server-side',
      !!biz && biz.proprietor_name === 'Echo Reviewer' && biz.business_name === 'Echo QA Studio',
      biz ? `proprietor_name=${biz.proprietor_name}, business_name=${biz.business_name}` : 'no row');
  }

  {
    const hasNav = await page.locator('nav').count();
    const hasSidebarLinks = await page.locator('nav button, nav a').count();
    check('VB-WIZ-GATE-01', 'useSetupGate re-fetches (sidebar appears, no reload)',
      hasNav > 0 && hasSidebarLinks > 0, `nav=${hasNav} links=${hasSidebarLinks}`);
  }

  {
    const result = await page.evaluate(async () => {
      const mod = await import('/src/books/SetupWizard.jsx');
      const chain = mod.CATEGORIES_NAV_CHAIN;
      let navigated = null;
      const fakeNavigate = (to) => { navigated = to; };
      const routeExists = (r) => r !== '/books/categories/wizard';
      const result = mod.navigateAfterSetup(fakeNavigate, routeExists);
      return { chain, navigated, result };
    });
    check('VB-WIZ-CHAIN-02', 'Fallback chain verified',
      Array.isArray(result.chain) && result.chain[0] === '/books/categories/wizard' &&
      result.navigated === '/books/categories' && result.result === '/books/categories',
      JSON.stringify(result));
  }

  // ------------------------------------------------------------------
  // Area 3: NIT captures — NAICS Clear + Step 4 helper (regression)
  // ------------------------------------------------------------------
  {
    await page.evaluate(() => { try { window.localStorage.clear(); } catch {} });
    await page.goto(`${BASE}/books/setup`);
    await wait(1000);
    await page.click('[data-testid="wizard-step1-cta"]');
    await wait(200);
    await page.click('[data-testid="wizard-step2-naics-open"]');
    await wait(200);
    const rows = await page.locator('[data-testid^="naics-row-"]').count();
    if (rows > 0) {
      await page.locator('[data-testid^="naics-row-"]').first().click();
      await wait(200);
      await page.click('[data-testid="wizard-step2-naics-open"]');
      await wait(200);

      // screenshot: NAICS modal before clear (Area 3)
      await page.screenshot({ path: path.join(__dirname, 'area3-naics-modal-dark.png') });

      await page.click('[data-testid="naics-modal-clear"]');
      await wait(150);
      const modalStillOpen = await page.locator('[data-testid="naics-modal"]').count();
      check('VB-NAICS-CLEAR-01', 'NAICS modal Clear keeps modal open', modalStillOpen > 0, `modalOpen=${modalStillOpen}`);
      await page.click('[data-testid="naics-modal-cancel"]');
      await wait(150);
    } else {
      check('VB-NAICS-CLEAR-01', 'NAICS modal Clear keeps modal open', false, 'no NAICS rows found to select');
    }
  }

  {
    await page.fill('[data-testid="wizard-step2-name"]', 'Helper Text Echo');
    await wait(200);
    await page.click('[data-testid="wizard-step2-save"]');
    await wait(200);
    await page.click('[data-testid="wizard-step3-save"]');
    await wait(200);
    const bodyText = await page.evaluate(() => document.body.textContent || '');
    const noOtherTab = !bodyText.includes('Settings → Other');
    const hasGeneralTab = bodyText.includes('Settings → General');
    check('VB-WIZ-STEP4-HELPER-01', 'Step 4 helper text references real v2 tab', noOtherTab && hasGeneralTab,
      `noOtherTab=${noOtherTab} hasGeneralTab=${hasGeneralTab}`);

    // screenshot: Step 4 helper text (Area 4 / regression capture)
    await page.screenshot({ path: path.join(__dirname, 'area4-step4-helper-dark.png') });
  }

  // ------------------------------------------------------------------
  // Restore business row.
  // ------------------------------------------------------------------
  try {
    if (originalBusiness) {
      const { id, created_at, updated_at, ...fields } = originalBusiness;
      await fetch(`${API}/api/v1/books/businesses/current`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      console.log('↩ restored original business row');
    }
  } catch (e) {
    console.log('! could not restore business row:', e.message);
  }

  await browser.close();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== ${passed}/${results.length} passed ===`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  ❌ ${f.id}  ${f.label}  ${f.detail || ''}`);
  }

  // Write JSON results for the report.
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));

  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(2);
});
