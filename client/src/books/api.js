// Virta Books — Phase A + B API client
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

  // Health (used by dashboard counts)
  health: () => request('GET', '/health'),
};