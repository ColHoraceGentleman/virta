// Virta Books — Phase C: PayPal CSV parser.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 (CSV column-mapping rules).
//
// Header signature: contains "TimeZone" + "Status".
// Canonical mapping: date=Date, description=Name, amount=Net (or Amount if Net absent).
// Sign convention: positive = inflow (PayPal sales are positive).

import Papa from 'papaparse';

function headerLooksLikePaypal(headerRow) {
  const headers = headerRow.map(h => String(h || '').trim());
  return headers.includes('TimeZone') && headers.includes('Status');
}

export function detect(buffer, _filename, _mimeType) {
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf8');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const parsed = Papa.parse(firstLine, { skipEmptyLines: true });
  const headerRow = (parsed.data && parsed.data[0]) || [];
  if (headerLooksLikePaypal(headerRow)) {
    return { matches: true, source: 'paypal', format: 'csv' };
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
  // PayPal exports dates in multiple formats. Try ISO first, then US.
  const raw = String(s || '').trim();
  if (!raw) return null;
  // ISO YYYY-MM-DD...
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  // US MM/DD/YYYY
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return null;
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
    const description = (row['Name'] || '').toString().trim();
    // Net preferred, fallback to Amount.
    const amountCol = (row['Net'] !== undefined && row['Net'] !== '' && row['Net'] !== null)
      ? row['Net']
      : row['Amount'];
    const amount = cleanAmount(amountCol);
    if (!txn_date || !description) continue;
    out.push({ txn_date, description, amount });
  }
  return out;
}

export const CANONICAL_MAPPING = {
  source_key: 'paypal',
  date_col: 'Date',
  description_col: 'Name',
  amount_col: 'Net',
  amount_sign_convention: 'negative_outflow', // PayPal exports positive=inflow, negative=refund/fee. Keep signs as-is.
  suggested_account_code: '1010', // PayPal
};