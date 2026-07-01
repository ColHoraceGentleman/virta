import { useState, useEffect, useCallback } from 'react';
import Dashboard from './Dashboard.jsx';
import CustomersList from './CustomersList.jsx';
import CustomerForm from './CustomerForm.jsx';
import ChartOfAccounts from './ChartOfAccounts.jsx';
import AccountForm from './AccountForm.jsx';
import MergeAccounts from './MergeAccounts.jsx';
import InvoicesList from './InvoicesList.jsx';
import InvoiceForm from './InvoiceForm.jsx';
import InvoiceView from './InvoiceView.jsx';
import PaymentsIn from './PaymentsIn.jsx';
import SettingsInvoices from './SettingsInvoices.jsx';
import ImportCSV from './ImportCSV.jsx';
import Categorization from './Categorization.jsx';
import SettingsSourceMappings from './SettingsSourceMappings.jsx';
import SettingsVendorRules from './SettingsVendorRules.jsx';
import Reports from './Reports.jsx';
import { booksApi } from './api.js';

// Tiny client-side router. Reads window.location.pathname, listens to popstate.
// Pushes new paths via history.pushState. Avoids a hard reload on nav.
function usePath() {
  const [path, setPath] = useState(
    typeof window !== 'undefined' ? window.location.pathname : '/books'
  );
  useEffect(() => {
    function onPop() { setPath(window.location.pathname); }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to);
      setPath(to);
    }
  }, []);
  return [path, navigate];
}

// Top-level books navigation bar
function BooksNav({ path, navigate }) {
  const dm = true; // single dark theme for now (matches Virta default)
  const link = (to, label, emoji) => {
    const active = path === to || (to !== '/books' && path.startsWith(to));
    return (
      <button
        onClick={() => navigate(to)}
        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
          active
            ? 'bg-indigo-600 text-white'
            : dm ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        {emoji && <span className="mr-1.5">{emoji}</span>}
        {label}
      </button>
    );
  };
  return (
    <div className={`flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900/80 backdrop-blur sticky top-0 z-30`}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/books')}
          className="flex items-center gap-1.5 text-slate-100"
          style={{ fontSize: 17, fontWeight: 300, letterSpacing: '0.28em', textTransform: 'uppercase' }}
        >
          <span style={{ color: '#6366f1', fontWeight: 200, fontSize: 22, lineHeight: 1, marginTop: -2, letterSpacing: 0 }}>~</span>
          <span>VIRTA BOOKS</span>
        </button>
        <div className="w-px h-5 bg-slate-700" />
        {link('/books',                'Dashboard',  '📊')}
        {link('/books/invoices',       'Invoices',   '🧾')}
        {link('/books/payments',       'Payments',   '💵')}
        {link('/books/customers',      'Customers',  '👥')}
        {link('/books/import',         'Import',     '📥')}
        {link('/books/categorize',     'Categorize', '🗂️')}
        {link('/books/reports',        'Reports',    '📈')}
        {link('/books/settings/accounts', 'Settings', '⚙️')}
      </div>
      <div className="text-xs text-slate-400">
        <span className="opacity-60">Phase D · Reports</span>
      </div>
    </div>
  );
}

// Settings submenu — surfaces Phase C settings pages.
function SettingsMenu({ path, navigate }) {
  const dm = true;
  const link = (to, label) => {
    const active = path === to;
    return (
      <button
        onClick={() => navigate(to)}
        className={`px-3 py-1.5 text-sm rounded transition-colors ${
          active
            ? 'bg-slate-700 text-white'
            : dm ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="mb-4 flex flex-wrap gap-2 px-2 py-2 bg-slate-900/50 rounded border border-slate-800">
      <span className="text-xs text-slate-500 px-2 self-center">Settings:</span>
      {link('/books/settings/accounts', 'Chart of Accounts')}
      {link('/books/settings/customers', 'Customers')}
      {link('/books/settings/invoices', 'Invoices')}
      {link('/books/settings/source-mappings', 'Source Mappings')}
      {link('/books/settings/vendor-rules', 'Vendor Rules')}
    </div>
  );
}

// Mounted at /books/* — picks the right page based on path.
export default function BooksShell() {
  const [path, navigate] = usePath();

  // Root redirect: /books → /books/dashboard
  useEffect(() => {
    if (path === '/books' || path === '/books/') {
      navigate('/books/dashboard');
    }
  }, [path, navigate]);

  // Settings pages get a submenu. Detect by path prefix.
  const isSettingsPage = path.startsWith('/books/settings');

  let page;
  if (path === '/books/dashboard' || path === '/books/dashboard/') {
    page = <Dashboard navigate={navigate} />;
  } else if (path === '/books/invoices' || path === '/books/invoices/') {
    page = <InvoicesList navigate={navigate} />;
  } else if (path === '/books/invoices/new') {
    page = <InvoiceForm navigate={navigate} />;
  } else if (path === '/books/payments' || path === '/books/payments/') {
    page = <PaymentsIn navigate={navigate} />;
  } else if (path.startsWith('/books/invoices/') && path.endsWith('/edit')) {
    const id = path.split('/')[3];
    page = <InvoiceForm navigate={navigate} invoiceId={id} />;
  } else if (path.startsWith('/books/invoices/')) {
    const id = path.split('/')[3];
    page = <InvoiceView navigate={navigate} invoiceId={id} />;
  } else if (path === '/books/customers' || path === '/books/customers/') {
    page = <CustomersList navigate={navigate} />;
  } else if (path === '/books/customers/new') {
    page = <CustomerForm navigate={navigate} />;
  } else if (path.startsWith('/books/customers/') && path !== '/books/customers/new') {
    const id = path.split('/')[3];
    page = <CustomerForm navigate={navigate} customerId={id} />;
  } else if (path === '/books/import' || path === '/books/import/') {
    page = <ImportCSV navigate={navigate} />;
  } else if (path === '/books/categorize' || path === '/books/categorize/') {
    page = <Categorization navigate={navigate} />;
  } else if (path === '/books/settings/accounts') {
    page = <ChartOfAccounts navigate={navigate} />;
  } else if (path === '/books/settings/accounts/new') {
    page = <AccountForm navigate={navigate} />;
  } else if (path.startsWith('/books/settings/accounts/') && path !== '/books/settings/accounts/new' && path !== '/books/settings/accounts/merge') {
    const id = path.split('/')[4];
    page = <AccountForm navigate={navigate} accountId={id} />;
  } else if (path === '/books/settings/accounts/merge') {
    page = <MergeAccounts navigate={navigate} />;
  } else if (path === '/books/settings/invoices') {
    page = <SettingsInvoices navigate={navigate} />;
  } else if (path === '/books/settings/source-mappings' || path === '/books/settings/source-mappings/') {
    page = <SettingsSourceMappings navigate={navigate} />;
  } else if (path === '/books/settings/vendor-rules' || path === '/books/settings/vendor-rules/') {
    page = <SettingsVendorRules navigate={navigate} />;
  } else if (path === '/books/reports' || path === '/books/reports/') {
    page = <Reports navigate={navigate} />;
  } else {
    page = (
      <div className="p-8 text-slate-300">
        <h2 className="text-xl mb-2">Not found</h2>
        <p className="text-slate-400 text-sm">No page matches <code>{path}</code>.</p>
        <button
          onClick={() => navigate('/books/dashboard')}
          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100">
      <BooksNav path={path} navigate={navigate} />
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
        {isSettingsPage && <SettingsMenu path={path} navigate={navigate} />}
        {page}
      </main>
    </div>
  );
}