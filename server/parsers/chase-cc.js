// Virta Books — Phase C: Chase Credit Card CSV parser.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 (CSV column-mapping rules).
//
// Header signature: contains "Transaction Date" + "Post Date".
// Canonical mapping: date=Transaction Date, description=Description, amount=Amount.
// Sign convention: negative = outflow (Chase reports purchases as negative).

import Papa from 'papaparse';

// Heuristic sniff — robust to header order and trailing whitespace.
function headerLooksLikeChase(headerRow) {
  const headers = headerRow.map(h => String(h || '').trim());
  return headers.includes('Transaction Date') && headers.includes('Post Date');
}

export function detect(buffer, _filename, _mimeType) {
  // buffer is a UTF-8 string when called from the route (multer text mode).
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf8');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  // Use Papa to safely parse the header row.
  const parsed = Papa.parse(firstLine, { skipEmptyLines: true });
  const headerRow = (parsed.data && parsed.data[0]) || [];
  if (headerLooksLikeChase(headerRow)) {
    return { matches: true, source: 'chase', format: 'csv' };
  }
  return { matches: false };
}

function cleanAmount(s) {
  if (s === null || s === undefined) return 0;
  // Chase exports amounts like "-12.34" or "12.34". Strip $ and commas.
  const cleaned = String(s).replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(s) {
  // Chase exports dates as MM/DD/YYYY. Return ISO YYYY-MM-DD.
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

export function parse(buffer) {
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf8');
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => String(h || '').trim(),
  });
  const rows = result.data || [];
  const out = [];
  for (const row of rows) {
    const txn_date = normalizeDate(row['Transaction Date']);
    const description = (row['Description'] || '').toString().trim();
    const amount = cleanAmount(row['Amount']);
    if (!txn_date || !description) continue;
    out.push({ txn_date, description, amount });
  }
  return out;
}

// Canonical column mapping (used by the import pipeline when no saved mapping exists).
export const CANONICAL_MAPPING = {
  source_key: 'chase',
  date_col: 'Transaction Date',
  description_col: 'Description',
  amount_col: 'Amount',
  amount_sign_convention: 'negative_outflow',
  // Suggested source account by code; importer looks up by code → account id.
  suggested_account_code: '2000', // Business Credit Card
};