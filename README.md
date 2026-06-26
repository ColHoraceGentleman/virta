# Virta

A per-project kanban task manager. Self-hosted, single-user.

🌐 **Live:** https://virta.muckdart.com
📦 **Repo:** https://github.com/ColHoraceGentleman/virta

---

## What it does

- Multiple projects, each with its own kanban board (columns + cards)
- Per-project categories and color/priority pills
- Dark / light mode toggle **per project** (sticky)
- Post-it style card colors
- Tasks have assignees, notes, attachments, categories, priority, due dates
- Reorderable projects, columns, and categories (↑↓ in Settings)
- Default project auto-loads on launch
- Reordering a project to position 0 makes it the default

## Stack

- **Client:** React 18 + Vite + Tailwind CSS
- **Server:** Express + better-sqlite3
- **Storage:** SQLite (single file at `data/tasks.db`)
- **Auth / Edge:** Cloudflare Access + Google OAuth (only `muckdart@gmail.com`)
- **Tunnel:** Cloudflare Tunnel (`virta`, id `e9db7f70-7269-4ef7-b8fc-6869f89e9e99`)
- **Process:** launchd (`com.cloudflare.virta-tunnel`, `ai.openclaw.task-manager`)

## Local development

```bash
npm install
npm run dev          # vite dev server on :5173 (client only — no API)
cd server && node server.js   # API on :3001
```

For local-only mode the client will proxy `/api/*` to `http://127.0.0.1:3001` via `vite.config.js`.

## Production deployment

The server runs as a launchd service:

```bash
launchctl list | grep ai.openclaw.task-manager
# Restart:
launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager
```

After any client code change:

```bash
npm run build   # builds client/dist/
```

## Repo conventions

- **Git root is `task-manager/`** — never run `git` from `~/clawd/`. The parent `~/clawd/.git` is a separate workspace monorepo (legacy) that tracks the broader OpenClaw workspace, including Atreyu. Do not pull Atreyu changes into this repo.
- **`.gitignore` excludes `../.*` paths** as belt-and-suspenders against accidental walks up the tree.
- **Never commit `data/tasks.db`** — runtime state lives on the host, not in the repo.

## Architecture

```
task-manager/
├── client/                 # React app (Vite)
│   ├── src/
│   │   ├── components/     # Modals, board, card, settings
│   │   ├── hooks/          # useTasks (data + state)
│   │   ├── api.js          # thin fetch wrapper
│   │   └── App.jsx
│   └── dist/               # built assets (gitignored)
├── server/                 # Express + SQLite
│   ├── routes/             # projects, tasks, columns, categories, notes, attachments
│   ├── services/           # taskService.js — DB transactions live here
│   ├── db.js               # SQLite + migrations
│   └── server.js
├── data/                   # runtime: tasks.db + attachments/ (gitignored)
├── logs/                   # runtime logs (gitignored)
└── package.json
```

## Schema (high level)

| Table | Purpose |
|---|---|
| `projects` | name, color, darkMode (bool), position (REAL, drag-reorder) |
| `columns` | per-project kanban columns; position; soft-cascade to first remaining column on delete |
| `tasks` | title, description, priority, column_id, category_id, darkMode-aware colors, etc. |
| `categories` | per-project categories with position and color |
| `task_assignees` | many-to-many between tasks and assignees |
| `task_notes` | threaded notes per task |
| `attachments` | file uploads (stored under `data/attachments/<task_id>/`) |

All schema changes are additive `ALTER TABLE` migrations wrapped in `try/catch` in `server/db.js`. Tables are never dropped/recreated.

## Hard rules for contributors

1. **Never delete/recreate tables** — only additive migrations.
2. **Use transactions** for any multi-row write (`createProject`, `deleteColumn` cascades, etc.).
3. **Never expose `data/attachments/` raw paths** — generate server-side, store relative to task.
4. **Auth is handled at the edge** (Cloudflare Access). The server does not implement auth — it trusts the tunnel.
5. **No secrets in the repo.** `.env` is gitignored.