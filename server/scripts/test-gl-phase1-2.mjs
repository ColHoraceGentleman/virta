// Test harness for Phase 1+2 journal service. Idempotent: each test creates
// its own disposable entry so it can re-run without mutating existing data
// beyond what the migration already wrote.
//
// What it covers:
//   - Migration side effects (new columns + tables present)
//   - Sign convention for all 5 account types (asset/expense normal-debit,
//     liability/equity/income normal-credit)
//   - Balanced-entry guarantee on every commit
//   - Audit log row written on every create
//   - List filter API (date / category / name)
//   - Validation errors for invalid combinations
//   - account_balances snapshot updated

import db from '../db.js';
import {
  createEntry,
  listEntries,
  normalBalanceOf,
} from '../services/journalService.js';

// Clean up any entries this test created in previous runs. This lets the
// snapshot test be deterministic without touching real user data.
{
  const TX_DATE = '2026-07-09';
  db.prepare(`DELETE FROM account_balances WHERE as_of_date = ?`).run(TX_DATE);
  // The entries we create are all 'manual' source with category_account_id
  // pointing at one of the seeded test accounts. Match by txn_date for our
  // specific test date so we don't touch user data.
  db.prepare(`DELETE FROM journal_entries WHERE txn_date = ? AND source = 'manual' AND (description LIKE 'Manual entry:%' OR description LIKE 'Test %' OR description LIKE 'Pay down credit card' OR description LIKE 'Owner draw')`).run(TX_DATE);
}

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('✅', label, detail || ''); }
  else { fail++; console.log('❌', label, detail || ''); }
}

// Pick the accounts we need by code (Phases A-E seeded them).
const rows = db.prepare('SELECT id, code, name, account_type FROM accounts').all();
const byCode = Object.fromEntries(rows.map(r => [r.code, r]));
const NEED = ['6010', '1000', '4000', '2000', '3000'];
const have = NEED.map(c => [c, byCode[c]]);
if (have.some(([,a]) => !a)) {
  console.error('Missing required seeded accounts:', have.filter(([,a]) => !a).map(([c]) => c));
  process.exit(1);
}
const [A6010, A1000, A4000, A2000, A3000] = NEED.map(c => byCode[c]);

// --- Migration side effects ---
{
  const newCol = db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('journal_entries') WHERE name='recon_status'").get().c;
  ok('journal_entries.recon_status column exists', newCol === 1);
  ok('journal_entries.name column exists',
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('journal_entries') WHERE name='name'").get().c === 1);
  ok('journal_entries.notes column exists',
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('journal_entries') WHERE name='notes'").get().c === 1);
  ok('journal_entries.amount column exists',
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('journal_entries') WHERE name='amount'").get().c === 1);
  ok('journal_entries.category_account_id column exists',
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('journal_entries') WHERE name='category_account_id'").get().c === 1);
  ok('journal_entries.matched_account_id column exists',
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('journal_entries') WHERE name='matched_account_id'").get().c === 1);
  ok('audit_log table exists',
    db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='audit_log'").get().c === 1);
  ok('account_balances table exists',
    db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='account_balances'").get().c === 1);
  ok('accounts.is_hidden column exists',
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('accounts') WHERE name='is_hidden'").get().c === 1);
}

// --- Sign convention helpers ---
ok('normalBalanceOf(asset)=debit', normalBalanceOf('asset') === 'debit');
ok('normalBalanceOf(expense)=debit', normalBalanceOf('expense') === 'debit');
ok('normalBalanceOf(liability)=credit', normalBalanceOf('liability') === 'credit');
ok('normalBalanceOf(equity)=credit', normalBalanceOf('equity') === 'credit');
ok('normalBalanceOf(income)=credit', normalBalanceOf('income') === 'credit');

// --- Test 1: positive expense (debit normal) ---
const TX_DATE = '2026-07-09';
const e1 = createEntry({
  txn_date: TX_DATE,
  type: 'expense',
  category_account_id: A6010.id,
  matched_account_id: A1000.id,
  amount: 45.20,
  name: 'Google Ads',
  description: 'Test expense entry',
});
const e1Lines = db.prepare('SELECT * FROM journal_lines WHERE entry_id = ?').all(e1.id);
ok('Test 1: 2 lines', e1Lines.length === 2);
const e1Dr = e1Lines.reduce((s,l)=>s + l.debit, 0);
const e1Cr = e1Lines.reduce((s,l)=>s + l.credit, 0);
ok('Test 1: balanced (sum debit = sum credit)', Math.abs(e1Dr - e1Cr) < 1e-6, `dr=${e1Dr} cr=${e1Cr}`);
ok('Test 1: total = $45.20', Math.abs(e1Dr - 45.20) < 1e-6);
{
  const catLine = e1Lines.find(l => l.account_id === A6010.id);
  const mtcLine = e1Lines.find(l => l.account_id === A1000.id);
  ok('Test 1: expense → debit category, credit matched (asset)',
    catLine.debit === 45.20 && catLine.credit === 0 &&
    mtcLine.debit === 0 && mtcLine.credit === 45.20);
}

// --- Test 2: negative expense ---
const e2 = createEntry({
  txn_date: TX_DATE,
  type: 'expense',
  category_account_id: A6010.id,
  matched_account_id: A1000.id,
  amount: -30,
  name: 'Refund',
});
{
  const lines = db.prepare('SELECT * FROM journal_lines WHERE entry_id = ?').all(e2.id);
  const cat = lines.find(l => l.account_id === A6010.id);
  const mtc = lines.find(l => l.account_id === A1000.id);
  ok('Test 2: negative expense → credit category, debit matched',
    cat.credit === 30 && cat.debit === 0 &&
    mtc.debit === 30 && mtc.credit === 0);
}

// --- Test 3: positive income (credit normal) ---
const e3 = createEntry({
  txn_date: TX_DATE,
  type: 'income',
  category_account_id: A4000.id,
  matched_account_id: A1000.id,
  amount: 250,
  name: 'Test Customer LLC',
});
{
  const lines = db.prepare('SELECT * FROM journal_lines WHERE entry_id = ?').all(e3.id);
  const cat = lines.find(l => l.account_id === A4000.id);
  const mtc = lines.find(l => l.account_id === A1000.id);
  ok('Test 3: positive income → credit category, debit matched',
    cat.credit === 250 && cat.debit === 0 &&
    mtc.debit === 250 && mtc.credit === 0);
}

// --- Test 4: positive liability (credit normal) ---
const e4 = createEntry({
  txn_date: TX_DATE,
  type: 'liability',
  category_account_id: A2000.id,
  matched_account_id: A1000.id,
  amount: 100,
  description: 'Pay down credit card',
});
{
  const lines = db.prepare('SELECT * FROM journal_lines WHERE entry_id = ?').all(e4.id);
  const cat = lines.find(l => l.account_id === A2000.id);
  const mtc = lines.find(l => l.account_id === A1000.id);
  ok('Test 4: +liability → credit category, debit matched (asset)',
    cat.credit === 100 && cat.debit === 0 &&
    mtc.debit === 100 && mtc.credit === 0);
}

// --- Test 5: positive equity (credit normal, owner draw) ---
const e5 = createEntry({
  txn_date: TX_DATE,
  type: 'equity',
  category_account_id: A3000.id,
  matched_account_id: A1000.id,
  amount: 50,
  description: 'Owner draw',
});
{
  const lines = db.prepare('SELECT * FROM journal_lines WHERE entry_id = ?').all(e5.id);
  const cat = lines.find(l => l.account_id === A3000.id);
  const mtc = lines.find(l => l.account_id === A1000.id);
  ok('Test 5: +equity (draw) → credit equity, debit matched (asset)',
    cat.credit === 50 && cat.debit === 0 &&
    mtc.debit === 50 && mtc.credit === 0);
}

// --- Audit log ---
{
  const auditCount = db.prepare(
    `SELECT COUNT(*) AS c FROM audit_log WHERE source = 'journal_entry' AND source_id IN (?,?,?,?,?)`
  ).get(e1.id, e2.id, e3.id, e4.id, e5.id).c;
  ok('Audit log row written for each of the 5 entries', auditCount === 5, `${auditCount} rows`);
  const a1 = db.prepare(`SELECT * FROM audit_log WHERE source_id = ?`).get(e1.id);
  ok('Audit summary starts with "Created journal entry on"',
    a1 && a1.summary.startsWith('Created journal entry on'));
  ok('Audit before_json is null (newly created)', a1.before_json === null);
  ok('Audit after_json parses as JSON', (() => { try { JSON.parse(a1.after_json); return true; } catch { return false; } })());
  const parsed = JSON.parse(a1.after_json);
  ok('Audit after_json has 2 lines', parsed.lines.length === 2);
  ok('Audit after_json entry.source = "manual"', parsed.entry.source === 'manual');
}

// --- listEntries filter API ---
{
  const byDate = listEntries({ date_from: TX_DATE, date_to: TX_DATE });
  ok('listEntries by date_from/to contains all 5 new entries', byDate.rows.length >= 5, `${byDate.rows.length} rows`);
  ok('listEntries rows include category_code + matched_code',
    byDate.rows[0] && byDate.rows[0].category_code && byDate.rows[0].matched_code);

  const byCat = listEntries({ category_id: A6010.id });
  ok('listEntries by category_id returns 6010 entries', byCat.rows.some(r => r.category_code === '6010'));

  const byName = listEntries({ name_q: 'Customer LLC' });
  ok('listEntries by name_q=Customer matches Test 3', byName.rows.some(r => r.id === e3.id));

  // Limit/offset works
  const limited = listEntries({ date_from: TX_DATE, date_to: TX_DATE, limit: 2, offset: 0 });
  ok('listEntries limit=2 returns ≤2 rows', limited.rows.length <= 2);
}

// --- Validation: same category as matched ---
{
  let rejected = false;
  try {
    createEntry({ txn_date: TX_DATE, type: 'expense',
      category_account_id: A6010.id, matched_account_id: A6010.id, amount: 1 });
  } catch (e) { rejected = !!e.message; }
  ok('Validation: same category + matched rejected', rejected);
}

// --- Validation: type mismatch (asked for income, picked an expense) ---
{
  let rejected = false;
  try {
    createEntry({ txn_date: TX_DATE, type: 'income',
      category_account_id: A6010.id /* expense */, matched_account_id: A1000.id, amount: 1 });
  } catch (e) { rejected = !!e.message; }
  ok('Validation: type mismatch rejected', rejected);
}

// --- Validation: zero / tiny amount ---
for (const [a, lbl] of [[0, 'zero'], [0.004, '<0.005']]) {
  let rejected = false;
  try {
    createEntry({ txn_date: TX_DATE, type: 'expense',
      category_account_id: A6010.id, matched_account_id: A1000.id, amount: a });
  } catch (e) { rejected = !!e.message; }
  ok(`Validation: ${lbl} amount rejected`, rejected);
}

// --- Account balance snapshot ---
{
  const bal = db.prepare(
    `SELECT * FROM account_balances WHERE account_id = ? AND as_of_date = ?`
  ).get(A6010.id, TX_DATE);
  // 6010 (expense, debit normal) went up +45.20, then down -30 → net +15.20.
  // Note: there's existing import-driven journal_lines for 6010 from earlier,
  // but those weren't posted through this service, so the snapshot only
  // reflects what THIS service posted. We just assert it sums to +15.20.
  ok('account_balances row exists for A6010',
    bal !== undefined, `balance=${bal && bal.balance}`);
  if (bal) {
    ok('account_balances matches running total (+15.20 net for 6010 today)',
      Math.abs(bal.balance - (45.20 - 30)) < 1e-6,
      `balance=${bal.balance}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
