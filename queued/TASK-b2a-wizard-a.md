# TASK — B2a-wizard-A: sidebar cleanup + Dashboard first-run

**Status:** RESUMING — server foundation done (B2a-prime + fixups, 4 commits). UI is split into A (sidebar/Dashboard) and B (wizard steps + NAICS modal) per §5.11 cadence.
**Phase:** v2 Setup Wizard — UI half of B2a
**Author:** Rusty
**Date:** 2026-07-13 16:55 MDT
**Branch:** `main`

---

## Why this is split from B2a-wizard-B

The full B2a UI build (sidebar + Dashboard + wizard Steps 1-2 + NAICS modal) is too big for one Cinder round given the upstream timeout at ~5min. Splitting per §5.11: this brief covers chrome (sidebar, first-run Dashboard state); B2a-wizard-B covers the wizard itself (Steps 1-2 + NAICS modal).

---

## Scope of THIS build (B2a-wizard-A only)

### 1. Sidebar cleanup — Setup Wizard is NOT a permanent nav item

Per Patrick's call 2026-07-13 14:01 MDT: the Setup Wizard is a once-and-done flow, not a destination. **Remove the "🧙 Setup Wizard" link from `BooksShell.jsx`.**

After removal:
- Sidebar shows 4 links: Dashboard, Categories, Transactions, Settings.
- Setup Wizard is reachable via:
  - First-run welcome card CTA (this build)
  - Dashboard "Continue setup →" CTA (this build, State B)
  - Settings → General "Restart wizard" button (B5 scope, future)

### 2. First-run experience (State A)

Per Patrick's call 2026-07-13 13:59 MDT: **if Virta Books has never been opened before, the user should land on a clean welcome page** with one obvious action. No sidebar, no Dashboard chrome — just a centered card.

**Detection:** `GET /api/v1/books/businesses/current` returns 200 with `{ data: null }` (when no business row exists — Rusty already verified this contract in B2a-prime) OR 404.

**First-run card (`/books` route renders this when no business exists):**
- Full-page centered welcome card (no sidebar chrome).
- Headline: "Welcome to Virta Books."
- Body: "Let's set up your books so you can start tracking your business."
- Primary CTA: "Set up your books →" → navigates to `/books/setup`.
- Single 1px subtle border, dark-theme consistent with the rest of the app.

**BooksShell sidebar visibility:**
- When business exists → show sidebar.
- When no business → hide sidebar entirely (only the welcome card renders).

### 3. Mid-flow state (State B)

When the user has clicked "Set up your books →" and the wizard is in progress (localStorage state exists for `virta_books:wizard:setup:state` with `setupCompletedAt === null`):

- Sidebar visible (they're in the flow).
- Default landing is `/books/setup` (the wizard) instead of `/books` Dashboard — but `navigate('/books')` should still work and land them on the "Continue setup" Dashboard card.
- "Continue setup" card on Dashboard with CTA → `/books/setup`.

### 4. Welcome-back state (State C)

When `setupCompletedAt !== null` OR a business row exists with non-null required fields:

- Sidebar visible.
- Default landing is `/books` Dashboard with "Welcome back" content:
  - Headline: "Welcome back, [business_name or 'there']."
  - Body: "Your books are ready. What's next?"
  - Status bar at top: "Setup [✓ Done / ⚠ Not started] · Categories [✓ Done / ⚠ Not started]"
  - For this build: Setup = ✓ Done if a business row exists, ⚠ Not started otherwise. Categories = ⚠ Not started always (B3 wires this).
  - Three cards (placeholder content for now):
    - "Recent transactions" — empty state with link to Transactions.
    - "Categories to review" — empty state with link to Categories.
    - "Action needed" — empty state with link to Reconcile (Phase 9, link to `/books/transactions` placeholder for now).

### 5. Files to touch

- `client/src/books/BooksShell.jsx` — remove Setup Wizard link, add sidebar visibility based on `GET /businesses/current`.
- `client/src/books/Dashboard.jsx` — replace stub with conditional rendering (States A / B / C).
- `client/src/books/api.js` — `getCurrentBusiness()` already exists from B2a-prime; add a small wrapper if needed.

### 6. Don't break

- B1a Transactions polish
- B1a Categories CRUD (Categories.jsx stub)
- B2a-prime server foundation
- The Setup Wizard stub (`/books/setup` route still works — just gets no sidebar link)
- Wireframe smoke (255/255)
- Existing `Settings.jsx` (still in working tree, not in scope)

---

## Build behaviors (Test coverage)

| Behavior ID | Name | Verifies |
|---|---|---|
| VB-DASH-STATE-A-01 | Dashboard renders full-page welcome card when no business exists | ✓ |
| VB-DASH-STATE-A-02 | Welcome card has "Set up your books →" CTA | ✓ |
| VB-DASH-STATE-A-03 | Welcome card CTA navigates to /books/setup | ✓ |
| VB-DASH-STATE-B-01 | Dashboard renders "Continue setup →" card when business exists but setup incomplete | ✓ |
| VB-DASH-STATE-C-01 | Dashboard renders "Welcome back, [name]" headline when setup complete | ✓ |
| VB-DASH-STATE-C-02 | Status bar shows "Setup ✓ Done · Categories ⚠ Not started" when setup complete | ✓ |
| VB-SHELL-NO-WIZ-01 | Setup Wizard link is NOT in the sidebar | ✓ |
| VB-SHELL-HIDE-01 | Sidebar is hidden when no business exists | ✓ |
| VB-SHELL-SHOW-01 | Sidebar is shown when a business exists | ✓ |
| VB-NAV-WORK-01 | Categories, Transactions, Settings nav links still work | ✓ |

---

## Definition of done

- [ ] Read `BooksShell.jsx`, `Dashboard.jsx`, `api.js` before changes.
- [ ] Setup Wizard link removed from sidebar.
- [ ] Dashboard renders 3 states correctly based on `GET /businesses/current`.
- [ ] Sidebar visibility toggles correctly (hidden in State A, shown in B/C).
- [ ] All 10 behavior IDs verified.
- [ ] Demo recorded: `demos/2026.07.13-b2a-wizard-a.mp4` (silent 5-7 min).
- [ ] Committed.
- [ ] CINDER_REPORT_b2a-wizard-a.md written.

## When done

Push completion event with:
- 2-line summary
- Commit hash
- Demo path
- Anything to flag for Wren
- Any out-of-scope findings

## Hard rules

- Don't touch SetupWizard.jsx (B2a-wizard-B).
- Don't touch Transactions.jsx, Categories.jsx, Settings.jsx.
- Don't push, no sub-agent spawns.
- Visual check in dark mode.

## Why this is a focused build

~150-200 lines of UI changes in 2 files. Should finish well under 5 min.
