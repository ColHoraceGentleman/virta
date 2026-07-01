import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import projectsRouter from './routes/projects.js';
import columnsRouter from './routes/columns.js';
import tasksRouter from './routes/tasks.js';
import notesRouter from './routes/notes.js';
import calendarRouter from './routes/calendar.js';
import eventsRouter from './routes/events.js';
import gmailRouter from './routes/gmail.js';
import categoriesRouter from './routes/categories.js';
import attachmentsRouter from './routes/attachments.js';
import subtasksRouter from './routes/subtasks.js';
import booksAccountsRouter from './routes/books/accounts.js';
import booksCustomersRouter from './routes/books/customers.js';
import booksInvoicesRouter from './routes/books/invoices.js';
import booksPaymentsRouter from './routes/books/payments.js';
import booksInvoiceSettingsRouter from './routes/books/settings/invoices.js';
import booksImportsRouter from './routes/books/imports.js';
import booksTransactionsRouter from './routes/books/transactions.js';
import booksVendorRulesRouter from './routes/books/vendor-rules.js';
import booksSourceMappingsRouter from './routes/books/source-mappings.js';
import booksReportsRouter from './routes/books/reports.js';
import db from './db.js';
import { startOverdueCron } from './services/overdueCron.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: isProduction ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: false
}));
app.use(express.json());

// API Routes
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/columns', columnsRouter);
app.use('/api/v1/tasks', tasksRouter);
app.use('/api/v1/notes', notesRouter);
app.use('/api/v1/calendar', calendarRouter);
app.use('/api/v1/events', eventsRouter);

app.use('/api/v1/gmail', gmailRouter);
app.use('/api/v1/categories', categoriesRouter);
app.use('/api/v1/attachments', attachmentsRouter);

// Subtasks router carries both /tasks/:taskId/subtasks and /subtasks/:id paths
// (each route is declared in full inside the router), so mount at root.
app.use('/api/v1', subtasksRouter);

// Virta Books — Phase A (Foundation) + Phase B (Invoicing) + Phase C (Import + Categorization)
// Mounted at /api/v1/books/* so future phases can land alongside without colliding
// with task-manager routes.
app.use('/api/v1/books/accounts', booksAccountsRouter);
app.use('/api/v1/books/customers', booksCustomersRouter);
app.use('/api/v1/books/invoices', booksInvoicesRouter);
app.use('/api/v1/books/payments', booksPaymentsRouter);
app.use('/api/v1/books/settings/invoices', booksInvoiceSettingsRouter);
app.use('/api/v1/books/imports', booksImportsRouter);
app.use('/api/v1/books/transactions', booksTransactionsRouter);
app.use('/api/v1/books/vendor-rules', booksVendorRulesRouter);
app.use('/api/v1/books/source-mappings', booksSourceMappingsRouter);
app.use('/api/v1/books/reports', booksReportsRouter);

// Health check for books
app.get('/api/v1/books/health', (req, res) => {
  const accountCount = db.prepare('SELECT COUNT(*) as c FROM accounts').get().c;
  const customerCount = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  const invoiceCount = db.prepare('SELECT COUNT(*) as c FROM invoices').get().c;
  const transactionCount = db.prepare('SELECT COUNT(*) as c FROM transactions').get().c;
  const vendorRuleCount = db.prepare('SELECT COUNT(*) as c FROM vendor_rules').get().c;
  const sourceMappingCount = db.prepare('SELECT COUNT(*) as c FROM csv_source_mappings').get().c;
  res.json({
    status: 'ok',
    phase: 'D',
    accounts: accountCount,
    customers: customerCount,
    invoices: invoiceCount,
    transactions: transactionCount,
    vendor_rules: vendorRuleCount,
    source_mappings: sourceMappingCount,
    timestamp: new Date().toISOString(),
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (isProduction) {
  const clientDist = join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' });
});

app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Mode: ${isProduction ? 'production' : 'development'}`);
  // Virta Books — Phase B: start the overdue cron inside this same process.
  startOverdueCron();
});