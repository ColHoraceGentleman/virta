// Virta Books — Phase A + B + C API client
// Thin wrapper around fetch() matching the api.js pattern in the parent app.

const BASE = '/api/v1/books';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  // Some error responses may have non-JSON bodies — guard.
  let json;
  try { json = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }

  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.code = json.code;
    err.status = res.status;
    err.dependents = json.dependents;
    err.invoice_count = json.invoice_count;
    err.payments_count = json.payments_count;
    err.response_data = json.data; // some endpoints (e.g. /test-smtp) put their structured info in `data`
    throw err;
  }
  return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
}

// Multipart upload (used by CSV import).
async function uploadFile(path, formData) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    body: formData, // don't set Content-Type; the browser will set the multipart boundary
  });
  let json;
  try { json = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.code = json.code;
    err.status = res.status;
    throw err;
  }
  return json;
}

export const booksApi = {
  // Accounts
  listAccounts: () => request('GET', '/accounts'),
  getAccount: (id) => request('GET', `/accounts/${id}`),
  createAccount: (data) => request('POST', '/accounts', data),
  updateAccount: (id, data) => request('PATCH', `/accounts/${id}`, data),
  deleteAccount: (id) => request('DELETE', `/accounts/${id}`),
  mergeAccounts: (sourceId, destinationId) =>
    request('POST', '/accounts/merge', { source_id: sourceId, destination_id: destinationId }),

  // Customers
  listCustomers: (q) => request('GET', `/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getCustomer: (id) => request('GET', `/customers/${id}`),
  createCustomer: (data) => request('POST', '/customers', data),
  updateCustomer: (id, data) => request('PATCH', `/customers/${id}`, data),
  deleteCustomer: (id) => request('DELETE', `/customers/${id}`),

  // Invoices
  listInvoices: (status) => request('GET', `/invoices${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  getInvoice: (id) => request('GET', `/invoices/${id}`),
  createInvoice: (data) => request('POST', '/invoices', data),
  updateInvoice: (id, data) => request('PATCH', `/invoices/${id}`, data),
  deleteInvoice: (id) => request('DELETE', `/invoices/${id}`),
  voidInvoice: (id) => request('POST', `/invoices/${id}/void`),
  sendInvoice: (id) => request('POST', `/invoices/${id}/send`),
  applyCustomerTerms: (id) => request('POST', `/invoices/${id}/customer-terms`),
  invoicePdfUrl: (id) => `${BASE}/invoices/${id}/pdf`,

  // Payments
  listPayments: (invoiceId) => request('GET', `/payments${invoiceId ? `?invoice_id=${encodeURIComponent(invoiceId)}` : ''}`),
  createPayment: (data) => request('POST', '/payments', data),
  updatePayment: (id, data) => request('PATCH', `/payments/${id}`, data),
  deletePayment: (id) => request('DELETE', `/payments/${id}`),

  // Settings — Invoices
  getInvoiceSettings: () => request('GET', '/settings/invoices'),
  updateInvoiceSettings: (data) => request('PATCH', '/settings/invoices', data),
  testSmtp: () => request('POST', '/settings/invoices/test-smtp'),

  // Phase C: CSV Imports
  // uploadImport(file) — preview (no inserts).
  // applyImport(file) — upload + apply (insert new, dedupe duplicates).
  uploadImport: (file, opts = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    if (opts.suggested_account_id) fd.append('suggested_account_id', opts.suggested_account_id);
    return uploadFile(`/imports${opts.apply ? '?apply=true' : ''}`, fd);
  },
  applyImport: (file, opts = {}) => booksApi.uploadImport(file, { ...opts, apply: true }),
  applyImportWithMapping: (data) => request('POST', '/imports/apply', data),
  saveMapping: (data) => request('POST', '/imports/save-mapping', data),

  // Phase C: Transactions
  listTransactions: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.account_id) qs.set('account_id', params.account_id);
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    const q = qs.toString();
    return request('GET', `/transactions${q ? `?${q}` : ''}`);
  },
  getTransaction: (id) => request('GET', `/transactions/${id}`),
  updateTransaction: (id, data) => request('PATCH', `/transactions/${id}`, data),
  excludeTransaction: (id) => request('POST', `/transactions/${id}/exclude`),
  restoreTransaction: (id) => request('POST', `/transactions/${id}/restore`),
  bulkCategorize: (data) => request('POST', '/transactions/bulk-categorize', data),
  vendorManualCounts: (vendor) =>
    request('GET', `/transactions/stats/vendor-manual-counts?vendor=${encodeURIComponent(vendor)}`),

  // Phase C-Fix: Near-duplicate resolution
  getNearDuplicate: (id) => request('GET', `/transactions/${id}/near-duplicate`),
  resolveDuplicate: (id, action) => request('POST', `/transactions/${id}/resolve-duplicate`, { action }),

  // Phase C: Vendor Rules
  listVendorRules: () => request('GET', '/vendor-rules'),
  createVendorRule: (data) => request('POST', '/vendor-rules', data),
  updateVendorRule: (id, data) => request('PATCH', `/vendor-rules/${id}`, data),
  deleteVendorRule: (id) => request('DELETE', `/vendor-rules/${id}`),

  // Phase C: CSV Source Mappings
  listSourceMappings: () => request('GET', '/source-mappings'),
  createSourceMapping: (data) => request('POST', '/source-mappings', data),
  updateSourceMapping: (id, data) => request('PATCH', `/source-mappings/${id}`, data),
  deleteSourceMapping: (id) => request('DELETE', `/source-mappings/${id}`),

  // Health (used by dashboard counts)
  health: () => request('GET', '/health'),

  // Phase D: Reports
  arAging: (asOf) =>
    request('GET', `/reports/ar-aging${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ''}`),
  // Schedule C returns a ZIP blob. Caller is expected to download it
  // (window.location.href) — but we expose this for completeness.
  scheduleCUrl: (year) => `${BASE}/reports/schedule-c?year=${encodeURIComponent(year)}`,
};