// Virta Books — Phase D: Reports (read-only).
//   GET /api/v1/books/reports/ar-aging       — JSON bucketed by days past due
//   GET /api/v1/books/reports/schedule-c?year=YYYY — ZIP of 3 CSVs
//
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
//   §4 (AR Aging) and §7 (Schedule C CSV Export).
//
// Phase D is read-only by design: no schema changes, no new tables.

import { Router } from 'express';
import db from '../../db.js';
// `archiver` v8 is ESM and exports a `ZipArchive` class (the old function-call
// form `archiver('zip', opts)` from v7 no longer works).
import { ZipArchive } from 'archiver';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// SQLite returns REAL as JS number; round to 2dp for currency output.
function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

// CSV escape: wrap in quotes if the value contains comma, quote, or newline.
// Double internal quotes per RFC 4180.
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(values) {
  return values.map(csvCell).join(',') + '\n';
}

// Parse `?as_of=YYYY-MM-DD` defensively. Falls back to today (UTC) on missing/invalid.
function resolveAsOf(req) {
  const raw = (req.query.as_of || '').trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date().toISOString().slice(0, 10);
  // Reject obvious garbage dates (e.g. 2025-13-40). Date.parse with strict YYYY-MM-DD
  // interpretation: build a UTC Date, then verify the string round-trips.
  const d = new Date(raw + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  if (d.toISOString().slice(0, 10) !== raw) return new Date().toISOString().slice(0, 10);
  return raw;
}

// ---------------------------------------------------------------------------
// GET /api/v1/books/reports/ar-aging
//   Buckets invoices by `days_past_due = (as_of - due_date)` in days:
//     current      — days_past_due <= 0
//     days_30      — 1..30
//     days_60      — 31..60
//     days_90      — 61..90
//     days_90_plus — >= 91
//   Source: invoices WHERE status IN ('sent','overdue'). Outstanding = total
//   (no `amount_paid` column in v1 — full-paid invoices are excluded by status).
//   Group by customer_id; sum amounts per bucket.
// ---------------------------------------------------------------------------
router.get('/ar-aging', (req, res) => {
  try {
    const asOf = resolveAsOf(req);
    // JULIANDAY(due_date) - JULIANDAY(as_of) is negative when due_date > as_of,
    // i.e. the invoice is not yet due. We want days_past_due = as_of - due_date.
    //   current  :  (as_of - due_date) <= 0
    //   days_30  :  1..30
    //   days_60  :  31..60
    //   days_90  :  61..90
    //   90+      :  >=91
    const rows = db.prepare(`
      SELECT
        i.customer_id,
        c.name AS customer_name,
        SUM(CASE WHEN (JULIANDAY(?) - JULIANDAY(i.due_date)) <= 0 THEN i.total ELSE 0 END) AS current_amt,
        SUM(CASE WHEN (JULIANDAY(?) - JULIANDAY(i.due_date)) BETWEEN 1 AND 30 THEN i.total ELSE 0 END) AS days_30_amt,
        SUM(CASE WHEN (JULIANDAY(?) - JULIANDAY(i.due_date)) BETWEEN 31 AND 60 THEN i.total ELSE 0 END) AS days_60_amt,
        SUM(CASE WHEN (JULIANDAY(?) - JULIANDAY(i.due_date)) BETWEEN 61 AND 90 THEN i.total ELSE 0 END) AS days_90_amt,
        SUM(CASE WHEN (JULIANDAY(?) - JULIANDAY(i.due_date)) >= 91 THEN i.total ELSE 0 END) AS days_90_plus_amt,
        SUM(i.total) AS total_amt
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.status IN ('sent','overdue')
      GROUP BY i.customer_id, c.name
      ORDER BY total_amt DESC, c.name COLLATE NOCASE
    `).all(asOf, asOf, asOf, asOf, asOf);

    // Shape to spec and compute grand totals.
    let tCurrent = 0, t30 = 0, t60 = 0, t90 = 0, t90p = 0, tTotal = 0;
    const data = rows.map(r => {
      const current = money(r.current_amt);
      const d30 = money(r.days_30_amt);
      const d60 = money(r.days_60_amt);
      const d90 = money(r.days_90_amt);
      const d90p = money(r.days_90_plus_amt);
      const total = money(r.total_amt);
      tCurrent += current; t30 += d30; t60 += d60; t90 += d90; t90p += d90p; tTotal += total;
      return {
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        current, days_30: d30, days_60: d60, days_90: d90, days_90_plus: d90p,
        total,
      };
    });

    res.json({
      data,
      as_of: asOf,
      totals: {
        current: money(tCurrent),
        days_30: money(t30),
        days_60: money(t60),
        days_90: money(t90),
        days_90_plus: money(t90p),
        total: money(tTotal),
      },
    });
  } catch (err) {
    console.error('[Books/Reports] ar-aging failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/books/reports/schedule-c?year=YYYY
//   Returns a ZIP with three CSVs:
//     schedule_c_income.csv
//     schedule_c_expenses.csv
//     trial_balance.csv
//   Filename: chantelle-books-{year}-export-{YYYY-MM-DD}.zip (export date).
// ---------------------------------------------------------------------------
function buildIncomeCsv(year) {
  // Income accounts are 4000-4999. Income has credit-normal balance, so
  // gross_amount = SUM(credit) per (date, source, account).
  // source = the linked transaction's vendor_normalized (when present) or
  //          the journal_entry description.
  const rows = db.prepare(`
    SELECT
      je.txn_date AS date,
      COALESCE(t.vendor_normalized, je.description) AS source,
      jl.account_id,
      a.code AS account_code,
      a.name AS account_name,
      SUM(jl.credit) AS gross_amount
    FROM journal_entries je
    JOIN journal_lines jl ON jl.entry_id = je.id
    JOIN accounts a ON a.id = jl.account_id
    LEFT JOIN transactions t ON t.id = je.source_id
    WHERE je.txn_date >= ? AND je.txn_date <= ?
      AND a.code >= '4000' AND a.code < '5000'
      AND jl.credit > 0
    GROUP BY je.txn_date, source, jl.account_id, a.code, a.name
    ORDER BY je.txn_date, a.code
  `).all(`${year}-01-01`, `${year}-12-31`);

  let csv = csvRow(['date', 'source', 'gross_amount', 'cogs_amount', 'net', 'account_code', 'account_name']);
  for (const r of rows) {
    const gross = money(r.gross_amount);
    csv += csvRow([r.date, r.source, gross.toFixed(2), '0.00', gross.toFixed(2), r.account_code, r.account_name]);
  }
  return csv;
}

function buildExpensesCsv(year) {
  // Expense accounts are 6000-6999. Expenses have debit-normal balance, so
  // amount = SUM(debit) per (date, vendor, account).
  // vendor = transactions.vendor_normalized (or description as fallback).
  // memo   = transactions.notes when present, else journal_entry description.
  const rows = db.prepare(`
    SELECT
      je.txn_date AS date,
      COALESCE(t.vendor_normalized, je.description) AS vendor,
      a.code AS account_code,
      a.name AS account_name,
      COALESCE(a.irs_line, '') AS irs_line,
      SUM(jl.debit) AS amount,
      COALESCE(NULLIF(t.notes, ''), je.description) AS memo
    FROM journal_entries je
    JOIN journal_lines jl ON jl.entry_id = je.id
    JOIN accounts a ON a.id = jl.account_id
    LEFT JOIN transactions t ON t.id = je.source_id
    WHERE je.txn_date >= ? AND je.txn_date <= ?
      AND a.code >= '6000' AND a.code < '7000'
      AND jl.debit > 0
    GROUP BY je.txn_date, vendor, jl.account_id, a.code, a.name, irs_line, memo
    ORDER BY je.txn_date, a.code
  `).all(`${year}-01-01`, `${year}-12-31`);

  let csv = csvRow(['date', 'vendor', 'account_code', 'account_name', 'irs_line', 'amount', 'memo']);
  for (const r of rows) {
    csv += csvRow([
      r.date,
      r.vendor,
      r.account_code,
      r.account_name,
      r.irs_line,
      money(r.amount).toFixed(2),
      r.memo,
    ]);
  }
  return csv;
}

function buildTrialBalanceCsv(year) {
  // Trial balance = sum of debits and credits per account that has any
  // journal_lines in the year. Sum of all debits == sum of all credits
  // (it's a trial balance invariant — verified in smoke test).
  //
  // SCOPE NOTE (per Wren finding D-S1): this is a YEAR-ACTIVITY trial balance,
  // not a CUMULATIVE balance. It sums debits/credits only for journal entries
  // whose txn_date falls within the year. It does NOT include opening balances
  // for asset/liability/equity accounts, so a bank account with prior-year
  // history will show only in-year activity here — not the running balance
  // a bank-statement reconciler would expect. If/when a true balance sheet
  // is built (Phase H), the date filter below needs to change (or join against
  // an opening_balances table) to include prior-year activity.
  const rows = db.prepare(`
    SELECT
      a.code AS account_code,
      a.name AS account_name,
      COALESCE(SUM(jl.debit), 0) AS debits,
      COALESCE(SUM(jl.credit), 0) AS credits
    FROM accounts a
    JOIN journal_lines jl ON jl.account_id = a.id
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE je.txn_date >= ? AND je.txn_date <= ?
    GROUP BY a.id, a.code, a.name
    HAVING debits > 0 OR credits > 0
    ORDER BY a.code
  `).all(`${year}-01-01`, `${year}-12-31`);

  let csv = csvRow(['account_code', 'account_name', 'debits', 'credits']);
  for (const r of rows) {
    csv += csvRow([
      r.account_code,
      r.account_name,
      money(r.debits).toFixed(2),
      money(r.credits).toFixed(2),
    ]);
  }
  return csv;
}

router.get('/schedule-c', (req, res) => {
  try {
    const yearRaw = (req.query.year || '').trim();
    if (!yearRaw) {
      return res.status(400).json({ error: 'year query parameter is required (e.g. ?year=2026)', code: 'VALIDATION_ERROR' });
    }
    if (!/^\d{4}$/.test(yearRaw)) {
      return res.status(400).json({ error: 'year must be a 4-digit year', code: 'VALIDATION_ERROR' });
    }
    const year = parseInt(yearRaw, 10);
    // Range check — don't try to export 0001 or 9999. Reasonable bounds.
    if (year < 1900 || year > 2999) {
      return res.status(400).json({ error: 'year must be between 1900 and 2999', code: 'VALIDATION_ERROR' });
    }

    const incomeCsv = buildIncomeCsv(year);
    const expensesCsv = buildExpensesCsv(year);
    const trialBalanceCsv = buildTrialBalanceCsv(year);

    const today = new Date().toISOString().slice(0, 10);
    const filename = `chantelle-books-${year}-export-${today}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') console.warn('[Books/Reports] archiver warning', err);
      else throw err;
    });
    archive.on('error', (err) => {
      console.error('[Books/Reports] archiver error', err);
      // Headers may already be sent — best we can do is end the response.
      try { res.end(); } catch (_) { /* already ended */ }
    });

    archive.pipe(res);
    archive.append(incomeCsv, { name: 'schedule_c_income.csv' });
    archive.append(expensesCsv, { name: 'schedule_c_expenses.csv' });
    archive.append(trialBalanceCsv, { name: 'trial_balance.csv' });
    archive.finalize();
  } catch (err) {
    console.error('[Books/Reports] schedule-c failed', err);
    // If we haven't sent the zip headers yet, send a JSON 500.
    if (!res.headersSent) {
      res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
    } else {
      try { res.end(); } catch (_) { /* already ended */ }
    }
  }
});

export default router;
