import { useEffect, useState } from 'react';
import { booksApi } from './api.js';

const EMPTY = {
  name: '', company: '', email: '',
  address_line1: '', address_line2: '',
  city: '', state: '', postal: '', country: '',
  payment_terms: 'Net 30', notes: '',
};

export default function CustomerForm({ navigate, customerId }) {
  const isEdit = !!customerId;
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const c = await booksApi.getCustomer(customerId);
        if (!cancelled) setForm({ ...EMPTY, ...c });
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId, isEdit]);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        // Strip empty strings to null so DB columns stay clean
        company: form.company || null,
        email: form.email || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city: form.city || null,
        state: form.state || null,
        postal: form.postal || null,
        country: form.country || null,
        notes: form.notes || null,
      };
      if (isEdit) {
        await booksApi.updateCustomer(customerId, payload);
      } else {
        await booksApi.createCustomer(payload);
      }
      navigate('/books/customers');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-light tracking-wide text-slate-100 mb-4">
        {isEdit ? 'Edit customer' : 'New customer'}
      </h1>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
        <Field label="Name *" value={form.name} onChange={v => update('name', v)} required />
        <Field label="Company"  value={form.company} onChange={v => update('company', v)} />
        <Field label="Email" type="email" value={form.email} onChange={v => update('email', v)} />

        <div className="border-t border-slate-700 pt-4">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">Address</div>
          <div className="space-y-3">
            <Field label="Address line 1" value={form.address_line1} onChange={v => update('address_line1', v)} />
            <Field label="Address line 2" value={form.address_line2} onChange={v => update('address_line2', v)} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="City"    value={form.city}    onChange={v => update('city', v)} />
              <Field label="State"   value={form.state}   onChange={v => update('state', v)} />
              <Field label="Postal"  value={form.postal}  onChange={v => update('postal', v)} />
              <Field label="Country" value={form.country} onChange={v => update('country', v)} />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-700 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Payment terms" value={form.payment_terms} onChange={v => update('payment_terms', v)} placeholder="Net 30" />
          </div>
        </div>

        <div className="border-t border-slate-700 pt-4">
          <label className="block">
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">Notes</div>
            <textarea
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create customer')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/books/customers')}
            className="px-4 py-2 text-slate-300 hover:text-white text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required, placeholder }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">{label}</div>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
      />
    </label>
  );
}