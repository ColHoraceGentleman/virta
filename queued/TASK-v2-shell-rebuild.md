# TASK — Virta Books v2 Shell Rebuild (greenfield, wireframe-only nav)

**Status:** Ready for Cinder (Builder) — queue after Phase 1+2 build ships through QA
**Estimated scope:** 4-6 hours of build work
**Author:** Rusty (per Patrick's call 2026-07-09 15:48 MDT)
**Date:** 2026-07-09 15:50 MDT
**Branch:** TBD (Rusty decides)

---

## Goal

Replace the v1 `BooksShell.jsx` (which currently surfaces 9 routes: Dashboard / Invoices / Payments / Customers / Import / Categorize / Transactions / Reconcile / Reports / Settings) with a v2 shell that surfaces only the 5 surfaces the wireframes actually designed.

Patrick's call: *"Can we build it new from scratch with just the v2 stuff from the wireframes?"* — i.e., greenfield, no v1 carryover.

## What to build

### The 5 v2 surfaces

| Surface | Route | Wireframe reference | Build state |
|---|---|---|---|
| **Dashboard** | `/books` (default landing) | `WIREFRAMES.html` `renderDashboard()` (line 1376) | NOT BUILT — render a stub |
| **Setup Wizard** | `/books/setup` | `WIREFRAMES.html` `renderSetup()` (line 313) | NOT BUILT — render a stub |
| **Categories** | `/books/categories` (Categories Management single-page) | Inside `state.screen === 'cats'` branches | NOT BUILT — render a stub |
| **Transactions** | `/books/transactions` | `WIREFRAMES.html` `renderLedger()` (line 1389) — built and shipped in commit `2f48417`, fixed in `2a97193` | **BUILT — keep as-is** |
| **Settings** | `/books/settings` | `WIREFRAMES.html` `renderSettings()` (line 1422) | NOT BUILT — render a stub |

### Stub pages (4 of the 5)

For Dashboard, Setup Wizard, Categories, and Settings — render a **wireframe-accurate stub** that:

- Uses the same layout, colors, fonts as the corresponding `renderX()` function in `WIREFRAMES.html`
- Shows the **same content** the wireframe has (e.g., Dashboard shows the welcome message, the "X transactions this week" stat card, the "next steps" widget with "Run setup wizard" / "Customize categories" / "Connect bank" links)
- Has a small gray pill at the top: **"Available in [Phase N]"** so it's clear this is a stub
- The pill is the only deviation from the wireframe — everything else matches

**Do NOT** copy the wireframe HTML literally. The wireframes are single-file JS strings; the live app is React components. Re-implement the same layout, fields, and copy as React components using the wireframe as visual reference. The smoke test (`docs/books/setup-wizard/tests/wf-smoke.mjs`) tests the wireframe HTML and should still pass — don't break it.

**Stub page phases** (per the v2 phase roadmap at the top of `VIRTA_BOOKS_V2.md`):

- **Dashboard** — Phase 11 in the roadmap. Patrick can play with it as a placeholder until then.
- **Setup Wizard** — design is locked (rounds 1-14). Will be built as part of Phase 1 if/when Patrick wants it implemented.
- **Categories** — design is locked (rounds 1-14, single-page Categories Management with search + filters). Same as Setup Wizard.
- **Settings** — design is locked (round 5: 3 tabs General / Categories / Other). Same as Setup Wizard.

### The new `BooksShell.jsx`

Replace the entire current file with a v2 shell:

```
┌──────────────────────────┐
│ VIRTA BOOKS              │  (logo + name, top of left rail)
├──────────────────────────┤
│ 📊 Dashboard            │  (default landing)
│ 🧙 Setup Wizard         │
│ 🗂️  Categories          │
│ 📒 Transactions         │
│ ⚙️  Settings            │
└──────────────────────────┘
```

Top of shell: small version pill at the bottom — same as today ("Phase 2 · GL + Manual Entry") but updated to reflect the rebuild.

### Settings submenu

The current Settings submenu has 4 sub-routes (Accounts / Customers / Invoices / Source Mappings). For v2, simplify to: General / Categories / Other (the three tabs from the wireframe round 5). All three are stubs. No Customers / Invoices / Source Mappings in v2.

## Files to modify / create

### Server
None. This is a pure UI rebuild — the API surface stays as-is.

### Client

- `client/src/books/BooksShell.jsx` — **replace** with the v2 shell (5-link left rail + Settings submenu).
- `client/src/books/Dashboard.jsx` — **new**. Stub page matching wireframe `renderDashboard()`.
- `client/src/books/SetupWizard.jsx` — **new**. Stub page matching wireframe `renderSetup()`.
- `client/src/books/Categories.jsx` — **new**. Stub page matching wireframe's Categories Management single-page view (search + 4 filter chips + Show hidden).
- `client/src/books/Settings.jsx` — **new**. Stub page matching wireframe `renderSettings()` (3 tabs).
- `client/src/books/Transactions.jsx` — **keep as-is** (built and shipped in commits `2f48417` + `2a97193`).
- `client/src/books/ManualEntryModal.jsx` — **keep as-is** (built in Phase 1+2).
- `client/src/books/BooksShell.jsx` — delete the unused `SettingsMenu` references to v1-only routes (`/books/settings/customers`, `/books/settings/invoices`, `/books/settings/source-mappings`, `/books/settings/vendor-rules`).

### Delete (or archive)

The following v1 components are no longer reachable from the v2 shell. Delete them or move them to `client/src/books/_archived/`:

- `client/src/books/InvoicesList.jsx`
- `client/src/books/InvoiceForm.jsx`
- `client/src/books/InvoiceView.jsx`
- `client/src/books/PaymentsIn.jsx`
- `client/src/books/CustomersList.jsx` (will be replaced by v2 in Phase 3)
- `client/src/books/CustomerForm.jsx` (will be replaced by v2 in Phase 3)
- `client/src/books/ImportCSV.jsx`
- `client/src/books/Categorization.jsx`
- `client/src/books/Reconcile.jsx`
- `client/src/books/Reports.jsx`
- `client/src/books/MergeAccounts.jsx`
- `client/src/books/SettingsInvoices.jsx`
- `client/src/books/SettingsSourceMappings.jsx`
- `client/src/books/SettingsVendorRules.jsx`

If you're cautious, archive them to `_archived/` rather than delete. **Don't** break any of them if they're imported elsewhere — grep for imports first.

### Wireframe

- `docs/books/setup-wizard/WIREFRAMES.html` — **do not modify**. The wireframe is the source of truth for what the v2 design looks like. Your job is to match it, not change it.
- `docs/books/setup-wizard/tests/wf-smoke.mjs` — **do not break**. Smoke must stay 255/255.

## What to wire up

In `BooksShell.jsx`'s route switch:

```js
if (path === '/books' || path === '/books/') return <Dashboard navigate={navigate} />;
if (path === '/books/setup') return <SetupWizard navigate={navigate} />;
if (path === '/books/categories') return <Categories navigate={navigate} />;
if (path === '/books/transactions') return <Transactions navigate={navigate} />;
if (path === '/books/settings' || path.startsWith('/books/settings/')) return <Settings navigate={navigate} />;
```

Unknown `/books/*` paths should show a friendly "Coming soon" stub, not 404.

## Definition of done

- [ ] Old `BooksShell.jsx` replaced with v2 shell (5-link left rail)
- [ ] Dashboard, Setup Wizard, Categories, Settings stubs created and reachable
- [ ] Transactions page still works (built in commits `2f48417` + `2a97193`)
- [ ] Settings submenu simplified to General / Categories / Other (3 stubs)
- [ ] Unknown `/books/*` routes show "Coming soon" instead of breaking
- [ ] v1 routes that are no longer linked from the shell either deleted or moved to `_archived/`
- [ ] Wireframe smoke still passes (255/255)
- [ ] Manual entry modal flow still works end-to-end (verify by clicking Transactions → New entry → save)
- [ ] Manual snapshot of the new shell saved to `demos/2026.07.XX-v2-shell-rebuild.png` (use the same headless Chrome pattern that produced `2026.07.09-phase-1-2-build-poster.png`)
- [ ] Single commit on `main` (or feature branch, Rusty decides)

## When done

Push a completion event with:
- 2-3 line summary
- The commit hash
- The snapshot PNG path
- Anything that came up that wasn't in the spec (especially around the v1 deletion/archival — what you kept vs. what you moved)
- Anything for Wren to scrutinize

## Out of scope

- Building the actual Setup Wizard / Categories / Dashboard / Settings (those are separate phase builds)
- Phase 3 (Customer records) — separate TASK.md already queued
- Any v2 visual design overhaul (Direction B: Settled Library) — separate future round
- Manual-entry modal layout polish (Phase 7) — separate future round
- Auth (the entire books API is unauthenticated by design in v1; that's pre-existing)
## Current State (post-build)

**Status:** Complete. All Definition-of-Done items met.

### Summary

Replaced v1 `BooksShell.jsx` (9-link top nav) with a v2 left-rail shell that surfaces only the 5 wireframe surfaces. Created 4 stub pages (Dashboard, Setup Wizard, Categories, Settings) with wireframe-accurate layouts + a phase pill. Transactions (built in `2f48417`, fixed in `2a97193`) is unmodified. v1 components archived to `client/src/books/_archived/`.

### Files

**Modified:**
- `client/src/books/BooksShell.jsx` — replaced with v2 shell (5-link left rail, Settings submenu, Coming-soon fallback)
- `client/src/books/Dashboard.jsx` — replaced (wireframe renderDashboard layout, "Available in Phase 11" pill)

**Created:**
- `client/src/books/SetupWizard.jsx` — stub (`renderSetup` step 1 chrome + wizard step list, "Coming in Phase 1" pill)
- `client/src/books/Categories.jsx` — stub (`renderMgmt` chrome: search + 4 chips + Show hidden + empty-state table, "Coming in Phase 1" pill)
- `client/src/books/Settings.jsx` — stub (`renderSettings` 3 tabs: General / Categories / Other, "Coming in Phase 1" pill)
- `client/src/books/_archived/` — 17 v1 components moved here (no longer linked from shell, none imported elsewhere)
- `demos/snap-v2-shell.mjs` — Playwright verification harness
- `demos/2026.07.09-v2-shell-rebuild.png` — snapshot
- `demos/2026.07.09-v2-shell-rebuild-verification.md` — 30/30 checks-pass checklist

**Unchanged (built earlier):**
- `client/src/books/Transactions.jsx`
- `client/src/books/ManualEntryModal.jsx`
- `client/src/books/api.js`

### v1 archival decisions

Moved **17 files** to `client/src/books/_archived/` rather than deleting (cautious path). Grep confirmed zero remaining imports anywhere in the project. Three files were NOT in Rusty's deletion list but were unreachable in v2 — they were archived for the same reason:
- `ChartOfAccounts.jsx` (was reachable via `/books/settings/accounts` in v1)
- `AccountForm.jsx` (was reachable via `/books/settings/accounts/new` and `/accounts/:id` in v1)
- `TransactionEditor.jsx` (was reachable via `Reconcile.jsx`'s import — also archived since Reconcile itself was deleted)

The `.bak-1783207804` file was also archived.

### Verification results

- **Wireframe smoke:** 255/255 (unchanged)
- **Manual entry:** Verified end-to-end (Save → row appears in GL: 39 → 40 rows)
- **No console / page errors:** 0 / 0
- **No v1 nav link leaks:** 0
- **5-link left rail present:** all 5 surfaces
- **Settings submenu simplified to General / Categories / Other:** verified (no v1 Chart of Accounts / Vendor Rules / Source Mappings)

## Hand-off Notes for Wren

- **Layout choice:** Moved from v1's top tab bar to a **left rail**. Reasons: (1) the wireframes (`WIREFRAMES.html` sidebar) lean vertical, (2) the v2 Settings submenu is more discoverable as inline tabs vs. hiding under a drop-down, (3) leaves room for Direction B (Settled Library) without redoing tab bar chrome.
- **Dashboard "X transactions this week" stat card:** Rusty's TASK mentioned it ("Dashboard shows the ... 'X transactions this week' stat card, the 'next steps' widget"). The wireframe's `renderDashboard()` does NOT show a stat card — it only shows welcome + 3 quick links + infobox. I matched the wireframe as the source of truth (per spec). If Patrick wants the stat card added now, that's a quick add: fetch `booksApi.listJournalEntries({ limit: 1 }).total` and render a small metric above the welcome card. Flag for review.
- **Stub pill placement:** Top-of-card pill (above the wireframe's box), matching the wireframe's own pill vocabulary ("Selected", "Available in a future version"). Distinct enough from a real wireframe element that no one will mistake it for the build.
- **Settings sub-tab routing:** Tab URLs are shareable — `/books/settings/general`, `/books/settings/categories`, `/books/settings/other`. Bare `/books/settings` redirects to General. Unknown `/books/settings/*` paths (e.g. `/books/settings/accounts`) hit the Settings page with General tab defaulted (instead of the generic Coming-soon stub), so old bookmarks don't 404.
- **"Coming soon" stub** is wired for unknown `/books/*` paths but not for `/books/settings/<unknown>` (those redirect into Settings via the prefix-match). That's a deliberate decision — see the comment in `BooksShell.jsx`.
- **Why archived vs deleted:** Cautious path per spec. None of the archived files have remaining imports; re-introduction in a future phase just requires `mv _archived/X.jsx . && re-add import in BooksShell.jsx`.
- **Pre-existing TodaySidebar.jsx modification:** Was already modified before this work started (per initial `git status`); not touched.
- **Branch:** Committed on `main` per Rusty's TASK ("Single commit on main (or feature branch, Rusty decides)").

### Items for Wren scrutiny

1. **Left rail vs top tab bar** — aesthetic decision; both work. Confirm preferred pattern.
2. **Dashboard stub has no stat card** — wireframe has no stat card. If Patrick wants one, easy add. I held off because the wireframe is the source of truth.
3. **Settings sub-tab slugs in URL** — bare `/books/settings` redirects to `/books/settings/general`. This adds an extra redirect on first navigation; trade-off is URL shareability.
4. **Pill text** — used "Coming in Phase 1" for Setup/Categories/Settings (per Rusty's note in TASK), "Available in Phase 11" for Dashboard (per phase roadmap). If Patrick objects to either, single-line change in each stub.
5. **Archive vs delete** — 17 files moved to `_archived/`. If the team prefers a hard delete, `rm -rf client/src/books/_archived/` is the cleanup.
