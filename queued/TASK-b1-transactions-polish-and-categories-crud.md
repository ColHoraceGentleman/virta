# TASK — B1: Transactions polish + Categories Management CRUD

**Status:** RESUMING — Cinder B1 round-1 timed out at 1m18s (model timeout, not a real failure). Server-side sort whitelist is already implemented and on disk in working tree (modified `server/routes/books/journal.js` + `server/services/journalService.js`); Cinder round-2 picks up from there.
**Phase:** v2 — combined polish on the Phase 1+2 build (Transactions page) + finishing the Chart of Accounts CRUD that was deferred
**Author:** Rusty (per Patrick's call 2026-07-13 09:48–10:52 MDT)
**Date:** 2026-07-13 11:42 MDT (round 2)
**Branch:** `main` (carry-along with the 14 unpushed commits + 3 uncommitted stub files from 2026-07-09; this build lands on top and we push the whole batch as one)

---

## ⚠️ What's already on disk from Cinder round 1 (read this first)

A previous Cinder attempt started this build and got Part 1c done before the model timed out at 1m18s. The following modifications are **already in the working tree** — uncommitted but ready. Do NOT redo them; build on top:

- `server/routes/books/journal.js` — `GET /entries` now accepts `sort_by` + `sort_dir` query params and passes them to `listEntries()`. Comment header updated.
- `server/services/journalService.js` — `SORTABLE_COLUMNS` whitelist is in place. `listEntries()` resolves `sort_by` against the whitelist, clamps `sort_dir` to asc|desc, builds the `ORDER BY` clause, and falls through to `txn_date DESC, je.id DESC` for invalid input.

**Verify these still work before adding more server code.** Run a quick curl against `http://localhost:3001/api/v1/books/journal/entries?sort_by=name&sort_dir=asc&limit=5` — should return rows sorted by name ascending. Then `?sort_by=invalid` — should fall through to date desc.

**The previous Cinder also:**
- Backed up `data/tasks.db` to `data/tasks.db.backup-b1-1783964463` (1.1MB). Keep this backup.
- Rewrote `client/src/books/{Dashboard,SetupWizard}.jsx` to use a `ComingSoonStub` template from `_stub-template.jsx`. **Rusty reverted Dashboard.jsx and SetupWizard.jsx** because they conflict with B2a (the Setup Wizard page needs to be the wizard, not a "Coming in Phase 1" pill; the Dashboard needs conditional content based on setup state). `Settings.jsx` rewrite is kept — Cinder's honest-stub call is fine there (B6 is months out).
- Created `client/src/books/_stub-template.jsx`. Keep this file; Settings.jsx uses it.

**`git status` will show:** 3 modified files (Settings.jsx, server/routes/books/journal.js, server/services/journalService.js) + 1 new untracked file (_stub-template.jsx).

---

## Goal

Two related changes, both unblocking the next round of the v2 build:

1. **Transactions page polish** — remove the three useless metric tiles, add real pagination (100 per page), make every column sortable, and make the date filter inputs accept flexible entry formats.
2. **Categories Management CRUD** — turn the existing `Categories.jsx` stub into a functional single-page CRUD surface wired to `/api/v1/books/accounts`. This is the "Chart of Accounts" page Patrick flagged at 2026-07-13 10:39 MDT.

This is **not** a wizard build. The wizard pair (Setup Wizard + Categories Wizard) is B2/B3 — separately queued. Categories Management is the **post-wizard** landing surface for the chart of accounts; it must be functional regardless of whether the wizard has been completed.

---

## Background — read these files first

- `docs/books/setup-wizard/VIRTA_BOOKS_V2.md` — umbrella doc.
- `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md` §8 — Categories Management spec (list view, Add modal, Delete flow, Merge flow, Rename flow, Schedule C remap).
- `docs/books/setup-wizard/WIREFRAMES.html` `renderMgmt()` (line ~881) — the wireframe source of truth.
- `client/src/books/Transactions.jsx` — current code; 415 lines. Read this BEFORE writing anything.
- `client/src/books/Categories.jsx` — current stub; ~350 lines. Read this BEFORE writing anything.
- `server/routes/books/accounts.js` — existing REST endpoints. **All five exist already** (GET list, GET one, POST, PATCH, DELETE). You do not need to write new endpoints. You wire to them.
- `server/routes/books/journal.js` — already supports `limit`/`offset` query params on `GET /journal/entries`. You wire to them.
- `client/src/books/api.js` — the API client surface. Add methods if needed (e.g., for the account CRUD that the stub doesn't currently call).
- `~/clawd/projects/process/ENGINEERING.md` §5.9 (build-demo-play gate), §5.10 (user flows first), §5.11 (Build then Demo cadence). **B1 is small enough for one cycle, but the cadence rule applies to the next build.**

---

## Part 1 — Transactions page polish

### 1.1 Remove the three metric tiles

**Delete these tiles entirely** (Patrick's call 2026-07-13 09:55 MDT — they are not useful):
- "Entries this month" — useless; the number of entries in the filtered period is what matters, and that goes in the pagination strip instead.
- "Unbalanced entries" — impossible by design (system prevents unbalanced entries at save-time). The tile is theater.
- "User action needed" — vague; the kinds of prompts that exist belong on the Dashboard, not here.

**Delete:**
- The `<div className="grid grid-cols-3 gap-3 mb-4">` block at lines ~227–231.
- The `useMemo` for `metrics` (lines ~206–217) — no other consumers.
- The `Metric` component at the bottom of the file (lines ~388–394) — no other consumers.
- Update the page subtitle to remove the "{total.toLocaleString()} entries shown" copy (it duplicates the pagination count).

### 1.2 Add pagination (top + bottom)

**Spec:**
- 100 entries per page (Patrick's call).
- Layout, top and bottom of the table, mirroring Patrick's reference screenshot at `~/Downloads/Screenshot 2026-07-13 at 10.07.35 AM.png`:
  ```
  Go to: [  3 ]  of 12          201-300 of 1187         < First   < Previous   Next >   Last >
  ```
- **Go to page** input: number only. On blur or Enter, snap to the nearest valid page (1 ≤ page ≤ totalPages). If user types 0 or negative, snap to 1. If user types > totalPages, snap to totalPages. (Patrick's call 2026-07-13 10:28 MDT — snap, don't error.)
- **First / Previous / Next / Last**: text links (or buttons styled as links). Disabled state when on first/last page — light grey text, no underline, no hover.
- **Row range display**: "X–Y of Z" where X = (page-1)*100 + 1 (or 0 if no rows), Y = min(page*100, Z), Z = total.
- **Sort change → page 1** (Patrick's call 2026-07-13 10:28 MDT). Reason: mid-sort pagination makes results confusing.
- **Filter change → page 1** (existing behavior; preserve).
- **Server pagination**: use the existing `limit=100&offset=N` params on `GET /api/v1/books/journal/entries`. The server already returns `{ data, total, limit, offset }`.
- **Empty state**: when `total === 0`, hide the pagination strip entirely.

### 1.3 Sortable columns (all of them)

**Spec:**
- Every column header is clickable and sortable. **Default: any new column added later is also sortable.** (Patrick's call 2026-07-13 10:28 MDT.)
- Click behavior: first click sorts ascending, second click sorts descending, third click clears sort (returns to default). Standard 3-state cycle.
- Visual indicator: small arrow next to the active sort column (▲ ascending, ▼ descending). Inactive columns get no arrow but show a faint ↕ on hover.
- Default sort: `txn_date DESC` (most recent first). This is the existing behavior; preserve it.
- Sortable columns: `txn_date`, `source`, `name`, `amount` (or `total_debit`), `description`, `category_code`, `matched_code`, `recon_status`. All eight.
- Sort params passed to server: `sort_by=<column>&sort_dir=asc|desc`. Server may not support all eight today — read `server/services/journalService.js` `listEntries()` and extend if needed. **If a column can't be sorted server-side for some reason, sort client-side over the current page and document it.**

### 1.4 Flexible date input

**Spec:**
- Both `From` and `To` date inputs accept the following formats (Patrick's call 2026-07-13 10:39 MDT):
  - `05/08/2026` → `2026-08-05` (US format, M/D/YYYY, 4-digit year)
  - `5/8/26` → `2026-08-05` (2-digit year → 20YY)
  - `05/8/26` → `2026-08-05` (mixed single/double digit month/day, 2-digit year)
  - `5/8` → `2026-08-05` (auto-fill current year; assume US M/D order)
- Validation: invalid formats (e.g., `13/45/2026`, `abc`, empty) leave the input untouched and don't fire a filter. Do not block the user. Do not show an error toast for typing in progress.
- Trigger: parse on **blur** AND on **Enter**. Don't parse on every keystroke (too aggressive — would re-filter the table mid-typing).
- Implementation: a small `<input type="text">` (NOT `type="date"`) with a parse function. After successful parse, display the canonical `YYYY-MM-DD` in the input. (This breaks the native date picker; we accept that for the flexibility win.)
- **Alternatively**, keep `type="date"` for the native picker UX and add a parallel text-input below or above. Patrick's preference is unclear — I'll let you pick whichever is cleaner; recommend a single text input that handles all formats, with a small calendar icon button that opens the native picker if the user wants point-and-click. If too complex, just do the text input.

### 1.5 Files to touch (Part 1)

- `client/src/books/Transactions.jsx` — main edit. Probably 100–200 lines of churn.
- `client/src/books/api.js` — add `sort_by` / `sort_dir` / `limit` / `offset` to `listJournalEntries` call. Probably 10 lines.
- `server/services/journalService.js` — extend `listEntries()` to honor `sort_by` / `sort_dir`. Whitelist allowed sort columns. Probably 20 lines.
- `server/routes/books/journal.js` — pass the new query params through. Probably 5 lines.

---

## Part 2 — Categories Management CRUD

### 2.1 List view wiring

**Replace the `SAMPLE_CATEGORIES` constant with a live API call to `GET /api/v1/books/accounts`.** The stub today (lines ~22–40) hardcodes ~18 rows; those become real data.

- On mount, call `booksApi.listAccounts()` and store in state.
- Loading state: skeleton rows (or a small spinner) while the request is in flight. Don't show "No categories" while loading.
- Error state: red banner with retry button. (Same pattern as the Transactions page.)
- Honor `is_hidden`: hide hidden accounts by default. The "Show hidden" toggle (already in the stub at line ~) shows them.
- Filter chips (already in the stub): "Show All" / "Expenses" / "Income" / "Assets/Liabilities/Equity" — wire to `account_type` server-side filter if cheap, client-side filter otherwise.
- Search bar (already in the stub): wire to name substring search. (Server has no `/accounts?name_q=` endpoint — add it OR filter client-side. **Recommend client-side** for now; the list is small.)

### 2.2 Add account modal

- Reuse the modal pattern from the Transactions page (sticky footer, max-height 90vh).
- Fields:
  - **Code** (4-digit, numeric range 1xxx–9xxx per type, validated client-side)
  - **Name** (free text, required)
  - **Type** (Expense / Income / Asset / Liability / Equity — picker; immutable after creation)
  - **IRS Line** (free text or picker — for now, free text; the Schedule C mapping wireframe is B2/B3 territory)
  - **Note** (free text, optional, internal-only)
- On Save, `POST /api/v1/books/accounts`. Refresh the list on success.
- On error (e.g., code conflict), show inline error under the offending field. Don't toast.

### 2.3 Edit account modal

- Reuse the Add modal in edit mode. Single modal, single component, two states (Patrick's call 2026-07-13 10:28 MDT).
- Fields: same as Add, but **Type is read-only** (immutable after creation per the spec).
- On Save, `PATCH /api/v1/books/accounts/:id`. Refresh the list on success.

### 2.4 Hide / Show toggle

- Per-row button: "Hide" if `!is_hidden`, "Show" if `is_hidden`.
- Click → `PATCH /api/v1/books/accounts/:id` with `{ is_hidden: !current }`.
- Refresh the list. The "Show hidden" toggle is the only way to see hidden rows.

### 2.5 Delete flow (out of scope for B1)

Per the spec §8.3, the Delete flow includes reassignment (move journal entries to another account) and merge candidates. **That's its own Cinder build (B4) — do not include in B1.** The row menu in B1 has Hide and Edit only. Delete is a B4 concern.

### 2.6 Settings → Categories subsection (out of scope)

Out of B1. That's B6.

### 2.7 Files to touch (Part 2)

- `client/src/books/Categories.jsx` — full rewrite. The stub is the starting point; replace static data with API calls, wire the toggle + filter + search, add the Add/Edit modal.
- `client/src/books/AccountFormModal.jsx` (new) — shared Add/Edit modal.
- `client/src/books/api.js` — confirm `listAccounts` exists (it does). Add nothing new unless needed for the hide toggle.

---

## Combined build behavior

| Behavior ID | Name | Verifies |
|---|---|---|
| VB-TXN-PAG-01 | Pagination shows 100 entries per page | ✓ |
| VB-TXN-PAG-02 | Pagination appears at top AND bottom of table | ✓ |
| VB-TXN-PAG-03 | Go-to-page input snaps to nearest valid page (1 ≤ page ≤ totalPages) | ✓ |
| VB-TXN-PAG-04 | First/Prev disabled on page 1; Next/Last disabled on last page | ✓ |
| VB-TXN-PAG-05 | Filter change resets to page 1 | ✓ |
| VB-TXN-SORT-01 | Each column header is sortable (3-state: asc, desc, default) | ✓ |
| VB-TXN-SORT-02 | Active sort column shows ▲ or ▼ indicator | ✓ |
| VB-TXN-SORT-03 | Sort change resets to page 1 | ✓ |
| VB-TXN-DATE-01 | Date input accepts "M/D/YYYY" (US format) | ✓ |
| VB-TXN-DATE-02 | Date input accepts "M/D/YY" (2-digit year → 20YY) | ✓ |
| VB-TXN-DATE-03 | Date input accepts "M/D" (auto-fill current year) | ✓ |
| VB-TXN-DATE-04 | Invalid input leaves field untouched, no filter fires | ✓ |
| VB-TXN-METRIC-01 | The three metric tiles are gone | ✓ |
| VB-CAT-LIST-01 | Categories page loads from `/api/v1/books/accounts`, not hardcoded sample | ✓ |
| VB-CAT-LIST-02 | Hidden accounts hidden by default; "Show hidden" toggle reveals them | ✓ |
| VB-CAT-LIST-03 | Filter chips filter by account_type | ✓ |
| VB-CAT-LIST-04 | Search bar filters by name substring (case-insensitive) | ✓ |
| VB-CAT-ADD-01 | Add modal creates account via POST; list refreshes | ✓ |
| VB-CAT-ADD-02 | Code conflict (UNIQUE) shows inline error | ✓ |
| VB-CAT-EDIT-01 | Edit modal updates account via PATCH; list refreshes | ✓ |
| VB-CAT-EDIT-02 | Type field is read-only in Edit modal | ✓ |
| VB-CAT-HIDE-01 | Hide button toggles is_hidden via PATCH; list refreshes | ✓ |
| VB-CAT-HIDE-02 | Show button (visible only when "Show hidden" is on) restores is_hidden via PATCH | ✓ |

Add the behavior IDs to your **Test coverage** section exactly as above. Rusty folds them into `docs/books/qa/QA.md` after Wren review.

---

## Definition of done

- [ ] All three metric tiles are deleted from Transactions.jsx.
- [ ] Pagination appears at top and bottom, 100 entries per page, with Go-to-page input + First/Prev/Next/Last + row range.
- [ ] Every column in the Transactions table is sortable.
- [ ] Sort change resets to page 1; filter change resets to page 1.
- [ ] Date input accepts all four flexible formats.
- [ ] Categories page loads from API, not hardcoded sample.
- [ ] Add/Edit modal works for accounts (Type read-only on Edit).
- [ ] Hide/Show toggle works.
- [ ] All Test coverage IDs are listed in the report.
- [ ] Demo recorded (`demos/2026.07.13-b1-transactions-and-categories.mp4`). Default: silent 5–10 min walkthrough.
- [ ] Committed in logical chunks. Working tree includes the 14 unpushed commits from 2026-07-09 + the 3 uncommitted stub files (`Dashboard.jsx`, `Settings.jsx`, `SetupWizard.jsx`) — those get folded into a single push with B1.
- [ ] Wren can review and sign off; Echo can run the behavior matrix.

## Don't break

- The existing manual-entry modal (`ManualEntryModal.jsx`) — used by the Transactions page; do not change its props or behavior.
- The audit modal (`AuditModal.jsx`) — same.
- The wireframe smoke (`docs/books/setup-wizard/tests/wf-smoke.mjs`) — must remain 255/255.
- The other v2 stub files (`Dashboard.jsx`, `SetupWizard.jsx`, `Settings.jsx`) — B1 does not touch them. Leave them as-is.
- The v1 archived files in `_archived/` — do not touch.
- Existing REST endpoints on `/api/v1/books/journal/entries` and `/api/v1/books/accounts` — extend, don't break.

## When done

Push a completion event with:
- 2–3 line summary
- Commit hash(es) and branch name (default: `main`)
- The demo path
- Anything you'd flag for Wren's review (especially server-side sort whitelist — confirm all 8 columns are sortable server-side, or note which are client-side)
- Anything in the spec that turned out to be ambiguous or wrong when implemented

## Out of scope

- Setup Wizard (B2)
- Categories Wizard (B3)
- Settings → General (B5)
- Settings → Categories subsection (B6)
- Dashboard polish (B8 / Phase 11)
- Delete-with-reassignment flow on Categories (B4)
- Vendor / Customer / Invoicing / Bills (Phase 3+)
