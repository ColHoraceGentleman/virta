// Virta Books — Phase C: Venmo CSV parser.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 (CSV column-mapping rules).
//
// Header signature: contains "Datetime" + "From".
// Canonical mapping: date=Datetime, description=Note, amount=Amount.
// Sign convention: positive = inflow.

import Papa from 'papaparse';

function headerLooksLikeVenmo(headerRow) {
  const headers = headerRow.map(h => String(h || '').trim());
  return headers.includes('Datetime') && headers.includes('From');
}

export function detect(buffer, _filename, _mimeType) {
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf8');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const parsed = Papa.parse(firstLine, { skipEmptyLines: true });
  const headerRow = (parsed.data && parsed.data[0]) || [];
  if (headerLooksLikeVenmo(headerRow)) {
    return { matches: true, source: 'venmo', format: 'csv' };
  }
  return { matches: false };
}

function cleanAmount(s) {
  if (s === null || s === undefined) return 0;
  // Venmo may prefix negative values with "-".
  const cleaned = String(s).replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(s) {
  // Venmo exports "2024-01-15T13:45:00" or "2024-01-15 13:45:00" or "2024-01-15".
  const raw = String(s || '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
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
    const txn_date = normalizeDate(row['Datetime']);
    // Note is the human-typed memo on Venmo. Fallback to "From"/"To" combination if empty.
    let description = (row['Note'] || '').toString().trim();
    if (!description) {
      const from = (row['From'] || '').toString().trim();
      const to = (row['To'] || '').toString().trim();
      description = from && to ? `${from} → ${to}` : (from || to || 'Venmo');
    }
    const amount = cleanAmount(row['Amount']);
    if (!txn_date || !description) continue;
    out.push({ txn_date, description, amount });
  }
  return out;
}

export const CANONICAL_MAPPING = {
  source_key: 'venmo',
  date_col: 'Datetime',
  description_col: 'Note',
  amount_col: 'Amount',
  amount_sign_convention: 'negative_outflow', // Venmo exports positive=inflow, negative=payment. Keep signs as-is.
  suggested_account_code: '1020', // Venmo
};