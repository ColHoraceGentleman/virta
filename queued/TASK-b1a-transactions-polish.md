# TASK — B1a: Transactions polish only

**Status:** RESUMING — B1 round 1 and round 2 both hit model timeouts. Splitting per §5.11 cadence rule. Server-side sort whitelist is already implemented and on disk.
**Phase:** v2 — Transactions page polish (subset of original B1)
**Author:** Rusty (per Patrick's call 2026-07-13 09:55 MDT)
**Date:** 2026-07-13 13:26 MDT
**Branch:** `main`

---

## Why this is a separate build

The original B1 brief was too big for a single Cinder round. Two consecutive model timeouts (1m18s and 2m21s) at this scope. Splitting into B1a (this build) and B1b (Categories CRUD, separate brief) per ENGINEERING.md §5.11 — short cycles prevent drift and reduce blast radius.

---

## ⚠️ What's already on disk from B1 round 1

A previous Cinder attempt got the server-side work done before the model timed out. Verify before adding code:

- `server/routes/books/journal.js` — `GET /entries` accepts `sort_by` + `sort_dir` query params. Comment header updated.
- `server/services/journalService.js` — `SORTABLE_COLUMNS` whitelist in place. `listEntries()` resolves `sort_by` against the whitelist, clamps `sort_dir` to asc|desc, builds the ORDER BY clause, falls through to `txn_date DESC, je.id DESC` for invalid input.

**Verify these still work** before doing anything else:

```bash
curl -s "http://localhost:3001/api/v1/books/journal/entries?sort_by=name&sort_dir=asc&limit=3" | python3 -c "import sys, json; d=json.load(sys.stdin); print([r.get('name') for r in d.get('data',[])])"
```

Should print 3 names in ascending alphabetical order. If they come back in date-desc order, the server-side whitelist isn't actually being used — debug before continuing.

Also untouched but currently modified (keep as-is):
- `client/src/books/Settings.jsx` — uses ComingSoonStub template from `_stub-template.jsx`. Don't touch.
- `client/src/books/_stub-template.jsx` — the template. Don't touch.

DB backup exists: `data/tasks.db.backup-b1-1783964463`. Keep it.

---

## Scope of THIS build (B1a only)

Only the **Transactions page** polish. Categories Management CRUD is **B1b** — separate build, separate spawn. Do not touch Categories.jsx, do not create AccountFormModal.

### 1. Remove the three metric tiles

Delete from `client/src/books/Transactions.jsx`:

- The `<div className="grid grid-cols-3 gap-3 mb-4">` block at lines ~227-231 with three `<Metric>` instances.
- The `useMemo` for `metrics` (lines ~206-217).
- The `Metric` component at the bottom of the file (lines ~388-394).
- Update the page subtitle to remove "{total.toLocaleString()} entries shown" copy (the pagination strip will show the count).

Patrick's reasoning (2026-07-13 09:55 MDT):
- "Entries this month" is useless — the filtered-period count is what matters, and that's in the pagination strip.
- "Unbalanced entries" is theater — the system prevents unbalanced entries at save-time.
- "User action needed" is vague — prompts belong on the Dashboard, not here.

### 2. Add pagination (top + bottom)

Reference: Patrick's screenshot at `~/Downloads/Screenshot 2026-07-13 at 10.07.35 AM.png`. Layout:

```
Go to: [  3 ]  of 12          201-300 of 1187         < First   < Previous   Next >   Last >
```

- 100 entries per page (Patrick's call).
- Appears at top AND bottom of the table.
- **Go to page** input: number only. On blur or Enter, snap to nearest valid page (1 ≤ page ≤ totalPages). Type 0/negative → snap to 1. Type > totalPages → snap to totalPages. (Patrick's call 2026-07-13 10:28 MDT — snap, don't error.)
- **First / Previous / Next / Last**: text buttons. Disabled state on first/last page — light grey, no underline, no hover.
- **Row range display**: "X–Y of Z" where X = (page-1)*100 + 1 (or 0 if no rows), Y = min(page*100, Z), Z = total.
- **Sort change → page 1** (Patrick's call).
- **Filter change → page 1** (existing behavior; preserve).
- **Server pagination**: use existing `limit=100&offset=N` params on `GET /api/v1/books/journal/entries`. Server already returns `{ data, total, limit, offset }`.
- **Empty state**: when `total === 0`, hide pagination strip entirely.

### 3. Sortable columns (all of them)

- Every column header clickable, sortable. **Default: any new column added later is also sortable.** (Patrick's call.)
- Click behavior: first click asc, second desc, third clears sort (returns to default). 3-state cycle.
- Visual: ▲ asc, ▼ desc on active column. Inactive columns show faint ↕ on hover.
- Default sort: `txn_date DESC` (existing behavior; preserve).
- Sortable columns: `txn_date`, `source`, `name`, `amount`, `description`, `category_code`, `matched_code`, `recon_status`. All 8.
- Server params: `sort_by=<column>&sort_dir=asc|desc`. Server already supports all 8.

### 4. Flexible date input

Both `From` and `To` date inputs accept:

- `05/08/2026` → `2026-08-05` (US M/D/YYYY)
- `5/8/26` → `2026-08-05` (2-digit year → 20YY)
- `05/8/26` → `2026-08-05` (mixed single/double digit)
- `5/8` → `2026-08-05` (auto-fill current year; assume US M/D order)

- Invalid formats: leave field untouched, don't fire filter. No error toast.
- Trigger: parse on **blur** AND on **Enter**.
- Implementation: `<input type="text">` (NOT `type="date"`). After parse, display canonical `YYYY-MM-DD`.
- Optional polish: small calendar icon button that opens the native picker if user wants point-and-click. Skip if too complex.

### 5. Files to touch (B1a only)

- `client/src/books/Transactions.jsx` — main edit. ~200 lines of churn.
- `client/src/books/api.js` — confirm `sort_by` / `sort_dir` / `limit` / `offset` params are sent. Probably 5-10 lines.
- `server/services/journalService.js` — already has SORTABLE_COLUMNS; no changes needed unless bug found in verification.
- `server/routes/books/journal.js` — already passes new params through; no changes needed unless bug found.

---

## Build behaviors (Test coverage)

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
| VB-TXN-SORT-API-01 | Server-side sort whitelist works for all 8 columns | ✓ |

Add these IDs to your **Test coverage** section in `CINDER_REPORT_b1a.md`.

---

## Definition of done

- [ ] Verified server-side sort works via curl before touching UI.
- [ ] All three metric tiles deleted from Transactions.jsx.
- [ ] Pagination appears at top and bottom, 100 entries per page, with all controls.
- [ ] Every column is sortable with 3-state cycle.
- [ ] Date input accepts all four flexible formats.
- [ ] Sort change resets to page 1; filter change resets to page 1.
- [ ] All 14 behavior IDs in Test coverage section.
- [ ] Demo recorded: `demos/2026.07.13-b1a-transactions-polish.mp4` (silent 5-8 min walkthrough).
- [ ] Committed in logical chunks.
- [ ] Wren can review; Echo can run behavior matrix.
- [ ] Light + dark mode visual check.

## Don't break

- The manual-entry modal (`ManualEntryModal.jsx`).
- The audit modal (`AuditModal.jsx`).
- The wireframe smoke test (must remain 255/255).
- `Categories.jsx`, `Settings.jsx`, `SetupWizard.jsx`, `Dashboard.jsx`, `_stub-template.jsx`.
- Existing REST endpoints.
- The `data/tasks.db.backup-b1-1783964463` backup file.

## When done

Push a completion event with:
- 2-3 line summary
- Commit hash(es) — local only
- Demo path
- Anything to flag for Wren
- Any judgement calls you made that weren't in this brief
- Any out-of-scope findings

## Hard rules

- `trash` > `rm`.
- No edits to anything outside the 3 files listed in section 5.
- No edits to `_archived/` v1 files.
- No edits to wireframe HTML, spec, or smoke test.
- No pushing to origin.
- No sub-agent spawns.
- Visual check in dark mode before declaring done.

---

## Why this is a focused build

The original B1 brief covered Transactions polish + Categories CRUD + new AccountFormModal. That's ~600 lines of new code. Two Cinder rounds at this scope hit model timeouts.

**B1a (this build):** ~200 lines of churn in Transactions.jsx only. Small, focused, should fit in one Cinder round comfortably.

**B1b (separate build, separate brief):** Categories CRUD + AccountFormModal. Will spawn after B1a Wren sign-off.

If you finish this in <2 min and have time left, **stop and report done**. Don't start B1b scope. The pipeline is: B1a demo → Wren → Echo → demo to Patrick → B1b brief → B1b Cinder → demo → Wren → Echo → demo. Don't skip steps.
