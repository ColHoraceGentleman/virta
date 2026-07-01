// Virta Books — Phase C: American Express CSV parser.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 (CSV column-mapping rules).
//
// Header signature: contains "Card Member".
// Canonical mapping: date=Date, description=Description, amount=Amount.
// Sign convention: negative = outflow.

import Papa from 'papaparse';

function headerLooksLikeAmex(headerRow) {
  const headers = headerRow.map(h => String(h || '').trim());
  return headers.includes('Card Member');
}

export function detect(buffer, _filename, _mimeType) {
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf8');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const parsed = Papa.parse(firstLine, { skipEmptyLines: true });
  const headerRow = (parsed.data && parsed.data[0]) || [];
  if (headerLooksLikeAmex(headerRow)) {
    return { matches: true, source: 'amex', format: 'csv' };
  }
  return { matches: false };
}

function cleanAmount(s) {
  if (s === null || s === undefined) return 0;
  const cleaned = String(s).replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(s) {
  // AmEx exports dates as MM/DD/YYYY (US format).
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
    const txn_date = normalizeDate(row['Date']);
    const description = (row['Description'] || '').toString().trim();
    const amount = cleanAmount(row['Amount']);
    if (!txn_date || !description) continue;
    out.push({ txn_date, description, amount });
  }
  return out;
}

export const CANONICAL_MAPPING = {
  source_key: 'amex',
  date_col: 'Date',
  description_col: 'Description',
  amount_col: 'Amount',
  amount_sign_convention: 'negative_outflow',
  suggested_account_code: '2000', // Business Credit Card
};