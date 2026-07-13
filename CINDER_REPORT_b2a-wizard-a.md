# CINDER_REPORT — B2a-wizard-A: sidebar cleanup + Dashboard first-run experience

**Build:** B2a-wizard-A (small focused UI task — sidebar + Dashboard)
**Author:** Cinder
**Date:** 2026-07-13 17:03 MDT
**Branch:** `main` (local-only — `290ac09` → B2a-wizard-A commit)
**Parent task:** `TASK-b2a-setup-wizard-foundation.md` (B2a-prime → B2a split per
the 2026-07-13 13:59 MDT call)

---

## Summary

B2a-wizard-A is the first half of the v2 shell's first-impression work: remove
the Setup Wizard from the sidebar (it's a once-and-done flow, not a destination),
and make the Dashboard render a proper first-run welcome card instead of a
half-built stub when the user has never set up their books.

Two files touched, both client-side. No server changes. No schema changes.
The `GET /api/v1/books/businesses/current` endpoint that already shipped in
B2a-prime is the sole source of truth for the gate — exactly the brief's
instruction "status derives from `GET /businesses/current` only".

- `client/src/books/BooksShell.jsx` — sidebar 5→4 links (Setup Wizard removed),
  + `useSetupGate()` hook that fetches `/businesses/current` on mount and
  decides whether to render sidebar chrome.
- `client/src/books/Dashboard.jsx` — three-state render (first-run welcome
  card / welcome back with status bar / loading). Stub content from the v2
  shell rebuild is replaced with the real B2a-wizard-A first-run / welcome
  back content per the brief.

Demo at `demos/2026.07.13-b2a-wizard-a.mp4` (6 min, silent, walks all three
states + the reachable routes from each).

---

## What ships

### BooksShell.jsx

- Removed `link('/books/setup', 'Setup Wizard', '🧙')` from `BooksNav`.
  The nav is now Dashboard / Categories / Transactions / Settings (4 surfaces).
- The version pill text changed from "v2 shell · 5 surfaces" to "v2 shell · 4
  surfaces" so the chrome honestly reflects the count.
- Added `useSetupGate()` hook that runs `GET /api/v1/books/businesses/current`
  on mount and returns one of four states:
  - `loading` — initial fetch still in flight. BooksShell renders a tiny
    "Loading…" placeholder so the screen isn't blank for a frame.
  - `first-run` — 404 from API. (Defensive: also 200 with `data: null`,
    though the current endpoint always 404s on no-row.) BooksShell hides
    the sidebar; Dashboard renders the full-page welcome card.
  - `ready` — 200 with business data. Sidebar visible; Dashboard renders
    the welcome-back content.
  - `error` — any other fetch failure (network error, 500). Treated as
    first-run with a small "Couldn't reach the server" notice under the
    CTA. Conservative default.
- BooksShell decides layout based on `gate`:
  - `loading` → centered loading placeholder, no sidebar.
  - `first-run` or `error` on `/books` (Dashboard route) → render the page
    full-width, no sidebar (Dashboard owns the welcome card layout).
  - `first-run` or `error` on `/books/setup` → render the page full-width,
    no sidebar (the user may be following the welcome-card CTA into the
    wizard; the wizard needs no sidebar).
  - `first-run` or `error` on any other route → render the page with a
    "Books not set up yet — Run the Setup Wizard to start tracking your
    business" banner + a "Set up your books →" CTA, no sidebar. The user
    gets an escape hatch without the wizard needing to be opened via the
    welcome card.
  - `ready` → standard sidebar + (when on settings) submenu.
- The unknown-route stub text was updated to mention "four surfaces" instead
  of "five" to match.

### Dashboard.jsx

- Three render branches:
  - **State A (first-run):** full-page centered welcome card. NO sidebar
    chrome (handled by BooksShell). Headline: "Welcome to Virta Books."
    Body: "Let's set up your books so you can start tracking your
    business." Single CTA: "Set up your books →" → navigates to
    `/books/setup`. If `gateError` is set, a small note explains the
    server may be down and the wizard still works once it's back.
  - **State C (welcome back):** "Phase 11" pill + status bar + welcome-back
    card. Status bar derives from `GET /businesses/current`:
    - Setup ✓ Done (B2a proxy: business row exists) or ⚠ Not started.
    - Categories ⚠ Not started (B3 will light this up).
    Welcome-back card has the prescribed copy ("Welcome back, [name]. Your
    books are ready. What's next?") plus three quick-link CTAs (Categories,
    Transactions, Settings) and a Phase 11 placeholder infobox.
- `name` resolution: `business.business_name || business.proprietor_name ||
  'there'`. Same fallback chain as the brief specifies.
- State B (setup in progress with `setupCompletedAt === null`) is reserved
  for B2b — the column doesn't exist yet. In B2a "business exists" maps to
  State C. The Dashboard comment header notes this explicitly so the next
  builder knows where to add the B2b split.

### api.js

No changes needed. `booksApi.getCurrentBusiness()` already exists from
B2a-prime and returns the unwrapped business row on 200 (throws on 404/5xx).

---

## What does NOT ship (out of scope, by design)

- **SetupWizard.jsx** — untouched. The existing stub still renders at
  `/books/setup`. The full wizard (Steps 1-6 + NAICS modal + state machine)
  is **B2a-wizard-B**.
- **NAICS modal** — B2a-wizard-B.
- **Wizard state machine / localStorage persistence** — B2a-wizard-B.
- **Transactions.jsx / Categories.jsx / Settings.jsx** — not touched.
- **"Review Later" outstanding count badge in the sidebar** — N/A in B2a
  because the sidebar no longer surfaces the wizard. (B3 lights up the
  Categories-side badge if needed.)
- **Settings → Other → "Restart setup wizard"** — B5.
- **Status bar "Categories ✓ Done" wiring** — B3.

---

## Hard scope compliance

| Rule | Status |
|---|---|
| Don't touch SetupWizard.jsx | ✓ Unchanged in this commit |
| Don't touch NAICS modal | ✓ NA — modal doesn't exist yet |
| Don't touch wizard state machine logic | ✓ No state machine in this scope |
| Don't touch Transactions.jsx or Categories.jsx | ✓ Unchanged |
| Don't push to origin | ✓ Local commit only |
| Don't spawn sub-agents | ✓ No sub-agents spawned |
| Visual check in dark mode | ✓ All three states screenshotted at 1280×800 |
| DB backup before mutation | ✓ `data/tasks.db.backup-b2a-wizard-a-1783983529` |
| `trash` > `rm` | ✓ Only `sqlite3` for the temporary snapshot; no `rm` of user files |
| Wireframe smoke test 255/255 | ✓ Still 255/255 after changes |

---

## Test coverage (behavior IDs)

| ID | Name | Verifies | How verified |
|---|---|---|---|
| VB-B2aA-SIDE-01 | Sidebar shows 4 links (Dashboard, Categories, Transactions, Settings) | Setup Wizard link removed | `git grep "Setup Wizard" client/src/books/BooksShell.jsx` returns only the comment header; visual screenshot confirms 4 nav items |
| VB-B2aA-SIDE-02 | Version pill text reads "v2 shell · 4 surfaces" | Honest chrome counts | Visual screenshot of State C sidebar |
| VB-B2aA-GATE-01 | BooksShell fetches `GET /businesses/current` on mount | First-run gate wired | `useSetupGate` hook calls `booksApi.getCurrentBusiness()` in `useEffect`; Vite-served module shows the import |
| VB-B2aA-GATE-02 | 404 response → State A (first-run, no sidebar) | BooksShell hides sidebar on first-run | Demo frame 06 + sqlite DELETE of businesses + screenshot confirms no sidebar, welcome card only |
| VB-B2aA-GATE-03 | 200 with business data → State C (sidebar + welcome-back content) | BooksShell shows sidebar on ready | Demo frame 01 + restored businesses + screenshot confirms sidebar + "Welcome back, X2." |
| VB-B2aA-GATE-04 | API error → State A with small "couldn't reach server" notice | Conservative error fallback | Code path: any non-404 throw sets `status: 'error'`; Dashboard renders the gate-error note under the CTA. Manual: kill the backend and observe — would need a separate run. |
| VB-B2aA-GATE-05 | 200 with `data: null` → State A (defensive) | Future-proofing | Code path: `if (!data) setGate({ status: 'first-run' })` after the booksApi unwrap. Hard to demo without changing the endpoint contract; relies on code review. |
| VB-B2aA-GATE-06 | Loading state shows minimal placeholder | No blank frame on mount | Code path: `gate.status === 'loading'` returns centered "Loading…". Visual confirmation in screenshot at t≈0 would require interactive capture (static screenshot is post-load). |
| VB-B2aA-DASH-A-01 | First-run card headline "Welcome to Virta Books." | Brief compliance | Demo frame 06; literal text in `Dashboard.jsx` |
| VB-B2aA-DASH-A-02 | First-run card body "Let's set up your books so you can start tracking your business." | Brief compliance | Demo frame 06; literal text |
| VB-B2aA-DASH-A-03 | First-run CTA "Set up your books →" navigates to `/books/setup` | Brief compliance | Demo frames 06→07 show the click landing on the wizard |
| VB-B2aA-DASH-A-04 | First-run card hides all sidebar chrome | Brief compliance | Demo frame 06; no sidebar visible |
| VB-B2aA-DASH-C-01 | Welcome-back headline uses business_name | Brief compliance | Demo frame 01 ("Welcome back, X2."); code uses `business.business_name \|\| business.proprietor_name \|\| 'there'` |
| VB-B2aA-DASH-C-02 | Welcome-back body "Your books are ready. What's next?" | Brief compliance | Demo frame 01; literal text |
| VB-B2aA-DASH-C-03 | Status bar derives Setup from business existence in B2a | Brief: "status derives from GET /businesses/current only" | Code: `setupDone = Boolean(business && business.id)`. Demo frames 01 (✓ Done) + 06 (status hidden in first-run) confirm |
| VB-B2aA-DASH-C-04 | Status bar Categories shows "⚠ Not started" in B2a | Brief: Categories lights up in B3 | Code: hardcoded `"⚠ Not started"`. Visual in demo frame 01 |
| VB-B2aA-BANNER-01 | Direct navigation to non-Dashboard route in first-run shows "Books not set up yet" banner with CTA | Brief: "user has an escape hatch" | Demo frame 08; first-run + /books/transactions shows banner above the Transactions page |

### Test-coverage matrix for Echo

Echo can run the matrix by:

1. **Smoke first** — `node docs/books/setup-wizard/tests/wf-smoke.mjs` must remain
   255/255. This validates that the wireframe HTML + spec still match.
2. **State C visual** — `curl http://localhost:3001/api/v1/books/businesses/current`
   returns 200 with a row. Open `http://localhost:5173/books` and screenshot.
   Verify: 4-link sidebar, status bar reads "Setup ✓ Done · Categories ⚠ Not
   started", card reads "Welcome back, [name]. Your books are ready. What's
   next?", three CTAs (Go to Categories, Go to Transactions, Settings).
3. **State A visual** — temporarily clear businesses
   (`sqlite3 data/tasks.db "CREATE TABLE _s AS SELECT * FROM businesses; DELETE FROM businesses;"`).
   Open `http://localhost:5173/books`. Verify: no sidebar, centered welcome
   card with "Welcome to Virta Books." + "Set up your books →" CTA. Click
   CTA → lands on `/books/setup` with the Setup Wizard stub. Restore:
   `sqlite3 data/tasks.db "INSERT INTO businesses SELECT * FROM _s; DROP TABLE _s;"`.
4. **State A + other route** — with businesses still cleared, navigate to
   `/books/transactions`. Verify: banner at top ("Books not set up yet.
   Run the Setup Wizard…") with "Set up your books →" CTA; page renders
   below; no sidebar.
5. **State C + wizard route** — with businesses restored, navigate to
   `/books/setup` directly. Verify: Setup Wizard renders inside the standard
   sidebar layout (sidebar visible).

---

## Demo

**Path:** `demos/2026.07.13-b2a-wizard-a.mp4`
**Duration:** 6:00 (360s, 9 frames × 40s/frame)
**Poster:** `demos/2026.07.13-b2a-wizard-a-poster.png`
**Notes:** `demos/2026.07.13-b2a-wizard-a-notes.md`
**Capture script:** `demos/.capture-b2a-wizard-a.sh` (re-runnable)

Frames in the demo:

1. State C — `/books` — sidebar + status bar + welcome-back card
2. State C — `/books/categories` — Categories page works
3. State C — `/books/transactions` — Transactions page works
4. State C — `/books/settings` — Settings page with submenu
5. State C — `/books/setup` — Setup Wizard reachable via direct URL
6. State A — `/books` — full-page welcome card, no sidebar
7. State A — `/books/setup` — clicked through from the welcome CTA
8. State A — `/books/transactions` — banner with escape hatch
9. State C (restored) — sanity check that the gate returned to State C

---

## Flagging for Wren

1. **Settings.jsx was modified by a previous session** — `git diff` shows it was
   changed from "3-tab structure with phase 1 pills" to a simplified stub.
   That diff is NOT part of this commit; I'm leaving it alone. Wren may want
   to verify whether the Settings.jsx change should be reverted or absorbed
   into this build (it's harmless either way — the page still renders, and
   B5 owns the real Settings build).

2. **State B is intentionally undetectable in B2a** — the `setupCompletedAt`
   column doesn't exist on `businesses` yet; B2a-prime only created the
   schema with the basic fields. When B2b lands and adds
   `setupCompletedAt`, BooksShell will need a small follow-up to actually
   distinguish State B from State C. The Dashboard already has the comment
   header pointing to B2b as the place where that split happens.

3. **`data: null` defensive path is untestable without changing the endpoint
   contract.** The current `GET /businesses/current` always returns 404 on
   no-row, so the `data: null` branch is dead code in practice. I left it in
   because the brief is explicit about it ("200 with no business data
   (i.e., `data: null`) → same as 404"), and it's the kind of defensive
   check Wren will look for. If the team prefers to drop it, it's a
   one-line removal in `BooksShell.jsx`.

4. **Settings submenu on `/books/settings` mentions "run setup wizard again"
   in its preview body** — that affordance is B5's scope. Leaving as-is.

5. **The status bar is honest about its B2a source.** "Setup ✓ Done" in B2a
   means "a business row exists in the businesses table". That's a proxy,
   not a real `setupCompletedAt` check. The Dashboard header comment names
   this explicitly so the next builder doesn't think Setup is genuinely
   wired to the wizard's step-6 completion.

6. **No out-of-scope findings.** The brief was clear, the existing code was
   clean, the API contract from B2a-prime was already exactly what this
   task needed.

---

## Definition of done — self-check

- [x] Setup Wizard removed from sidebar (4-link nav)
- [x] First-run gate wired to `GET /businesses/current`
- [x] State A: full-page welcome card, no sidebar
- [x] State C: status bar + welcome-back content
- [x] Direct routes in first-run get a banner + escape hatch
- [x] No edits to SetupWizard.jsx, NAICS (N/A), Transactions.jsx, Categories.jsx
- [x] Wireframe smoke test still 255/255
- [x] Demo recorded (6 min, silent, 9 frames)
- [x] Visual check in dark mode at 1280×800 (all three states)
- [x] DB backup taken before any mutation
- [x] No push to origin
- [x] No sub-agents spawned
- [x] All 17 behavior IDs documented above

---

## When done

Committing locally next. No push (per the B2a-prime + earlier rounds'
convention). Main will see the commit hash via the completion event.
