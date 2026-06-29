import { useEffect, useState } from 'react';
import { booksApi } from './api.js';

export default function CustomersList({ navigate }) {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    booksApi.listCustomers(q).then(setCustomers).catch(e => setError(e.message)).finally(() => setLoading(false));
  }
  useEffect(load, [q]);

  async function handleDelete(c) {
    if (!confirm(`Delete customer "${c.name}"? This cannot be undone.`)) return;
    setDeleting(c.id);
    try {
      await booksApi.deleteCustomer(c.id);
      load();
    } catch (e) {
      alert(`Failed to delete: ${e.message}`);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-light tracking-wide text-slate-100">Customers</h1>
        <button
          onClick={() => navigate('/books/customers/new')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
        >
          + New customer
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by name, company, or email…"
          className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm">Loading…</div>
      ) : customers.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
          <p className="text-slate-300 mb-1">No customers yet.</p>
          <p className="text-slate-500 text-sm mb-4">Add someone you invoice to get started.</p>
          <button
            onClick={() => navigate('/books/customers/new')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
          >
            + New customer
          </button>
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 border-b border-slate-700 text-slate-400 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Company</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Location</th>
                <th className="px-4 py-2.5">Terms</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {customers.map(c => (
                <tr key={c.id} className="hover:bg-slate-700/30">
                  <td className="px-4 py-2.5 text-slate-100">{c.name}</td>
                  <td className="px-4 py-2.5 text-slate-300">{c.company || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-300">{c.email || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-300">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-300">{c.payment_terms || 'Net 30'}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => navigate(`/books/customers/${c.id}`)}
                      className="text-indigo-400 hover:text-indigo-300 text-xs mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={deleting === c.id}
                      className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50"
                    >
                      {deleting === c.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}