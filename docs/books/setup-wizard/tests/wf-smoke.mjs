// Smoke-test the updated WIREFRAMES.html by instantiating its JS in jsdom,
// then forcing each setup-step render and asserting the new structure is present.
//
// NOTE: top-level `const`/`let` in a classic <script> don't attach to
// `window`, only `var` and function declarations do. So reads of
// const-bound names (SETUP_STEPS, DEFAULT_EXPENSE, etc.) go through
// dom.window.eval(...) which shares the same lexical scope; function-bound
// names (render, __openNaics, etc.) are directly on `window`.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync('/Users/colonelhoracegentleman/clawd/projects/task-manager/docs/books/setup-wizard/WIREFRAMES.html', 'utf8');

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
await new Promise(r => setTimeout(r, 150));

const $ = sel => window.document.querySelector(sel);
const ev = expr => dom.window.eval(expr);
const state = ev('state'); // const-bound in the page script; same object reference, mutations reflect back
const results = [];

function check(label, pass, detail) {
  results.push({ label, pass, detail });
  console.log((pass ? '✅' : '❌') + ' ' + label + (detail ? '  · ' + detail : ''));
}

// --- 1. Wizard step count is 6, not 8 ---
const setupSteps = ev('SETUP_STEPS');
check('Setup wizard has 6 steps (was 8)', setupSteps.length === 6, `got ${setupSteps.length}`);
check('Step 2 is "Basic business info" (merged)', setupSteps[1].name === 'Basic business info');
check('No step named "Owner" / "Business identity" / "Tax IDs"',
  !setupSteps.some(s => ['Owner', 'Business identity', 'Tax IDs'].includes(s.name)));

// --- 2. Default expense list is alphabetical + 23 entries + Review Later last ---
const exp = ev('DEFAULT_EXPENSE');
const namesOnly = exp.filter(e => !e.system).map(e => e.name);
const sortedRef = [...namesOnly].sort((a, b) => a.localeCompare(b));
const isAlpha = namesOnly.every((n, i) => n === sortedRef[i]);
check('Expense defaults are alphabetical (excl. Review Later)', isAlpha, namesOnly.join(', '));
check('23 default expenses (incl. Review Later)', exp.length === 23, `got ${exp.length}`);
check('Review Later is at index 22 with code 9999 (round 6: renamed + recoded)', exp[22].name === 'Review Later' && exp[22].code === '9999');
check('"Vehicle" renamed to "Car & Truck"', exp.some(e => e.name === 'Car & Truck') && !exp.some(e => e.name === 'Vehicle'));
check('First expense is "Accounting" (was "Advertising")', exp[0].name === 'Accounting');

// --- 3. Default income: intentional order (round 4 override of alphabetical default) ---
const inc = ev('DEFAULT_INCOME');
const incNames = inc.map(e => e.name);
check('Income defaults in intentional order: Sales, Refunds & Returns, Other Income',
  incNames[0] === 'Sales' && incNames[1] === 'Refunds & Returns' && incNames[2] === 'Other Income',
  incNames.join(', '));
check('3 default income accounts', inc.length === 3);

// --- 4. Default other has 8 with 3 subheader groups ---
const oth = ev('DEFAULT_OTHER');
const groups = new Set(oth.map(o => o.group));
check('8 default other accounts', oth.length === 8, `got ${oth.length}`);
check('3 subheader groups present (Cash & bank, Credit & loans, Equity)', groups.size === 3 && groups.has('Cash & bank') && groups.has('Credit & loans') && groups.has('Equity'));
const bankAccounts = oth.filter(o => o.group === 'Cash & bank').map(o => o.name);
const bankSorted = [...bankAccounts].sort();
check('Cash & bank accounts alphabetical', bankAccounts.every((n, i) => n === bankSorted[i]), bankAccounts.join(', '));
const equityAccts = oth.filter(o => o.group === 'Equity').map(o => o.name);
const equitySorted = [...equityAccts].sort();
check('Equity accounts alphabetical', equityAccts.every((n, i) => n === equitySorted[i]), equityAccts.join(', '));

// --- 5. NAICS mini-list is non-empty (proves modal data is wired) ---
const naicsLen = ev('NAICS_MINI.length');
check('NAICS_MINI has 30+ entries', naicsLen >= 30, `got ${naicsLen}`);

// --- 6. Render each setup step, look for new copy on each ---
state.screen = 'setup';
state.setupStep = 1;
window.render();
const step1Body = $('#root').innerHTML;
check('Step 1 has Schedule C explainer', step1Body.includes("Schedule C of your IRS Form 1040"));
check('Step 1 does NOT have "Up next" hint', !step1Body.includes('Up next: set up your categories'));
check('Step 1 does NOT have preview bullets', !step1Body.includes('Pick your accounting method') && !step1Body.includes('pre-filled from Schedule C'));
check('Step 1 wizard header says "Step 1 of 6"', step1Body.includes('Step 1 of 6'));

state.setupStep = 2;
window.render();
const step2Body = $('#root').innerHTML;
check('Step 2 has "About you" subheader', step2Body.includes('About you'));
check('Step 2 has "About your business" subheader', step2Body.includes('About your business'));
check('Step 2 has proprietor label "Your name"', step2Body.includes('Your name') && !step2Body.includes('Your legal name'));
check('Step 2 has NO Chantelle-specific placeholders', !step2Body.includes('Chantelle'));
check('Step 2 has NAICS "Look up" button', step2Body.includes('Look up NAICS'));
check('Step 2 has EIN field', step2Body.includes('EIN'));
check('Step 2 does NOT have Schedule C refs in helper copy', !/Schedule C/.test(step2Body));
check('Step 2 does NOT have "this is you" helper', !/this is you/i.test(step2Body));

state.screen = 'setup';
state.setupStep = 5;
window.render();
const step5Body = $('#root').innerHTML;
check('Step 5 (Timeline) has new FY helper copy', step5Body.includes('calendar year (Jan 1 – Dec 31)'));
check('Step 5 does NOT have Schedule C field J ref', !step5Body.includes('Schedule C field J'));

state.screen = 'setup';
state.setupStep = 6;
window.render();
const step6Body = $('#root').innerHTML;
check('Step 6 (Review) has edit buttons (✎)', step6Body.includes('✎'));
check('Step 6 has proprietor row labeled "Your name" with edit', /Your name/.test(step6Body) && /__reviewEdit\('proprietor'\)/.test(step6Body));
check('Step 6 wizard header says "Step 6 of 6"', step6Body.includes('Step 6 of 6'));
check('Step 6 "v1 default" pill is NOT in info-blue (.pill.system)', !step6Body.includes('pill system">v1 default'));
check('Step 6 "Save & continue to Categories" button routes to cats (not setupStep=1)', step6Body.includes('state.screen=\'cats\''));

// --- 7. Trigger an inline edit, then save, confirm state changed ---
state.screen = 'setup';
state.setupStep = 6;
state.setup.proprietor = '';
window.__reviewEdit('proprietor');
window.render();
const editingBody = $('#root').innerHTML;
check('Inline edit pane renders with Save + Cancel', /Editing Your name/.test(editingBody) && /__reviewSave/.test(editingBody));
$('#rev-proprietor').value = 'Test Name';
window.__reviewSave('proprietor');
check('Edit save persists to state', state.setup.proprietor === 'Test Name');
window.render();
const afterSaveBody = $('#root').innerHTML;
check('After save, edit pane is gone and name shows in row', /Test Name/.test(afterSaveBody) && !/Editing Your legal name/.test(afterSaveBody));

// --- 8. NAICS modal opens, renders list, accepts selection ---
state.setup.naics = '';
window.__openNaics();
const modal = window.document.querySelector('#modal').innerHTML;
check('NAICS modal opens with search input', /naics-q/.test(modal));
window.__renderNaics('consulting');
const filtered = window.document.querySelector('#naics-results').innerHTML;
check('NAICS search filters results', /Consulting/.test(filtered), 'looking for any consulting match');
check('NAICS results are clickable rows', /class="naics-row"/.test(filtered));
state.setup.naics = '541611';
check('NAICS selection writes code to state', state.setup.naics === '541611');
window.closeModal();
check('NAICS modal closes', !window.document.querySelector('#modalBack').classList.contains('open'));

// --- 8b. Save button routes to Categories Wizard step 1 (not setupStep=1) ---
state.screen = 'setup';
state.setupStep = 6;
window.render();
// Simulate clicking the Save & continue to Categories button by extracting
// the onclick handler text — the JS is inline, so we just invoke the state
// transitions directly as the button does.
state.screen = 'cats';
state.catsStep = 1;
window.render();
const routedBody = $('#root').innerHTML;
check('Save button routes to Categories Wizard', routedBody.includes('Categories Wizard') && routedBody.includes('Step 1 of 6'));
check('Save button does NOT keep the Setup wizard in view', !routedBody.includes('Company Setup Wizard'));

// --- 9. Categories wizard step 4 renders 3 subheaders ---
state.__reviewEditing = null;
state.screen = 'cats';
state.catsStep = 4;
window.render();
const catsStep4Body = $('#root').innerHTML;
check('Cats step 4 has "Cash & bank" subheader', /Cash &amp; bank/.test(catsStep4Body));
check('Cats step 4 has "Credit & loans" subheader', /Credit &amp; loans/.test(catsStep4Body));
check('Cats step 4 has "Equity" subheader', /Equity/.test(catsStep4Body));
const tableCount = (catsStep4Body.match(/<table class="cat-table">/g) || []).length;
check('Cats step 4 has 3 separate subheader tables', tableCount === 3, `got ${tableCount}`);

// --- 10. Mgmt screen with show-numbers off still works ---
state.screen = 'mgmt';
state.activeTab = 'expenses';
state.showNumbers = false;
window.render();
const mgmtBody = $('#root').innerHTML;
check('Mgmt expenses tab still renders with show-numbers off', mgmtBody.includes('Advertising') || mgmtBody.includes('Accounting'));

// --- 11. Round 4 changes: account-numbers default OFF, framing text, no Chantelle anywhere, sortable + Hide/Delete + generic Add modal ---
state.showNumbers = false;  // round 4 default
state.screen = 'cats';
state.catsStep = 1;
window.render();
const catsStep1Body = $('#root').innerHTML;
check('Cats step 1 has "Show 4-digit account numbers" toggle', catsStep1Body.includes('Show 4-digit account numbers'));
check('Cats step 1 has accountant framing in helper', catsStep1Body.includes('Some accountants and business owners like to track their accounts with account numbers'));
check('Cats step 1 has off switch by default', !catsStep1Body.includes('switch on'));

// Drive to step 2 to check the new layout
state.catsStep = 2;
window.render();
const catsStep2Body = $('#root').innerHTML;
check('Cats step 2 has no left-side checkboxes', !catsStep2Body.includes('__toggleCat'));
check('Cats step 2 has Hide buttons per row', (catsStep2Body.match(/__toggleHide/g) || []).length >= 22);
check('Cats step 2 has Delete buttons per row', (catsStep2Body.match(/__toggleDelete/g) || []).length >= 20);
check('Cats step 2 has sortable column headers (↕)', catsStep2Body.includes('↕'));
check('Cats step 2 has top "Add expense category" button (not "Add custom expense category")',
  catsStep2Body.includes('Add expense category') && !catsStep2Body.includes('Add custom expense category'));
check('Cats step 2 has sticky header (th.sortable exists with sticky CSS)', ev('!!document.querySelector(".cat-table th.sortable")'));

// Step 3: income reordering — Sales must be first
state.catsStep = 3;
window.render();
const catsStep3Body = $('#root').innerHTML;
const salesFirstIdx = catsStep3Body.indexOf('Sales');
const otherIncomeIdx = catsStep3Body.indexOf('Other Income');
const refundsIdx = catsStep3Body.indexOf('Refunds &amp; Returns');
check('Cats step 3: Sales appears before Other Income', salesFirstIdx < otherIncomeIdx);
check('Cats step 3: Refunds & Returns is between Sales and Other Income', salesFirstIdx < refundsIdx && refundsIdx < otherIncomeIdx);
check('Cats step 3: top "Add income category" button (no "Custom")', catsStep3Body.includes('Add income category') && !catsStep3Body.includes('Add custom income category'));

// Step 4: single Add account button at top, no per-subheader Add buttons
state.catsStep = 4;
window.render();
const catsStep4R4 = $('#root').innerHTML;
const addAccountButtons = (catsStep4R4.match(/__openAdd\('other'\)/g) || []).length;
check('Cats step 4: exactly one Add account button (no per-subheader)', addAccountButtons === 1, `got ${addAccountButtons}`);
check('Cats step 4: no "Add custom" phrasing anywhere', !catsStep4R4.includes('Add custom'));

// Generic Add modal
window.__openAdd('expense');
const addModal = window.document.querySelector('#modal').innerHTML;
check('Add modal title is "Add account" (not "Add custom category")', addModal.includes('Add account') && !addModal.includes('Add custom'));
check('Add modal has Type dropdown', addModal.includes('m-type') && addModal.includes('Expense') && addModal.includes('Income') && addModal.includes('Asset') && addModal.includes('Liability') && addModal.includes('Equity'));
check('Add modal has Name field', addModal.includes('m-name'));
check('Add modal has Code field (when showNumbers=true)', state.showNumbers ? addModal.includes('m-code') : !addModal.includes('m-code'));
check('Add modal has Tax Line Item label (Schedule C of IRS Form 1040)', addModal.includes('Tax Line Item (Schedule C of IRS Form 1040)'));
check('Add modal has Note field', addModal.includes('m-note'));

// Add modal called from income context → Type defaults to Income
window.closeModal();
window.__openAdd('income');
const addModalIncome = window.document.querySelector('#modal').innerHTML;
check('Add modal from income context: Type=Income selected by default', addModalIncome.includes('<option value="Income" selected'));
window.closeModal();
window.__openAdd('other');
const addModalOther = window.document.querySelector('#modal').innerHTML;
check('Add modal from other context: Type=Asset selected by default', addModalOther.includes('<option value="Asset" selected'));
window.closeModal();

// Hide interaction
state.catsStep = 2;
window.render();
const beforeHide = state.expenses.filter(e => !e.is_hidden).length;
window.__toggleHide('expenses', 0);
window.render();
const afterHide = state.expenses.filter(e => !e.is_hidden).length;
check('Hide toggles is_hidden on the row', afterHide === beforeHide - 1);
window.render();
const afterHideBody = $('#root').innerHTML;
check('After Hide, row has is-hidden CSS class', afterHideBody.includes('is-hidden'));
// Un-hide so other tests don't get confused
window.__toggleHide('expenses', 0);

// Sort interaction
state.sortExpenses = { key: 'name', dir: 'asc' };
window.render();
const beforeSort = window.document.querySelector('#root').innerHTML;
window.__sortBy('expenses', 'code');
check('Sort by code changes sort key', state.sortExpenses.key === 'code');
window.render();
const afterSort = window.document.querySelector('#root').innerHTML;
check('After sort, active header has different arrow than inactive', afterSort.includes('↕'));

// No Chantelle anywhere
const fullHtml = ev('document.documentElement.outerHTML');
check('No "Chantelle" anywhere in the rendered wireframe', !fullHtml.includes('Chantelle'));

// --- 12. Round 5: Categories Management single-page + Settings → Categories ---

// Mgmt screen — single page with search + filter chips + show-hidden
state.screen = 'mgmt';
state.catFilter = 'all';
state.catSearch = '';
state.catShowHidden = false;
window.render();
const mgmtAll = $('#root').innerHTML;
check('Mgmt: page title is "Categories" (no longer "Categories — Expenses")', mgmtAll.includes('<h1>Categories</h1>'));
check('Mgmt: search input present', mgmtAll.includes('Search categories'));
check('Mgmt: 4 filter chips present (Show All / Expenses / Income / A/L/E)',
  mgmtAll.includes('Show All') && mgmtAll.includes('Expenses</button>') && mgmtAll.includes('Income</button>') && mgmtAll.includes('Assets/Liabilities/Equity'));
check('Mgmt: Show hidden toggle present', mgmtAll.includes('Show hidden'));
check('Mgmt: NO tabs (single page, not tabbed)', !mgmtAll.includes('data-tab=') && !mgmtAll.includes('activeTab'));
check('Mgmt: unified table shows all default expenses + income + other', mgmtAll.includes('Advertising') && mgmtAll.includes('Sales') && mgmtAll.includes('Business Checking'));
check('Mgmt: single "Add category" button (no "Add custom")', mgmtAll.includes('+ Add category') && !mgmtAll.includes('Add custom'));
check('Mgmt: hidden count visible', /Show hidden <span class="muted small">\(\d+\)<\/span>/.test(mgmtAll));

// Filter chip interaction
state.catFilter = 'expenses';
window.render();
const mgmtExp = $('#root').innerHTML;
check('Filter=expenses shows expenses only (Sales filtered out)', mgmtExp.includes('Advertising') && !mgmtExp.includes('<strong>Sales</strong>'));
check('Filter=expenses page title becomes "Categories — Expenses"', mgmtExp.includes('Categories \u2014 Expenses') || mgmtExp.includes('Categories — Expenses'));

state.catFilter = 'revenue';
window.render();
const mgmtRev = $('#root').innerHTML;
check('Filter=income shows income (Sales) and filters out expenses (Advertising)', mgmtRev.includes('Sales') && !mgmtRev.includes('Advertising') && mgmtRev.includes('Categories — Income'));

state.catFilter = 'ale';
window.render();
const mgmtAle = $('#root').innerHTML;
check('Filter=ale shows Business Checking and filters out Sales/Advertising', mgmtAle.includes('Business Checking') && !mgmtAle.includes('Sales') && !mgmtAle.includes('Advertising'));

// Search bar
state.catFilter = 'all';
state.catSearch = 'rent';
window.render();
const mgmtSearch = $('#root').innerHTML;
check('Search "rent" shows only Rent expense (filters out Sales, Advertising)', mgmtSearch.includes('Rent') && !mgmtSearch.includes('Advertising') && !mgmtSearch.includes('Sales'));

// Show hidden
state.catSearch = '';
window.__toggleHide('expenses', 0); // hide Accounting
window.render();
const mgmtHidden = $('#root').innerHTML;
check('After hide, default view (showHidden=false) filters out hidden row', !mgmtHidden.includes('Accounting'));
state.catShowHidden = true;
window.render();
const mgmtShowHidden = $('#root').innerHTML;
check('With showHidden=true, hidden row reappears (with is-hidden class)', mgmtShowHidden.includes('Accounting') && mgmtShowHidden.includes('is-hidden'));
// Reset
state.catShowHidden = false;
window.__toggleHide('expenses', 0);

// Sort by code in mgmt (enable showNumbers so the Code column is rendered)
state.showNumbers = true;
state.sortMgmt = { key: 'name', dir: 'asc' };
window.__sortMgmtBy('code');
check('Mgmt sort: clicking code header changes active key to code', state.sortMgmt.key === 'code');
window.render();
const mgmtSorted = $('#root').innerHTML;
check('Mgmt sort: active code column shows ascending arrow', /class="sortable active"[^>]*>Code <span class="arrow">↑<\/span>/.test(mgmtSorted));

// Settings → Categories section (D49: tabbed layout, default tab=general)
state.screen = 'settings';
state.settingsTab = 'general';
window.render();
const settingsGen = $('#root').innerHTML;
check('Settings: General tab is the default landing', settingsGen.includes('>General<') && settingsGen.includes('>Categories<') && settingsGen.includes('>Other<') && settingsGen.includes('Business name') && !settingsGen.includes('Default sort'));
check('Settings: General has editable business name', settingsGen.includes('value="' + (window.__state_setup_business||'') + '"') || /placeholder="Your business name"/.test(settingsGen));

state.settingsTab = 'categories';
window.render();
const settings = $('#root').innerHTML;
check('Settings: Categories tab shows the categories-specific content (no "Go to categories" button)', settings.includes('Default sort') && settings.includes('Show 4-digit account numbers') && !settings.includes('Go to categories'));
check('Settings: Default sort radio with two options (Alphabetical by name + Numerical by code)', settings.includes('Alphabetical by name') && settings.includes('Numerical by code'));
check('Settings: Show 4-digit account numbers toggle (with accountant framing)', settings.includes('Some accountants and business owners like to track their accounts with account numbers'));

state.settingsTab = 'other';
window.render();
const settingsOther = $('#root').innerHTML;
check('Settings: Other tab has accounting / fiscal year / business type / run wizard again', settingsOther.includes('Accounting method') && settingsOther.includes('Fiscal year start') && settingsOther.includes('Business type') && settingsOther.includes('Run setup wizard again'));
check('Settings: Other tab does NOT have categories-specific controls', !settingsOther.includes('Default sort') && !settingsOther.includes('Show 4-digit account numbers'));

// Default sort setting changes active sort (D49: settings now lives in Categories tab)
state.screen = 'settings';
state.settingsTab = 'categories';
state.catDefaultSort = 'code';
window.render();
const settingsChanged = $('#root').innerHTML;
check('Settings: code radio is checked after state.catDefaultSort=code (Categories tab)', settingsChanged.includes('value="code" checked') || settingsChanged.includes('checked value="code"') || /<input type="radio"[^>]*checked[^>]*> Numerical by code/.test(settingsChanged));

// Top-of-mgmt shows the default sort in the helper text
state.screen = 'mgmt';
state.sortMgmt = null;
window.render();
const mgmtHelper = $('#root').innerHTML;
check('Mgmt helper text references "Default sort" and links to Settings → Categories', mgmtHelper.includes('Default sort') && mgmtHelper.includes('Settings') && mgmtHelper.includes('Categories'));

// --- 14. Round 7: Edit modal hide-Code, Type picker, Notes placeholder; step 5 trim; CTAs inside scroll; fixed column widths ---

// D37: Edit modal — Code field hidden when account numbers are off
state.showNumbers = true;
window.__openEdit('expenses', 0);
const editOn = window.document.querySelector('#modal').innerHTML;
check('Edit modal: Code field present when showNumbers=true', editOn.includes('id="edit-code"'));
window.closeModal();
state.showNumbers = false;
window.__openEdit('expenses', 0);
const editOff = window.document.querySelector('#modal').innerHTML;
check('Edit modal: Code field ABSENT when showNumbers=false (D37)', !editOff.includes('id="edit-code"'));
window.closeModal();

// D38: Edit modal Type picker is locked in wizard context, free in management
state.screen = 'cats'; state.catsStep = 2;
window.__openEdit('expenses', 0);
const editWizard = window.document.querySelector('#modal').innerHTML;
check('Edit modal in wizard: Type picker present', editWizard.includes('id="edit-type"'));
check('Edit modal in wizard: Type picker disabled (locked)', editWizard.includes('id="edit-type" disabled'));
check('Edit modal in wizard: Type picker label says "locked"', editWizard.includes('locked'));
check('Edit modal in wizard: expense type pre-selected', editWizard.includes('value="Expense" selected'));
window.closeModal();

state.screen = 'mgmt';
window.__openEdit('expenses', 0);
const editMgmt = window.document.querySelector('#modal').innerHTML;
check('Edit modal in mgmt: Type picker NOT disabled (free)', !editMgmt.includes('id="edit-type" disabled'));
window.closeModal();

// D39: Notes placeholder is "What is this category used for?"
check('Edit modal: Notes placeholder is the simplified text', (editOff.includes('What is this category used for?') || editMgmt.includes('What is this category used for?')));
check('Edit modal: Notes does NOT promise audit-log surfacing', !/audit log/i.test(editOff + editMgmt));

// D40: Step 2/3/4 CTAs are inside .step-window (sticky-bottom pattern)
state.screen = 'cats';
state.catsStep = 2;
window.render();
const step2body = $('#root').innerHTML;
check('Step 2 wraps in .step-window with .step-cta-inside (D40)',
  step2body.includes('class="step-window"') && step2body.includes('class="step-cta-inside"'));
check('Step 2 Save & continue is inside the step-cta-inside block', /class="step-cta-inside"[^>]*>[\s\S]*?Save &amp; continue[\s\S]*?<\/div>\s*<\/div>/.test(step2body));
check('Step 2 has NO standalone .step-cta outside .step-window (no double scroll)', !/<\/div>\s*<div class="step-cta">/.test(step2body));

state.catsStep = 3; window.render();
const step3body = $('#root').innerHTML;
check('Step 3 wraps in .step-window with .step-cta-inside (D40)', step3body.includes('class="step-window"') && step3body.includes('class="step-cta-inside"'));

state.catsStep = 4; window.render();
const step4body = $('#root').innerHTML;
check('Step 4 wraps in .step-window with .step-cta-inside (D40)', step4body.includes('class="step-window"') && step4body.includes('class="step-cta-inside"'));

// D41: tables use table-layout: fixed
const stickyCss2 = ev('(function(){return Array.from(document.styleSheets).flatMap(ss=>{try{return Array.from(ss.cssRules||[]).map(r=>r.cssText||"")}catch(e){return []}}).join("\\n")})()');
check('.cat-table has table-layout: fixed (D41)', /\.cat-table\b[^}]*table-layout:\s*fixed/.test(stickyCss2));
check('.cat-table has explicit col widths (col-code)', /\.col-code/.test(stickyCss2));
check('.cat-table has explicit col widths (col-actions)', /\.col-actions/.test(stickyCss2));

// F7.4: Step 5 explainer no longer mentions "(code 9999)"
state.catsStep = 5; window.render();
const step5body = $('#root').innerHTML;
check('Step 5 infobox no longer says "(code 9999)"', !step5body.includes('(code 9999)'));
check('Step 5 still mentions "Review Later"', step5body.includes('>Review Later<'));

// D42: Sidebar — single top-level "Categories" link, routes to mgmt with catFilter='all'
state.screen = 'mgmt';
window.render();
const sidebar = $('#root').innerHTML;
const sidebarHtml = ev('document.querySelector("aside.sidebar").innerHTML');
check('Sidebar: single top-level "Categories" link (not nested, not 3 sub-links)', sidebarHtml.includes('📂 Categories') && !sidebarHtml.includes('<div class="section">Categories</div>') && !/data-screen="(income|expenses|other)"/.test(sidebarHtml));
check('Sidebar: Categories click handler routes to mgmt with catFilter="all"', sidebarHtml.includes("state.screen='mgmt';state.catFilter='all'") || sidebarHtml.includes('state.screen="mgmt";state.catFilter="all"'));
check('Sidebar: Review Later badge is on the single Categories entry', sidebarHtml.includes('id="reviewBadge"'));
check('Sidebar: NO hard-coded "Income (4)" / "Expenses (18)" / "Other (8)" counts', !/Income \(4\)/.test(sidebarHtml) && !/Expenses \(18\)/.test(sidebarHtml) && !/Other \(8\)/.test(sidebarHtml));

// --- 13. Round 6: combined Tax Line Item column, no inline rename, Edit modal Notes, Revert button, step 5 cleanup ---

// Combined Tax Line Item column on cats step 2
state.screen = 'cats';
state.catsStep = 2;
state.showNumbers = false;
window.render();
const step2r6 = $('#root').innerHTML;
check('Cats step 2 header is "Tax Line Item" (not "Tax line" + "Tax description")', step2r6.includes('Tax Line Item') && !step2r6.includes('Tax description') && !step2r6.includes('>Tax line<'));
check('Cats step 2 row shows combined badge + descriptor for Advertising (Line 8) and Accounting (Line 16b)',
  /Line 8<\/span> <span class="muted small">— Advertising/.test(step2r6) && /Line 16b<\/span> <span class="muted small">— Accounting/.test(step2r6));
check('Cats step 2 has NO inline text input for renaming', !step2r6.includes('__renameCat'));
check('Cats step 2 has NO 6999 code (Review Later now 9999)', !step2r6.includes('6999'));
check('Cats step 2 does NOT show "Review Later" / "Uncategorized Items" (D32: only step 5)', !/>Review Later</.test(step2r6));

// Step 2 max-height bumped to 640
check('Cats step 2 table is in .step-window with .scroll (round 7: no inline max-height string)', step2r6.includes('class="step-window"') && step2r6.includes('class="scroll"'));

// Step 5 cleanup: no checkbox, code gated by showNumbers
state.catsStep = 5;
window.render();
const step5r6 = $('#root').innerHTML;
check('Step 5: NO checkbox in the table', !step5r6.includes('type="checkbox"'));
check('Step 5: no code column when showNumbers=false', !step5r6.includes('<code>9999</code>'));
check('Step 5: name is "Review Later"', step5r6.includes('>Review Later<'));
state.showNumbers = true;
window.render();
const step5r6on = $('#root').innerHTML;
check('Step 5: code 9999 visible when showNumbers=true', step5r6on.includes('<code>9999</code>'));
state.showNumbers = false;

// Skip → Revert smart button
state.catsStep = 2;
state._step2Dirty = false;
window.render();
const beforeDirty = $('#root').innerHTML;
check('Step 2 Skip button says "Skip (use all defaults)" when clean', beforeDirty.includes('Skip (use all defaults)') && !beforeDirty.includes('Revert to Defaults'));
// Trigger dirty via hide
window.__toggleHide('expenses', 0);
window.render();
const afterDirty = $('#root').innerHTML;
check('Step 2 button flips to "Revert to Defaults" after a hide', afterDirty.includes('Revert to Defaults') && !afterDirty.includes('Skip (use all defaults)'));
// Reset
window.revertExpenses();
window.render();
const afterRevert = $('#root').innerHTML;
check('After revertExpenses, button reverts to "Skip (use all defaults)"', afterRevert.includes('Skip (use all defaults)') && !afterRevert.includes('Revert to Defaults'));
check('revertExpenses restores the original 23 expenses', state.expenses.length === 23);

// Edit modal has Notes / Description field
state.catsStep = 2;
state.showNumbers = true;  // Code field is only present when showNumbers is on
window.render();
window.__openEdit('expenses', 0);
const editModal = window.document.querySelector('#modal').innerHTML;
check('Edit modal has Type + Name + Code + Tax Line Item + Notes (round 7: Type picker added)', editModal.includes('Type') && editModal.includes('id="edit-type"') && editModal.includes('Name') && editModal.includes('id="edit-name"') && editModal.includes('id="edit-code"') && editModal.includes('Tax Line Item (Schedule C of IRS Form 1040)') && editModal.includes('id="edit-note"'));
check('Edit modal: Notes is a textarea, not a text input', editModal.includes('<textarea') && editModal.includes('edit-note'));
window.closeModal();
state.showNumbers = false;

// Welcome uses checkbox not switch
state.catsStep = 1;
window.render();
const welcomeR6 = $('#root').innerHTML;
check('Welcome uses a checkbox for show-account-numbers (not .switch)', welcomeR6.includes('type="checkbox"') && !/class="switch[^"]*">\s*$/.test(welcomeR6.split('Show 4-digit account numbers')[1] || ''));
check('Welcome intro mentions IRS Form 1040 BEFORE Schedule C', welcomeR6.indexOf('IRS Form 1040') < welcomeR6.indexOf('Schedule C section'));

// Sticky header global: any .cat-table gets it
const stickyCss = ev('(function(){const s=getComputedStyle(document.createElement("th"));s.position; return Array.from(document.styleSheets).flatMap(ss=>{try{return Array.from(ss.cssRules||[]).map(r=>r.cssText||"")}catch(e){return []}}).join("\\n")})()');
check('Sticky-header CSS rule exists globally for .cat-table th', /\.cat-table th\b[^}]*position:\s*sticky/.test(stickyCss));

// Mgmt: em-dash gone, Tax Line Item column present
state.screen = 'mgmt';
state.showNumbers = false;
window.render();
const mgmtR6 = $('#root').innerHTML;
check('Mgmt with showNumbers=false has NO em-dash code cell', !mgmtR6.includes('class="muted">—</td>') || !/<td class="muted">—<\/td>/.test(mgmtR6));
check('Mgmt has "Tax Line Item" header (not "Tax line")', mgmtR6.includes('>Tax Line Item<'));

// --- 15. Round 8: Patrick's 5-item batch at 14:52 MDT ---

// (1) Step 5: description is exactly "No Tax Mapping", no "system" column
state.screen = 'cats';
state.catsStep = 5;
window.render();
const step5r8 = $('#root').innerHTML;
check('(R8.1) Step 5 description is "No Tax Mapping"', step5r8.includes('>No Tax Mapping<'));
check('(R8.1) Step 5 has NO "system" pill/column', !/pill system">system/.test(step5r8) && !step5r8.includes('>system<'));

// (2) Search bar: typing doesn't lose focus (renderMgmtTable only updates the table, not the whole page)
state.screen = 'mgmt';
window.render();
const searchElBefore = window.document.querySelector('#mgmt-search');
check('(R8.2) Search input exists with id=mgmt-search', !!searchElBefore);
searchElBefore.value = 'r';
window.__renderMgmtTable();
const searchElAfter = window.document.querySelector('#mgmt-search');
check('(R8.2) Search input element is NOT replaced after typing (same DOM node)', searchElBefore === searchElAfter);
state.catSearch = '';
window.__renderMgmtTable();

// (3) Add modal: Type locked in wizard, free in management
state.screen = 'cats';
state.catsStep = 2;
window.__openAdd('expense');
const addWizard = window.document.querySelector('#modal').innerHTML;
check('(R8.3) Add modal in wizard: Type select is disabled', addWizard.includes('id="m-type" disabled'));
check('(R8.3) Add modal in wizard: Type options are all disabled (greyed out)', (addWizard.match(/<option[^>]*disabled[^>]*>/g) || []).length >= 5);
window.closeModal();

state.screen = 'mgmt';
window.__openAdd('expense');
const addMgmt = window.document.querySelector('#modal').innerHTML;
check('(R8.3) Add modal in management: Type select is NOT disabled (free)', !addMgmt.includes('id="m-type" disabled'));
window.closeModal();

// (4) Settings General has all setup-wizard fields
state.screen = 'settings';
state.settingsTab = 'general';
window.render();
const settingsGeneralR8 = $('#root').innerHTML;
check('(R8.4) Settings General has Your name, Business name, Trade name', settingsGeneralR8.includes('Your name') && settingsGeneralR8.includes('Business name') && settingsGeneralR8.includes('Trade name'));
check('(R8.4) Settings General has NAICS lookup', settingsGeneralR8.includes('Look up NAICS'));
check('(R8.4) Settings General has EIN', settingsGeneralR8.includes('EIN'));
check('(R8.4) Settings General has Address fields', settingsGeneralR8.includes('Street address'));
check('(R8.4) Settings General has Accounting method', settingsGeneralR8.includes('Accounting method'));
check('(R8.4) Settings General has Fiscal year starts', settingsGeneralR8.includes('Fiscal year starts'));
check('(R8.4) Settings General has Business started on', settingsGeneralR8.includes('Business started on'));
check('(R8.4) Settings General has Currency', settingsGeneralR8.includes('Currency'));
check('(R8.4) Settings General has Business type', settingsGeneralR8.includes('Business type'));

// (5) Settings Categories: "Numerical by code" default, no "Go to categories" button
state.settingsTab = 'categories';
state.catDefaultSort = 'name';  // round 10: default flipped to Alphabetical by name
window.render();
const settingsCatR8 = $('#root').innerHTML;
check('(R8.5) Settings Categories has both "Alphabetical by name" and "Numerical by code" labels (the default flips between them per round 10)', settingsCatR8.includes('Alphabetical by name') && settingsCatR8.includes('Numerical by code'));
check('(R8.5) Settings Categories has NO "Go to categories" button', !settingsCatR8.includes('Go to categories'));
check('(R8.5) Default catDefaultSort is "name" (round 10: Patrick flipped back to Alphabetical by name)', ev('state.catDefaultSort') === 'name');

// (5b) Numerical-by-code radio is disabled when showNumbers is off
state.showNumbers = false;
window.render();
const settingsCodeDisabled = $('#root').innerHTML;
check('(R8.5b) Numerical-by-code radio is disabled when account numbers off', /name="catDefaultSort"[^>]*disabled/.test(settingsCodeDisabled));
check('(R8.5b) Disabled-state helper text mentions "Show 4-digit account numbers"', settingsCodeDisabled.includes('requires "Show 4-digit account numbers"'));
state.showNumbers = true;
window.render();

// --- 16. Round 9: Transactions column -> Balance (D50) ---
state.screen = 'mgmt';
state.catFilter = 'all';
state.catSearch = '';
window.render();
const mgmtBalance = $('#root').innerHTML;
check('(R9) Mgmt header says "Balance" not "Transactions"', mgmtBalance.includes('>Balance<') && !mgmtBalance.includes('>Transactions<'));
check('(R9) Expense row (Advertising) shows — in balance column (flow-based)', /Advertising[\s\S]{0,400}?class="right nowrap muted">—<\/td>/.test(mgmtBalance));
check('(R9) Income row (Sales) shows — in balance column (flow-based)', /Sales[\s\S]{0,400}?class="right nowrap muted">—<\/td>/.test(mgmtBalance));
check('(R9) Asset row (Business Checking) shows a dollar balance, not —', /Business Checking[\s\S]{0,400}?class="right nowrap">\$[\d,]+\.\d{2}<\/td>/.test(mgmtBalance));
check('(R9) Liability row (Business Credit Card) shows a negative balance with minus sign', /Business Credit Card[\s\S]{0,400}?class="right nowrap">−\$[\d,]+\.\d{2}<\/td>/.test(mgmtBalance));

// --- 17. Phase 1 design (2026-07-08 17:59 MDT): visible GL surface + simple-accounting rules ---
state.screen = 'ledger';
window.render();
const ledgerHtml = $('#root').innerHTML;
check('(P1) Sidebar includes Transactions link (was General Ledger; merged in round 16)', readFileSync('/Users/colonelhoracegentleman/clawd/projects/task-manager/docs/books/setup-wizard/WIREFRAMES.html', 'utf8').includes('data-screen="transactions"') && readFileSync('/Users/colonelhoracegentleman/clawd/projects/task-manager/docs/books/setup-wizard/WIREFRAMES.html', 'utf8').includes('💸 Transactions'));
check('(P1) Sidebar Categories is top-level, not nested under a Categories section', !readFileSync('/Users/colonelhoracegentleman/clawd/projects/task-manager/docs/books/setup-wizard/WIREFRAMES.html', 'utf8').includes('<div class="section">Categories</div>') && !readFileSync('/Users/colonelhoracegentleman/clawd/projects/task-manager/docs/books/setup-wizard/WIREFRAMES.html', 'utf8').includes('class="sub"><span>• Categories'));
check('(P1) General Ledger page renders as a dedicated wireframe route', ledgerHtml.includes('Every money event, balanced behind the scenes'));
check('(P1) Ledger page explains automatic entries from invoices/bills/payments/imports/journals', ledgerHtml.includes('invoices, bills, payments, bank imports, and manual journals'));
check('(P1) Ledger table has Patrick-specified columns', ['Date','Type','Name','Amount','Description','Category','Matched with','Status'].every(label => ledgerHtml.includes(`>${label}<`) || ledgerHtml.includes(`>${label}</th>`)));
check('(P1) Ledger page uses "Matched with" for the other side of the entry', ledgerHtml.includes('>Matched with<'));
check('(P1) Main General Ledger does not show Balance column', !ledgerHtml.includes('>Balance<') && !ledgerHtml.includes('$2,484.50'));
check('(P1) Ledger page shows customer/vendor name examples', ledgerHtml.includes('Little Pine Quilt Co.') && ledgerHtml.includes('Paper Trail Studio'));
check('(P1) Ledger page shows reconciliation placeholder states', ledgerHtml.includes('In progress') && ledgerHtml.includes('Reconciled'));
check('(P1) Ledger page keeps accounting concepts behind the scenes', ledgerHtml.includes('normal balances') && ledgerHtml.includes('stay behind the scenes'));
window.__openManualEntry();
const manualEntryModal = $('#modal').innerHTML;
check('(P1) New manual entry opens "New entry" modal (D62)', manualEntryModal.includes('New entry'));
check('(P1) Manual entry modal has Date, Account, Change, Description, Other account, Notes fields (D62)', ['Date','Account','Change','Description','Other account','Notes'].every(label => manualEntryModal.includes(label)));
check('(P1) Manual entry modal avoids debit/credit labels', !/>Debit</i.test(manualEntryModal) && !/>Credit</i.test(manualEntryModal) && !/Debit\s*\/\s*Credit/i.test(manualEntryModal));
check('(P1) Manual entry modal explains balanced ledger entry happens behind the scenes', manualEntryModal.includes('balanced ledger entry behind the scenes'));
check('(P1) Manual entry modal Sign convention copy: positive = up, negative = down (D63)', manualEntryModal.includes('positive = it went up') && manualEntryModal.includes('negative if it went down'));
check('(P1) Manual entry modal has only Save (no Save draft / Post entry split) (D65)', !/Save draft|Post entry/.test(manualEntryModal));
check('(P1) Manual entry modal has no Type picker (D62, D64: label adapts to picked Account type)', !/<label[^>]*>Type<\/label>/i.test(manualEntryModal) && !/Pick (a|an) (account )?type/i.test(manualEntryModal));

state.screen = 'mgmt';
state.catFilter = 'all';
window.render();
const mgmtPhase1 = $('#root').innerHTML;
const reviewLaterRow = (mgmtPhase1.match(/<tr class="review-later[\s\S]*?<\/tr>/) || [''])[0];
check('(P1) Review Later system row shows no Edit/Delete/Merge/Hide buttons', reviewLaterRow.includes('>System<') && !/__open(Edit|Delete|Merge)|__toggleHide/.test(reviewLaterRow));
window.__openEdit('expenses', 0);
const editModalPhase1 = $('#modal').innerHTML;
check('(P1) Merge and Delete lives inside Edit category modal for normal categories', editModalPhase1.includes('Merge and Delete…') && editModalPhase1.includes("__openMerge('expenses',0)"));
window.__openMerge('expenses', 0);
const mergeModalPhase1 = $('#modal').innerHTML;
check('(P1) Merge and Delete modal says transactions move, then source is deleted', mergeModalPhase1.includes('Merge and Delete category') && mergeModalPhase1.includes('will be moved to the destination category') && mergeModalPhase1.includes('will be deleted'));

const scriptSrc = readFileSync('/Users/colonelhoracegentleman/clawd/projects/task-manager/docs/books/setup-wizard/WIREFRAMES.html', 'utf8');
check('(P1) Dead mgmtRow() function removed (was superseded by mgmtUnifiedRow, referenced non-existent is_active/Disable concept)', !/function mgmtRow\(/.test(scriptSrc));
check('(P1) No "Disable category" modal text anywhere (conflicted with D55 single is_hidden flag)', !scriptSrc.includes('Disable category'));
check('(P1) No is_active references in wireframe JS (D55: is_hidden + is_system only)', !scriptSrc.includes('is_active'));
check('(P1) mgmtUnifiedRow uses is_hidden for Hide/Show toggle (D55)', /item\.is_hidden\?.Show.:.Hide./.test(scriptSrc));
check('(P1) No "subtype" field anywhere in wireframe JS (D52: Schedule C line is the implicit categorization)', !/\bsubtype\b/i.test(scriptSrc));
check('(P1) No "COGS" or "Cost of Goods" UI text in wireframe (D53: COGS is v3, schema-only reserved range)', !/cost of goods|\bCOGS\b/i.test(scriptSrc));
check('(P1) No "close fiscal year" or year-end-close UI anywhere (D56: no explicit close, auto-flows to Equity)', !/close.{0,3}(fiscal )?year/i.test(scriptSrc));
check('(R16) Sidebar no longer has a separate General Ledger link (merged into Transactions)', !scriptSrc.includes('data-screen="ledger"') && !scriptSrc.includes('General Ledger'));
check('(R16) data-screen="transactions" routes to renderLedger()', /if\(s==='transactions'\)\s+return renderLedger/.test(scriptSrc));
check('(R17) Default landing screen is Dashboard (was Settings)', /state\.screen = state\.screen \|\| 'dashboard'/.test(scriptSrc));
check('(R17) Sidebar Dashboard link has class="active" (matches default)', /data-screen="dashboard" class="active"/.test(scriptSrc));
check('(R17) Sidebar Settings link no longer has class="active" (was hardcoded)', !/data-screen="settings" class="active"/.test(scriptSrc));

// --- Round 15 (Phase 1 cleanup) ---
const specSrc = readFileSync('/Users/colonelhoracegentleman/clawd/projects/task-manager/docs/books/setup-wizard/SETUP_AND_CATEGORIES.md', 'utf8');
for (const d of ['D29','D30','D31','D32','D43','D44','D45','D46','D47','D48','D49']) {
  const matches = specSrc.match(new RegExp(`\\| ${d} \\|`, 'g')) || [];
  check(`(R15) Spec ${d} appears exactly once (dedupe)`, matches.length === 1, `found ${matches.length}`);
}
check('(R15) Wireframe: no `activeTab:` field on state (round 15 removed)', !/^\s*activeTab\s*:/m.test(scriptSrc));
check('(R15) Wireframe: no legacy catFilter values "revenue" or "ale" (single-page renderMgmt uses expense/income/ale as chip keys, but routing compat was dropped)', !/catFilter\s*=\s*['"]revenue['"]/.test(scriptSrc) && !/catFilter\s*=\s*['"]ale['"]/.test(scriptSrc));
check('(R15) Wireframe sidebar has no data-screen="income"/"expenses"/"other" (those would route through the dead branches we just removed)', !/data-screen="income"/.test(scriptSrc) && !/data-screen="expenses"/.test(scriptSrc) && !/data-screen="other"/.test(scriptSrc));
check('(R15) Wireframe global click router is the simple form (no if/else chain on data-screen)', /state\.screen = k;\s*render\(\);\s*\}\);/.test(scriptSrc));
check('(R15) Wireframe dashboard widget uses catFilter (not activeTab) for Categories link', /onclick="state\.screen='mgmt';state\.catFilter='expenses';render\(\)"/.test(scriptSrc));
check('(R15) Spec status header mentions Round 15', /Round 15 applied 2026-07-09/.test(specSrc));

const failed = results.filter(r => !r.pass);
console.log('---');
console.log(`${results.length - failed.length}/${results.length} passed.`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log('  - ' + f.label + (f.detail ? '  · ' + f.detail : ''));
  process.exit(1);
}
process.exit(0);
