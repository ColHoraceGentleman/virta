// Virta Books — Setup Wizard Foundation (B2a-prime)
// Business + per-business settings CRUD service.
//
// Source of truth: docs/books/setup-wizard/SETUP_AND_CATEGORIES.md §4.1 + §4.3.
// Single-tenant v2 assumption: there is exactly one business row per install.
// "current business" = the row with id='default_business' (if present) else the
// first row ordered by created_at. Returns null if the table is empty.
//
// Field whitelist comes from §4.1; unknown fields in payload are ignored so the
// UI can pass through the full wizard form without us playing whack-a-mole.

import db, { generateId } from '../db.js';

// All updatable columns on businesses (id + timestamps are managed by the DB).
const BUSINESS_FIELDS = [
  'proprietor_name',
  'business_name',
  'trade_name',
  'business_description',
  'naics_code',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal',
  'country',
  'ein',
  'accounting_method',
  'fiscal_year_start_month',
  'business_started_on',
  'business_type',
  'currency',
];

// Required fields per the wizard's Step 2 ("Basic business info"). The wizard
// blocks submission if any of these are empty, but the API enforces them too
// so a hand-crafted POST can't leave us with a half-built business.
const REQUIRED_FIELDS = ['proprietor_name', 'business_name'];

function pickBusinessFields(payload) {
  const out = {};
  if (!payload || typeof payload !== 'object') return out;
  for (const k of BUSINESS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) out[k] = payload[k];
  }
  return out;
}

function getCurrentBusiness() {
  // Prefer the canonical 'default_business' sentinel; fall back to the first
  // row by created_at. Returns the raw row (with all §4.1 columns) or null.
  return (
    db.prepare('SELECT * FROM businesses WHERE id = ?').get('default_business') ||
    db.prepare('SELECT * FROM businesses ORDER BY created_at ASC LIMIT 1').get() ||
    null
  );
}

function createBusiness(payload) {
  const fields = pickBusinessFields(payload);

  // Required-field validation.
  for (const k of REQUIRED_FIELDS) {
    const v = fields[k];
    if (v === undefined || v === null || String(v).trim() === '') {
      throw new Error(`${k} is required`);
    }
  }
  if (fields.fiscal_year_start_month !== undefined) {
    const m = Number(fields.fiscal_year_start_month);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new Error('fiscal_year_start_month must be an integer 1-12');
    }
    fields.fiscal_year_start_month = m;
  }

  const id = (payload && payload.id) || generateId();

  // Build INSERT — only include columns the caller actually supplied so we
  // don't fight the DB defaults for accounting_method, country, currency, etc.
  const cols = ['id'];
  const placeholders = ['?'];
  const values = [id];
  for (const k of BUSINESS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(fields, k)) {
      cols.push(k);
      placeholders.push('?');
      values.push(fields[k]);
    }
  }

  db.prepare(`INSERT INTO businesses (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`).run(...values);
  return getBusinessById(id);
}

function updateBusiness(id, payload) {
  if (!getBusinessById(id)) {
    const err = new Error(`Business not found: ${id}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const fields = pickBusinessFields(payload);
  if (Object.keys(fields).length === 0) {
    // Nothing to update — return the current row unchanged.
    return getBusinessById(id);
  }
  if (fields.fiscal_year_start_month !== undefined) {
    const m = Number(fields.fiscal_year_start_month);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new Error('fiscal_year_start_month must be an integer 1-12');
    }
    fields.fiscal_year_start_month = m;
  }

  const sets = [];
  const values = [];
  for (const k of BUSINESS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(fields, k)) {
      sets.push(`${k} = ?`);
      values.push(fields[k]);
    }
  }
  sets.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE businesses SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getBusinessById(id);
}

function getBusinessById(id) {
  return db.prepare('SELECT * FROM businesses WHERE id = ?').get(id) || null;
}

// ---- Settings (per-business key/value) ----

function getSettings(businessId) {
  const rows = db
    .prepare('SELECT key, value FROM settings WHERE business_id = ?')
    .all(businessId);
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function getSetting(businessId, key) {
  const row = db
    .prepare('SELECT key, value FROM settings WHERE business_id = ? AND key = ?')
    .get(businessId, key);
  return row || null;
}

function updateSetting(businessId, key, value) {
  // Upsert via SQLite ON CONFLICT (composite PK = business_id + key).
  db.prepare(
    `INSERT INTO settings (business_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(business_id, key) DO UPDATE SET value = excluded.value`
  ).run(businessId, key, value === undefined || value === null ? null : String(value));
  return { key, value: value === undefined || value === null ? null : String(value) };
}

export {
  BUSINESS_FIELDS,
  REQUIRED_FIELDS,
  getCurrentBusiness,
  getBusinessById,
  createBusiness,
  updateBusiness,
  getSettings,
  getSetting,
  updateSetting,
};