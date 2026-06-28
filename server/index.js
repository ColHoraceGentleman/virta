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
});