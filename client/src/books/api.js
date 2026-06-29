// Virta Books — Phase A (Foundation) API client
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

  // Health (used by dashboard counts)
  health: () => request('GET', '/health'),
};