import { useEffect, useState } from 'react';
import { booksApi } from './api.js';

export default function SettingsInvoices({ navigate }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [smtpTest, setSmtpTest] = useState(null); // { ok, error?, code? }

  // Form state — mirrors the DB row but with raw string password field.
  const [autoMarkOverdue, setAutoMarkOverdue] = useState(false);
  const [overdueMessage, setOverdueMessage] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [passwordDirty, setPasswordDirty] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    booksApi.getInvoiceSettings()
      .then(s => {
        setSettings(s);
        setAutoMarkOverdue(!!s.auto_mark_overdue);
        setOverdueMessage(s.overdue_message || '');
        setBusinessName(s.business_name || '');
        setBusinessEmail(s.business_email || '');
        setSocialHandle(s.social_handle || '');
        setSmtpHost(s.smtp_host || 'smtp.gmail.com');
        setSmtpPort(s.smtp_port || 587);
        setSmtpUser(s.smtp_user || '');
        setSmtpFromEmail(s.smtp_from_email || '');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSmtpTest(null);
    try {
      const payload = {
        auto_mark_overdue: autoMarkOverdue,
        overdue_message: overdueMessage || null,
        business_name: businessName || null,
        business_email: businessEmail || null,
        social_handle: socialHandle || null,
        smtp_host: smtpHost || null,
        smtp_port: parseInt(smtpPort, 10) || null,
        smtp_user: smtpUser || null,
        smtp_from_email: smtpFromEmail || null,
      };
      if (passwordDirty && smtpPassword) {
        payload.smtp_password = smtpPassword;
      }
      const updated = await booksApi.updateInvoiceSettings(payload);
      setSettings(updated);
      setSmtpPassword('');
      setPasswordDirty(false);
      setSavedAt(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSmtp() {
    setSmtpTest(null);
    try {
      const result = await booksApi.testSmtp();
      setSmtpTest({ ok: true, ...result });
    } catch (e) {
      setSmtpTest({ ok: false, error: e.message, code: e.code });
    }
  }

  if (loading) return <div className="text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-light tracking-wide text-slate-100">Invoice settings</h1>
        <button
          onClick={() => navigate('/books/settings/accounts')}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← All settings
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}
      {savedAt && (
        <div className="bg-emerald-900/30 border border-emerald-700 text-emerald-200 rounded-lg p-3 mb-4 text-sm">
          Saved at {savedAt.toLocaleTimeString()}.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Overdue */}
        <Section title="Overdue" subtitle="Auto-mark invoices past due as overdue.">
          <label className="flex items-center gap-3 mb-4">
            <input
              type="checkbox"
              checked={autoMarkOverdue}
              onChange={e => setAutoMarkOverdue(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-200">Auto-mark overdue (runs daily at 6 AM)</span>
          </label>
          <label className="block">
            <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">
              Overdue notification message
            </div>
            <textarea
              value={overdueMessage}
              onChange={e => setOverdueMessage(e.target.value)}
              rows={4}
              placeholder="This is a friendly reminder that invoice {number} is past due. Thanks!"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <div className="text-xs text-slate-500 mt-1">
              Variables: <code className="text-slate-400">{'{number}'}</code>, <code className="text-slate-400">{'{customer_name}'}</code>, <code className="text-slate-400">{'{amount}'}</code>, <code className="text-slate-400">{'{due_date}'}</code>
            </div>
          </label>
        </Section>

        {/* Business identity */}
        <Section title="Business identity" subtitle="Shown on the PDF footer and in email subjects.">
          <Field label="Business name" value={businessName} onChange={setBusinessName} placeholder="Chantelle Bailey Design" />
          <Field label="Business email" value={businessEmail} onChange={setBusinessEmail} type="email" placeholder="chantellebaileydesign@gmail.com" />
          <Field label="Social handle" value={socialHandle} onChange={setSocialHandle} placeholder="@chantellebaileydesign" />
        </Section>

        {/* Email */}
        <Section title="Email (SMTP)" subtitle="Used to send invoices and overdue notices. Credentials are stored in the macOS Keychain — never in the database.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="SMTP host" value={smtpHost} onChange={setSmtpHost} placeholder="smtp.gmail.com" />
            <Field label="SMTP port" value={smtpPort} onChange={v => setSmtpPort(v)} type="number" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="SMTP user" value={smtpUser} onChange={setSmtpUser} placeholder="chantellebaileydesign@gmail.com" />
            <Field label="From email" value={smtpFromEmail} onChange={setSmtpFromEmail} placeholder="chantellebaileydesign@gmail.com" />
          </div>
          <Field
            label={`App password (Gmail app-specific)${settings?.smtp_password_set ? ' — currently set; leave blank to keep' : ' — not set yet'}`}
            value={smtpPassword}
            onChange={v => { setSmtpPassword(v); setPasswordDirty(true); }}
            type="password"
            placeholder={settings?.smtp_password_set ? '•••••••••• (unchanged)' : 'abcd efgh ijkl mnop'}
          />
          <div className="text-xs text-slate-500 mt-1">
            Stored in macOS Keychain under service <code className="text-slate-400">{settings?.smtp_keychain_service || 'com.virta.books.smtp'}</code>.
            Add via <code className="text-slate-400">Keychain Access → login → search "com.virta.books.smtp"</code> if you need to rotate it manually.
          </div>

          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              onClick={handleTestSmtp}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-xs"
            >
              Test connection
            </button>
            {smtpTest && (
              <div className={`text-xs ${smtpTest.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {smtpTest.ok
                  ? `✓ Connected to ${smtpTest.host}:${smtpTest.port} as ${smtpTest.user}`
                  : `✗ ${smtpTest.error}`}
              </div>
            )}
          </div>
        </Section>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/books/settings/accounts')}
            className="px-4 py-2 text-slate-300 hover:text-white text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="text-sm font-medium text-slate-100 mb-1">{title}</div>
      <div className="text-xs text-slate-400 mb-4">{subtitle}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-slate-400 mb-1.5">{label}</div>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
      />
    </label>
  );
}