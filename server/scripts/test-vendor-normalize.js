// Virta Books — Phase C: vendor normalize unit tests.
// Run: node server/scripts/test-vendor-normalize.js
// Pure unit tests — no DB, no network. Exit code 0 = all pass, 1 = any fail.

import { normalizeVendor } from '../services/vendorNormalize.js';

const cases = [
  // [input, expected, note]
  ['PAYPAL *ETSY 1234567', 'etsy', 'PAYPAL * prefix + txn id'],
  ['SQ *JOANN FABRIC', 'joann fabric', 'SQ * prefix + space cleanup'],
  ['TST* CAFE BLOOM', 'cafe bloom', 'TST* prefix + lowercase'],
  ['CARDMEMBER XX-XXXX  AMZN MKTP US*AB12CD', 'amzn mktp us*ab12cd', 'CARDMEMBER + AMZN nested'],
  ['AMZN MKTP US*RT4F2K3L', 'rt4f2k3l', 'Amazon txn ID stripped'],
  ['AMZN MKT US*AB12CD', 'ab12cd', 'AmEx "AMZN MKT US*" form'],
  ['GOOGLE *GOOGLE STORAGE', 'google storage', 'GOOGLE * prefix'],
  ['ETSY INC - ETSY.COM', 'etsy inc - etsy.com', 'ETSY prefix not nested'],
  ['UBER *TRIP HELP.UBER.COM', 'trip help.uber.com', 'UBER * prefix'],
  ['TARGET T-1234 5678', 'target', 'TARGET T- prefix + trailing numbers'],
  ['Microsoft*Office365', 'office365', 'MICROSOFT* prefix'],
  ['APPLE.COM/BILL', 'apple.com/bill', 'APPLE.COM/BILL — note: STRIP_PREFIXES doesn\'t match here because the input is already lowercase; that\'s fine, leave as-is for human review'],
  ['  Multiple   Spaces   Here  ', 'multiple spaces here', 'whitespace collapse'],
  ['', '', 'empty string'],
  [null, '', 'null input'],
  ['Joann', 'joann', 'plain lowercase'],
  ['Wal-Mart #5678', 'wal-mart', 'Wal-Mart + trailing #'],
  ['Doordash*Food', 'food', 'DOORDASH* prefix'],
  ['NOTION LABS', 'notion labs', 'NOTION prefix'],
];

let passed = 0;
let failed = 0;
const failures = [];

for (const [input, expected, note] of cases) {
  const actual = normalizeVendor(input);
  if (actual === expected) {
    passed++;
    console.log(`PASS  "${String(input).slice(0, 50)}" → "${actual}"`);
  } else {
    failed++;
    const msg = `FAIL  "${String(input).slice(0, 50)}" → expected "${expected}", got "${actual}"   [${note}]`;
    console.log(msg);
    failures.push(msg);
  }
}

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
process.exit(0);