# TASK — Phase 1 + 2 Build: Modal posts to GL, GL gets filter bar + audit log

**Status:** Ready for Cinder (Builder)
**Phase:** v2 combined Phase 1 (Chart of Accounts + manual-entry modal) and Phase 2 (GL architecture)
**Estimated scope:** 8-12 hours of build work
**Author:** Rusty (per Patrick's call 2026-07-09 13:55 MDT — "let's build Phase 1 & 2 (path A)")
**Date:** 2026-07-09 14:25 MDT
**Branch:** TBD (Rusty decides — likely `main` or a feature branch `phase-1-2-build`)

---

## Goal

Build the v2 Chart of Accounts + manual-entry modal + GL architecture into the running Books app. Replace the placeholder `__jeSave` with real code that writes a balanced entry to the GL. Add the GL filter bar (date range, category, name) and the audit log click-to-reveal pattern. The wireframes are design-locked; this task is implementation.

## Background — read these files first

- `docs/books/setup-wizard/VIRTA_BOOKS_V2.md` — the umbrella doc. Sections on Phase 1 and Phase 2 scope.
- `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md` — the spec. D51-D71 lock the chart-of-accounts schema and the modal behavior.
- `docs/books/setup-wizard/WIREFRAMES.html` — the modal HTML and JS, in particular `__openManualEntry` (line ~1025) and the helper functions.
- `docs/books/setup-wizard/FEEDBACK-wireframes-2026-07-09-round27.md` — the latest feedback doc. Has the most recent state.
- `~/clawd/projects/process/ENGINEERING.md` §5.9 — the build → demo → play → decide gate.
- `~/clawd/projects/task-manager/server/db.js` — current DB schema. Look at how `tasks` table is structured (it has a `column_name` field — Virta Tasks reuse).

## Phase 1 — what to build

### Chart of accounts schema (D51-D58)

Per the spec:
- **Account types**: Expense, Income, Asset, Liability, Equity. Immutable once created (`type` cannot be edited after creation).
- **Fields**: code (4-digit, range 1xxx-9xxx per type — 1xxx Asset, 2xxx Liability, 3xxx Equity, 4xxx Income, 5xxx+ Expense), name, tax_line_item (Schedule C mapping), note, type, is_hidden, is_system.
- **No subtypes**. No COGS accounts in v2 (5xxx range reserved but unseeded).
- **No year-end close UI**. The system flows year-end balances to Equity automatically (no user action).
- **System accounts** (e.g., "Review Later" at code 9999) are flagged `is_system: true` and cannot be deleted or renamed via the UI.

### Manual-entry modal (D62-D71)

Build the modal that exists in `WIREFRAMES.html` as a real React component. It captures:

- **Date** (defaults to today, type=date input)
- **Type** (dropdown: Expense / Income / Asset / Liability / Equity — default Expense)
- **Category** (dropdown filtered by Type, accounts from the chart)
- **Name** (free text, optional)
- **Amount** (decimal input, sign convention: positive = picked Category went up; negative = it went down — per D63)
- **Description** (free text, optional, behind + Add X link)
- **Matched with** (dropdown of all accounts, always visible, with Sage-style warning for import-driven accounts per D70)
- **Notes** (free text, optional, internal-only, behind + Add X link)

The "+ Add X" link pattern is from FreshBooks. Description and Note collapse; clicking "+ Add description" reveals them; "remove" link collapses them back.

Save action posts a balanced journal entry (Phase 2 below). Save and new posts + resets + keeps modal open.

### GL table on the Transactions page (D59)

Columns: Date, Type, Name, Amount, Description, Category, Matched with, Status. With sample data showing:
- An Invoice entry (Little Pine Quilt Co., $1200, Pattern licensing)
- A Payment (matching the invoice, $1200, marked reconciled)
- A Bill (Paper Trail Studio, -$86.42, marked in-progress)
- A Journal entry (Owner draw, -$250)

The Status column shows three states: empty / in-progress / reconciled. Icons + colors, exact picks to be made by Cinder but should be distinct and accessible.

## Phase 2 — what to build

### GL posting rules (the hard one)

When the user clicks Save in the modal:
1. **Validate**: Date, Type, Category, Matched with, and Amount are required. Show inline errors if missing. Description and Notes are optional.
2. **Build the journal entry**: 2 rows. Row 1 is the picked Category with the signed Amount. Row 2 is the Matched with account with the inverse signed Amount. This is the double-entry invariant: total debits = total credits, regardless of account type.
3. **Calculate the actual debit/credit** per row based on the account's `normal_balance` (asset/expense: debit-normal; income/liability/equity: credit-normal). The user never sees this calculation. The wireframe's sign convention (positive = picked Account went up) is the user-facing layer; the system converts to debit/credit silently.
4. **Write to GL**: insert into the journal entries table (new schema) and journal entry lines table (new schema). Update the chart-of-accounts balances.
5. **Write an audit row** per D66: `created` with full posting detail (before = nothing, after = the new GL row).

For Asset/Expense, "positive" maps to debit (account went up). For Income/Liability/Equity, "positive" maps to credit. The inverse signed Amount on the Matched with side does the opposite.

Example: user enters "Office Supplies +$50, Matched with Business Checking".
- Office Supplies (Expense, debit-normal): +$50 → debit $50
- Business Checking (Asset, debit-normal): -$50 → credit $50

User enters "I made $1000 in sales".
- Sales (Income, credit-normal): +$1000 → credit $1000
- Accounts Receivable or Cash (Asset, debit-normal): -$1000 → debit $1000

The system knows which account is on which side based on the user's picks, and balances them per the normal-balance rules.

### GL filter bar (D70-MVP per Patrick 2026-07-08 22:45 MDT)

Above the GL table:
- **Date range** — from / to date pickers with presets (This month / Last month / This quarter / This year / All time). Default: This month.
- **Category** — single-select dropdown of all accounts. Filters the table to rows where the Category column matches. (Or the Matched with column — pick one. Suggest: Category is the "what account did this hit" side.)
- **Name** — text search on the Name column. Substring match, case-insensitive.

Filters apply client-side. No server-side filtering in v1.

### Audit log click-to-reveal (D66)

Each row in the GL table has a small "info" or clock icon in a far-right column or hover state. Clicking opens a modal showing:
- "Created by [user] on [date] at [time]"
- The full posting: account, amount, debit/credit, balanced entry
- A diff if the row was edited (v1: most entries won't be edited; the log just shows "created")

Don't over-design this. A simple modal that shows the audit row's metadata is enough for v1.

### Reconciliation status semantics

Three states: empty / in-progress / reconciled. v1 rule:
- **Empty**: default for new entries. Just created, no reconciliation activity yet.
- **In-progress**: a user has manually marked the entry as "needs review" (or there's an open statement period matching the entry). v1: just show the state; don't auto-transition.
- **Reconciled**: a user has explicitly marked the entry as reconciled against a bank statement. (Phase 9 will do automatic reconciliation; v1 is just the user-driven flag.)

Don't build a UI for transitioning states in v1. Just show the state as a small dot or pill in the Status column. The transition logic comes in Phase 9.

## Files to modify / create

### Server

- `server/db.js` — add new tables: `accounts` (chart of accounts), `journal_entries` (header rows), `journal_entry_lines` (the 2-row postings), `audit_log` (per-row audit entries), `account_balances` (running balance per account). Run a migration that seeds the default account chart.
- `server/routes/accounts.js` — CRUD for accounts. List, get, create, update (only name / note / tax_line_item / is_hidden), archive.
- `server/routes/journal.js` (new) — POST `/journal` (create entry), GET `/journal` (list with filters), GET `/journal/:id/audit` (audit log for an entry).
- `server/services/journalService.js` (new) — the posting logic. Takes (date, type, category_id, name, amount, description, matched_with_id, notes), validates, builds the balanced 2-row entry, writes audit row, returns the entry.
- `server/services/balanceService.js` (new) — updates running balances when entries are posted.

### Client

- `client/src/books/TransactionsPage.jsx` (rename from current if needed) — render the GL table with the filter bar.
- `client/src/books/ManualEntryModal.jsx` (new) — the React component for the manual-entry modal. JSX port of the wireframe.
- `client/src/books/AuditModal.jsx` (new) — the click-to-reveal audit modal.
- `client/src/books/hooks/useJournal.js` (new) — data fetching hook for the GL list.
- `client/src/lib/normalBalance.js` (new) — utility: given an account type, return 'debit' or 'credit' (the normal balance).

### Tests

The current smoke test (`docs/books/setup-wizard/tests/wf-smoke.mjs`) is for the wireframe HTML, not the running app. Don't break it.

For the running app, add tests under `client/src/books/__tests__/` or `server/__tests__/` (whichever convention exists):
- `journalService.test.js` — posting logic, sign convention, debit/credit mapping, balanced-entry guarantee
- `accounts.test.js` — account CRUD, validation, immutability of type
- `TransactionsPage.test.jsx` — filter bar, sort, click-to-reveal audit
- Playwright e2e: full manual-entry flow (open modal, fill fields, save, see entry in GL table)

### Don't break

- Existing Phase 1 setup wizard (D1-D50) — account creation flow needs to still work; it now writes to the new `accounts` table instead of whatever was there before. Migration is needed.
- Existing Categories Management UI — the categories list should show accounts from the new table. The data model might change; ensure existing user data migrates.
- The wireframe HTML files — they're separate from the running app and shouldn't be touched by this build. They're design artifacts, not runtime code.

## Definition of done

- [ ] Migration runs cleanly. Existing user data migrates without loss.
- [ ] Manual-entry modal posts to GL via the new journalService. Sign convention works: positive Amount on Category = up; negative = down. Matched with side is the inverse. Balanced entry guarantee verified by tests.
- [ ] GL table shows the new entries with the correct columns and Status pill.
- [ ] GL filter bar (date range, category, name) filters the table client-side.
- [ ] Audit modal opens on row click and shows the audit row's metadata.
- [ ] Sage-style warning fires under Matched with when user picks an import-driven account.
- [ ] Save and new button works: posts, resets form fields, collapses optional fields, keeps modal open.
- [ ] Setup wizard still creates accounts in the new schema. Categories Management reads from the new schema.
- [ ] All existing tests pass; new tests cover the new behavior.
- [ ] Demo recorded (`demos/2026.07.XX-phase-1-2.mp4`).
- [ ] Committed in logical chunks (not one giant commit). Branch is pushable.
- [ ] Wren can review and sign off; Echo can run e2e tests.

## Build pipeline reminder

Cinder builds → Wren reviews → Echo tests → Rusty reviews → demo to Patrick → build → play → decide gate.

Don't skip the gate. The point of building is so Patrick can play with the live app, not just review code.

## When done

Push a completion event with:
- 2-3 line summary
- Commit hash(es) and branch name
- The demo path
- Anything you'd flag for Wren's review
- Anything in the spec that turned out to be ambiguous or wrong when implemented

## Out of scope

- Vendor and Customer records (Phase 3 and Phase 5) — those come after Patrick plays with Phase 1+2
- Invoicing (Phase 4)
- Bank/CC statement upload (Phase 8)
- Reconciliations (Phase 9) — just show the empty/in-progress/reconciled states in v1
- Multi-user / permissions (v3)
- Sales tax (v3)
- Recurring invoices (v3)
- Manual-entry modal layout polish (Phase 7 work) — current modal layout is "functional but ugly" per Patrick; we ship Phase 1+2 against it and clean up later
