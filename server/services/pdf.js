// PDF generation service for Virta Books — Phase B.
// Renders an invoice to PDF bytes using @react-pdf/renderer.
// Layout matches Chantelle's Google Sheets template:
//   - Top-left: Invoice #, Issue Date, Due Date (stacked label/value)
//   - Top-right: Bill To (customer name + full address)
//   - No logo, no header business name block
//   - Line items table: Description | QTY | PRICE | TOTAL
//   - Totals area (right-aligned below): Tax (%) + Amount Due
//   - Footer (centered, bottom): business email | social handle
//   - White background, minimal aesthetic, no decorative borders
//
// The PDF is generated server-side; the React-PDF Document runs in Node,
// no DOM needed. We import React explicitly because the package's CommonJS
// entrypoint doesn't auto-resolve JSX in pure-Node setups.

import React from 'react';
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import db from '../db.js';

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  headerLeft: {
    flexDirection: 'column',
    minWidth: 200,
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    maxWidth: 280,
  },
  // Top-left label/value pairs
  labelValueBlock: { marginBottom: 8 },
  label: {
    fontSize: 9,
    color: '#666',
    marginBottom: 2,
  },
  value: {
    fontSize: 11,
    color: '#111',
  },
  bigValue: {
    fontSize: 13,
    color: '#111',
  },
  // Bill To block
  billToLabel: {
    fontSize: 9,
    color: '#666',
    marginBottom: 4,
  },
  billToName: {
    fontSize: 11,
    marginBottom: 2,
  },
  billToLine: {
    fontSize: 10,
    color: '#333',
  },
  // Line items table
  table: {
    marginTop: 20,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    paddingBottom: 4,
    marginBottom: 8,
  },
  tableHeaderText: {
    fontSize: 9,
    color: '#666',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  // 4 columns: Description (flex) | QTY (60) | PRICE (80) | TOTAL (80)
  colDesc: { flex: 1, paddingRight: 8 },
  colQty:  { width: 60, textAlign: 'center' },
  colPrice: { width: 80, textAlign: 'right' },
  colTotal: { width: 80, textAlign: 'center' },
  // Totals
  totalsBlock: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  totalsLabel: {
    width: 80,
    textAlign: 'right',
    color: '#666',
    fontSize: 10,
    marginRight: 8,
  },
  totalsValue: {
    width: 100,
    textAlign: 'right',
    fontSize: 10,
  },
  amountDueRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#111',
  },
  amountDueLabel: {
    width: 80,
    textAlign: 'right',
    color: '#111',
    fontSize: 11,
    marginRight: 8,
  },
  amountDueValue: {
    width: 100,
    textAlign: 'right',
    fontSize: 12,
  },
  // Notes
  notesBlock: {
    marginTop: 30,
    paddingTop: 10,
  },
  notesLabel: {
    fontSize: 9,
    color: '#666',
    marginBottom: 2,
  },
  notesValue: {
    fontSize: 10,
    color: '#333',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 9,
    color: '#666',
  },
});

function fmtCurrency(n) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return `$${v.toFixed(2)}`;
}

function fmtDate(s) {
  if (!s) return '—';
  // Accepts YYYY-MM-DD or ISO; just take the date part and reformat.
  const m = String(s).slice(0, 10).split('-');
  if (m.length !== 3) return s;
  return `${m[1]}/${m[2]}/${m[0]}`;
}

function fmtQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  // Whole numbers render without trailing .00
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function InvoiceDocument({ invoice, customer, lineItems, settings }) {
  const businessEmail = settings?.business_email || 'chantellebaileydesign@gmail.com';
  const socialHandle  = settings?.social_handle  || '@chantellebaileydesign';

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'LETTER', style: styles.page },
      // HEADER: top-left (invoice meta) | top-right (bill to)
      React.createElement(
        View,
        { style: styles.header },
        // Left
        React.createElement(
          View,
          { style: styles.headerLeft },
          React.createElement(
            View,
            { style: styles.labelValueBlock },
            React.createElement(Text, { style: styles.label }, 'Invoice #'),
            React.createElement(Text, { style: styles.bigValue }, invoice.number || ''),
          ),
          React.createElement(
            View,
            { style: styles.labelValueBlock },
            React.createElement(Text, { style: styles.label }, 'Issue Date'),
            React.createElement(Text, { style: styles.value }, fmtDate(invoice.issue_date)),
          ),
          React.createElement(
            View,
            { style: styles.labelValueBlock },
            React.createElement(Text, { style: styles.label }, 'Due Date'),
            React.createElement(Text, { style: styles.value }, fmtDate(invoice.due_date)),
          ),
        ),
        // Right
        React.createElement(
          View,
          { style: styles.headerRight },
          React.createElement(Text, { style: styles.billToLabel }, 'Bill To'),
          React.createElement(Text, { style: styles.billToName }, customer.name || ''),
          customer.company ? React.createElement(Text, { style: styles.billToLine }, customer.company) : null,
          customer.address_line1 ? React.createElement(Text, { style: styles.billToLine }, customer.address_line1) : null,
          customer.address_line2 ? React.createElement(Text, { style: styles.billToLine }, customer.address_line2) : null,
          // City / State / Postal on one line if any present
          (customer.city || customer.state || customer.postal)
            ? React.createElement(
                Text,
                { style: styles.billToLine },
                [customer.city, customer.state].filter(Boolean).join(', ') +
                  (customer.postal ? ` ${customer.postal}` : '')
              )
            : null,
          customer.country ? React.createElement(Text, { style: styles.billToLine }, customer.country) : null,
          customer.email ? React.createElement(Text, { style: styles.billToLine }, customer.email) : null,
        ),
      ),

      // LINE ITEMS TABLE
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableHeader },
          React.createElement(Text, { style: [styles.colDesc, styles.tableHeaderText] }, 'Description'),
          React.createElement(Text, { style: [styles.colQty, styles.tableHeaderText] }, 'QTY'),
          React.createElement(Text, { style: [styles.colPrice, styles.tableHeaderText] }, 'PRICE'),
          React.createElement(Text, { style: [styles.colTotal, styles.tableHeaderText] }, 'TOTAL'),
        ),
        (lineItems || []).map((li, idx) =>
          React.createElement(
            View,
            { style: styles.tableRow, key: li.id || idx },
            React.createElement(Text, { style: styles.colDesc }, li.description || ''),
            React.createElement(Text, { style: styles.colQty }, fmtQty(li.quantity)),
            React.createElement(Text, { style: styles.colPrice }, fmtCurrency(li.unit_price)),
            React.createElement(Text, { style: styles.colTotal }, fmtCurrency(li.amount)),
          )
        ),
      ),

      // TOTALS — right-aligned
      React.createElement(
        View,
        { style: styles.totalsBlock },
        React.createElement(
          View,
          { style: styles.totalsRow },
          React.createElement(Text, { style: styles.totalsLabel }, 'Subtotal'),
          React.createElement(Text, { style: styles.totalsValue }, fmtCurrency(invoice.subtotal)),
        ),
        React.createElement(
          View,
          { style: styles.totalsRow },
          React.createElement(Text, { style: styles.totalsLabel }, `Tax (${Number(invoice.tax || 0).toFixed(1)}%)`),
          React.createElement(Text, { style: styles.totalsValue }, fmtCurrency((Number(invoice.subtotal || 0)) * (Number(invoice.tax || 0) / 100))),
        ),
        React.createElement(
          View,
          { style: styles.amountDueRow },
          React.createElement(Text, { style: styles.amountDueLabel }, 'Amount Due'),
          React.createElement(Text, { style: styles.amountDueValue }, fmtCurrency(invoice.total)),
        ),
      ),

      // NOTES (if any)
      invoice.notes
        ? React.createElement(
            View,
            { style: styles.notesBlock },
            React.createElement(Text, { style: styles.notesLabel }, 'Notes'),
            React.createElement(Text, { style: styles.notesValue }, invoice.notes),
          )
        : null,

      // FOOTER (centered, bottom)
      React.createElement(
        Text,
        { style: styles.footer, fixed: true },
        `${businessEmail}  |  ${socialHandle}`,
      ),
    ),
  );
}

// Public API — renderInvoicePdf(invoiceId) → Promise<Buffer>
export async function renderInvoicePdf(invoiceId) {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customer_id);
  if (!customer) throw new Error('Customer not found');
  const lineItems = db.prepare(`
    SELECT * FROM line_items WHERE invoice_id = ?
    ORDER BY position, created_at
  `).all(invoiceId);
  const settings = db.prepare('SELECT * FROM settings_invoices WHERE id = 1').get();

  const buffer = await renderToBuffer(
    React.createElement(InvoiceDocument, { invoice, customer, lineItems, settings })
  );
  return buffer;
}