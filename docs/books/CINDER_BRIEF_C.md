# Phase C — CSV Import + Categorization

## Objective

Ship the CSV Import Pipeline (§5) and Categorization Review UI (§6) of Virta Books. These are bundled because the importer's output is the categorization UI's input — splitting them is artificial.

**Source of truth:** `~/clawd/projects/accounting-app/ACCOUNTING-v1.md` §5 (lines 331-469) and §6 (lines 471-496). Read those first.

**Mirror of source:** `~/clawd/projects/accounting-app/server/` and `~/clawd/projects/accounting-app/client/` are the canonical authoring directories. The `incremental/*.snippet.md` files are diff-style patches you will generate describing exactly what to apply to `~/clawd/projects/task-manager/server/` and `~/clawd/projects/task-manager/client/` (which is what's actually deployed).

## Context: What's already shipped

- **Phase A — Foundation**: 29-account chart of accounts + customers CRUD. Mirror lives at `server/routes/books/accounts.js`, `server/routes/books/customers.js`, `client/src/books/ChartOfAccounts.jsx`, etc. See `~/clawd/projects/accounting-app/CINDER_REPORT_A.md` for the design calls.
- **Phase B — Invoicing**: invoices, line_items, payments, settings_invoices, overdue cron, PDF render, SMTP send. See `CINDER_REPORT_B.md`. The B-series fixes from Wren's review (B1 shell injection → execFile, B2/B5/S5/S6 transaction wrapping, B3 overdue gating) are already applied — pattern for safe shell calls is in `server/services/email.js`.
- **DB is `~/clawd/projects/task-manager/data/tasks.db`**, single SQLite file. Migrations are appended to `~/clawd/projects/task-manager/server/db.js` and are idempotent (`CREATE TABLE IF NOT EXISTS` + PRAGMA-gated ALTER).
- **Service restart**: `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager` — **NEVER use `openclaw gateway restart`** (different service, will hang UI).
- **DB backup before migration**: `sqlite3 ~/clawd/projects/task-manager/data/tasks.db ".backup '/Users/colonelhoracegentleman/clawd/projects/task-manager/data/backups/tasks-pre-phaseC-$(date +%s).db'"`

## What's in scope for Phase C

### 1. Schema (append to `task-manager/server/db.js`)

- `transactions` (id, account_id, imported_at, txn_date, description, amount, raw_source, raw_csv_row TEXT JSON, dedupe_hash UNIQUE, category_account_id NULL FK→accounts, vendor_normalized, notes, status, created_at, updated_at)
- `vendor_rules` (id, vendor_pattern, category_account_id FK→accounts, match_count, is_active, created_at)
- `csv_source_mappings` (id, source_key, header_signature, date_col, description_col, amount_col, amount_sign_convention CHECK in 'negative_outflow'|'positive_outflow', memorized_account_id NULL FK→accounts, created_at, last_used_at; UNIQUE(source_key, header_signature))
- `journal_entries` (id, txn_date, description, source CHECK in 'transaction_import'|'manual'|'invoice_payment', source_id, created_at)
- `journal_lines` (id, entry_id FK CASCADE, account_id FK→accounts, debit, credit, position)

All five tables + their indexes. Idempotent. Mirror to `~/clawd/projects/accounting-app/server/incremental/db.js.snippet.md` as a Phase C block, in the same format as the Phase A/B snippets.

### 2. Prebuilt parser modules (new directory `~/clawd/projects/accounting-app/server/parsers/`)

Each parser exports two functions:
- `detect(buffer, filename, mimeType) → { matches: bool, source: string, format: 'csv'|'pdf' }`
- `parse(buffer) → Array<{ txn_date, description, amount }>` (canonical `RawTransaction` shape)

Ship these parsers in Phase C:
- `parsers/chase-cc.js` — CSV, header sniff: "Transaction Date" + "Post Date", negative-outflow
- `parsers/amex.js` — CSV, header sniff: "Card Member", negative-outflow
- `parsers/paypal.js` — CSV, header sniff: "TimeZone" + "Status", positive-inflow (`Net` col, fallback `Amount`)
- `parsers/venmo.js` — CSV, header sniff: "Datetime" + "From", positive-inflow
- `parsers/index.js` — exports `PARSERS = [chase, amex, paypal, venmo]` array. Import flow calls `detect()` on each; first match wins. No match + CSV → generic mapping UI. No match + PDF → "unsupported PDF" message to user.

PDF parsers are a future extension point — the `detect()`/`parse()` interface is designed so a PDF parser can be dropped into `PARSERS` without touching the import pipeline. **Do not build any PDF parsers in Phase C** — the architecture just needs to support them cleanly.

### 3. Backend routes (mirror under `~/clawd/projects/accounting-app/server/routes/books/`)

- `imports.js` — multipart upload (`multer`, 5MB cap, 10k row soft cap), accepts `.csv` and `.pdf`. Calls `PARSERS` detect loop. CSV parsing via `papaparse`. header_signature hash, saved-mapping lookup, canonical mapping apply, row → Transaction candidate with dedupe_hash computed.
  - `POST /api/v1/books/imports` — body: `{file, suggested_account_id?}`. Returns `{ source_key, header_signature, suggested_mapping, applied_mapping, candidates: [{row, hash, dedupe_status: 'new'|'duplicate'}], unmapped_count }`. Insert only if `apply=true` query param.
  - `POST /api/v1/books/imports/apply` — body: `{account_id, rows: [...]}`. Wraps Transaction INSERTs + dedupe-hash UNIQUE handling in a single `db.transaction()`. Each new row gets `vendor_normalized` from the strip list (see §5 Vendor normalization). Returns `{inserted: [...], duplicates_skipped: N}`.
- `transactions.js`
  - `GET /api/v1/books/transactions?status=uncategorized&account_id=...&limit=...&offset=...` — list with filters. Virtualized-friendly ordering by `txn_date DESC, id DESC`.
  - `GET /api/v1/books/transactions/:id`
  - `PATCH /api/v1/books/transactions/:id` — update category_account_id, status (uncategorized|categorized|excluded), notes. On `category_account_id` being set, **also create the journal entry** in the same transaction per §5 Categorization side effect (debit expense, credit source asset account from `transactions.account_id`). Set status to `categorized`.
  - `POST /api/v1/books/transactions/:id/exclude` — status='excluded', no journal entry.
  - `POST /api/v1/books/transactions/bulk-categorize` — apply same category to many, with vendor rule prompt trigger (see §6 vendor rules: after 3+ manual categorizations of the same vendor).
- `vendor-rules.js`
  - `GET /api/v1/books/vendor-rules` — list all (active + inactive).
  - `POST /api/v1/books/vendor-rules` — create `{vendor_pattern, category_account_id}`. Increment `match_count` retroactively against uncategorized transactions with matching vendor_normalized, and apply them.
  - `PATCH /api/v1/books/vendor-rules/:id` — toggle is_active, edit pattern or category.
  - `DELETE /api/v1/books/vendor-rules/:id`
- `source-mappings.js`
  - `GET /api/v1/books/source-mappings` — list saved mappings.
  - `POST /api/v1/books/source-mappings` — create/update from import flow ("Save this mapping" checkbox).
  - `PATCH /api/v1/books/source-mappings/:id` — edit (incl. memorized_account_id per R5).
  - `DELETE /api/v1/books/source-mappings/:id`

### 3. Vendor normalization (in `server/services/vendorNormalize.js`)

- Strip list implementation per §5 R2. **Contract**: "no garbage characters in the vendor name." Concrete rules: lowercase, trim, collapse whitespace, strip common prefixes (`PAYPAL *`, `SQ *`, `TST*`, `CARDMEMBER XX-XXXX`, `AMZN MKTP US*`, etc.). Make the list maintainable — put it in a single exported array at the top of the file with a comment that it's implementation-defined. Test with the examples from the spec.
- Pure function: `normalizeVendor(description) → string`. No DB calls.

### 4. Mounts in `task-manager/server/index.js`

Add `importsRouter`, `transactionsRouter`, `vendorRulesRouter`, `sourceMappingsRouter`. Mount under `/api/v1/books/imports`, `/api/v1/books/transactions`, `/api/v1/books/vendor-rules`, `/api/v1/books/source-mappings`. Update the `/api/v1/books/health` endpoint to include transaction/vendor-rule/source-mapping counts and bump `phase: 'C'`. Mirror to `server/incremental/index.js.snippet.md`.

### 5. Frontend (mirror under `~/clawd/projects/accounting-app/client/src/books/`)

- `ImportCSV.jsx` — three-step wizard:
  - Step 1: file upload (drag-drop + click). On drop, sniff headers, POST to `/imports`, show source detection result and the mapping that would be applied.
  - Step 2: mapping review. Dropdowns for date/description/amount columns if any need adjusting. "Save this mapping" checkbox. Source-account picker (suggested + memorized if exists, otherwise dropdown of asset accounts). "Apply" button.
  - Step 3: import summary (inserted: N, duplicates skipped: M, unmapped rows: K). Link to Categorization review.
- `Categorization.jsx` — two-pane review UI per §6. Three tabs on left: Pending (default), Auto-categorized, Excluded. Right pane: account picker + transaction detail.
  - Keyboard shortcuts: `j/k` next/prev, `1-9` top-9 accounts, `Enter` confirm + advance, `r` rule creator, `s` split editor (2 lines max, sum=original), `e` exclude, `?` shortcut overlay.
  - Top-9 default order (do NOT make user-configurable in v1 — just hardcode per §6 confirmation 2026-06-29): 4000, 4010, 6210, 6010, 6200, 6100, 6700, 6800, 6900. Settings panel for top-9 is v2.
  - Vendor rule prompt: after a manual category assignment, if the vendor has 3+ manual categorizations to the same account, show a small inline prompt: "Always categorize [Vendor] as [Account]?" with Yes/No. Yes POSTs to `/vendor-rules`.
  - Auto-categorized rows visible (X2). Single-user, small volume, builds trust.
- `SettingsSourceMappings.jsx` — list + edit/delete saved mappings + change memorized account.
- `SettingsVendorRules.jsx` — list + edit/delete/toggle rules.

- Wire all of the above into `BooksShell.jsx`. Add nav links: "Import CSV", "Categorize", "Settings → Source Mappings", "Settings → Vendor Rules". Use the same dark-mode-aware style as Phase A/B (Tailwind utility classes, no CSS modules).

### 6. Mount in `client/src/App.jsx` (mirror to `client/incremental/App.jsx.snippet.md`)

The BooksShell route already exists; just add the new views as conditional panels inside the BooksShell.

### 7. New dependencies

- Backend: `papaparse` (CSV parser), `pdf-parse` (for future PDF parsers — install now so the dependency is in place; Phase C doesn't use it yet but the `parsers/` directory will need it when the first PDF parser ships). Add both to `package.json`.
- Frontend: none new.

### 8. Mirroring step (mandatory)

All files you create in `~/clawd/projects/accounting-app/server/` and `~/clawd/projects/accounting-app/client/` must ALSO be applied to `~/clawd/projects/task-manager/server/` and `~/clawd/projects/task-manager/client/`. The `incremental/*.snippet.md` files are the source-of-truth patches. After writing the snippets, apply them, build the client, restart the service via `launchctl kickstart -k gui/$(id -u)/ai.openclaw.task-manager`, and confirm `/api/v1/books/health` returns `phase: 'C'` with non-zero transaction/vendor_rule counts (0 is fine; just means no data yet, but the tables exist).

### 9. Tests / verification

- Unit: `vendorNormalize.js` is pure → write a small Node test script (`scripts/test-vendor-normalize.js`) that exercises each strip rule and prints PASS/FAIL. Run it before declaring done.
- Integration smoke test against the live service after restart:
  - Upload a small Chase-format CSV (Chantelle can supply one, or synthesize a 5-row test CSV with `Transaction Date, Post Date, Description, Amount, Type, Balance` header).
  - Verify dedupe: re-upload same file → second import shows duplicates_skipped > 0.
  - Categorize one row → verify journal entry created with correct debit/credit lines.
  - Create a vendor rule → verify it auto-applies to a matching row.
- Document all of this in `CINDER_REPORT_C.md` (same format as A and B).

## Hard rules (re-read before writing code)

1. **All migrations idempotent.** Gate ADD COLUMN behind PRAGMA table_info check. Wrap multi-row inserts in `db.transaction()`.
2. **No DROP, no destructive ALTER.**
3. **DB backup before any migration.** Use sqlite3 `.backup` to `data/backups/`.
4. **Service restart only via safe launchctl path.** Never `openclaw gateway restart`.
5. **Shell calls use `execFile`/`spawnSync` with args array + `shell: false`.** See `server/services/email.js` B1 fix pattern.
6. **No plaintext passwords in DB or env vars.** (Books has no secrets at this phase, but if you add any SMTP/Keychain work, follow the Phase B pattern.)
7. **Match the existing style.** Tailwind utility classes, darkMode-aware via the `darkMode` prop pattern, no new dependencies unless needed (papaparse is the one exception).
8. **Foreign keys ON at the connection level.** Use the existing `db.pragma('foreign_keys = ON')` from db.js (B4 fix).
9. **No regression to existing Virta features.** After restart, hit `/api/health`, `/api/v1/projects`, `/api/v1/categories` — all must return 200.

## Out of scope for Phase C (do NOT build)

- Schedule C CSV Export (§7) — Phase D
- Asset Register (§8) — Phase E
- Profitability Dashboard (§9) — Phase F
- Home Office category UI (§10) — already in seed; UI surfacing is Phase F
- Backup helper (§11) — Phase G
- Refunds visual distinction — v2 (per §5 R4)
- Top-9 customization UI — v2
- Split editor > 2 lines — v2

## Deliverables

When done, write `CINDER_REPORT_C.md` with:
- Summary (what shipped, iteration count, design calls)
- Hard rules checklist
- Files added/modified with line counts
- Snippet patch locations
- Test results (vendor normalize + integration smoke test)
- Any known limitations or followups

Then send a completion event back to the main session. Wren will review next.

---

*Brief prepared 2026-06-30 by Rusty. Source-of-truth for spec: `ACCOUNTING-v1.md`. Mirror for live code: `~/clawd/projects/task-manager/`. Existing review artifacts to be aware of: `WREN_REVIEW_A_B.md`, `CINDER_REPORT_A.md`, `CINDER_REPORT_B.md`.*