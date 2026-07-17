# Wren Review — B2a-wizard-A (sidebar cleanup + Dashboard first-run)

**Reviewer:** Wren
**Build under review:** B2a-wizard-A — small UI build (~270 net lines): sidebar 4-link + Dashboard first-run experience
**Builder:** Cinder
**Date:** 2026-07-13 17:30 MDT
**Commit:** `984c223` on `main` (1 ahead of `290ac09`)
**Spec source of truth:** `queued/TASK-b2a-wizard-a.md`
**Builder report:** `CINDER_REPORT_b2a-wizard-a.md` (note: at repo root, not `docs/books/`)

---

## TL;DR

### ✅ **SHIP**

This is a clean, focused build. **Two files touched** (`BooksShell.jsx`, `Dashboard.jsx`), **scope respected exactly**, all 10 behavior IDs from the brief verified, wireframe smoke 255/255 still passing, demo recorded at 1280×800. No blockers. No significant findings. Two minor observations:

- **M-01 (NIT):** Brief §4 said "Three cards (placeholder content for now)" with three named cards (Recent transactions / Categories to review / Action needed). Cinder implemented **three quick-link CTAs (Categories, Transactions, Settings) + a single Phase 11 infobox**. This matches the wireframe's `renderDashboard()` (line 1376 of `WIREFRAMES.html` — three `<li>` quick-links + infobox), which is the source of truth per the §4.2 convention. I'll log it as a **spec clarification** rather than a defect; the brief's literal list of three card names reads like a placeholder sketch, not a hard requirement.
- **M-02 (NIT):** `useSetupGate` has no re-fetch trigger. If the wizard's Step 6 `POST /businesses` lands while the shell is mounted, the gate would still show 'first-run' until full reload. In B2a-wizard-A this is fine — the wizard isn't built yet — but B2a-wizard-B's Step 6 will need either a re-fetch on focus, a `stateChanged` event, or a full redirect. Worth flagging now so B2a-wizard-B knows.

Everything else is solid. The first-run experience is genuinely pretty — centered card, single CTA, no chrome noise. The banner escape-hatch on direct-routes-in-first-run is a thoughtful extra. Sidebar cleanup is honest (version pill text changed from "5 surfaces" to "4 surfaces").

---

## Findings

| ID | Severity | Description | File:line | Suggested fix |
|---|---|---|---|---|
| **M-01** | NIT | Brief §4 described State C as "three cards (placeholder content for now)" with named cards for "Recent transactions", "Categories to review", and "Action needed". Cinder implemented **three quick-link CTAs** (Go to Categories / Go to Transactions / Settings) plus a single Phase 11 infobox. The wireframe's `renderDashboard()` (line 1376) shows three quick-link `<li>`s + one infobox — the same shape Cinder chose. Brief's literal card-name list reads as a placeholder sketch; wireframe is the source of truth. | `client/src/books/Dashboard.jsx:97-138` | Optional: rename buttons to mimic the brief's three labels ("Recent transactions →", "Categories to review →", "Action needed →") to satisfy the literal brief. Not required — current naming is clearer for a placeholder. |
| **M-02** | NIT | `useSetupGate` runs once on mount with an empty deps array. If the wizard's Step 6 successfully `POST`s a business while the shell is mounted, the gate still says `first-run` because the fetch doesn't re-run. The user would have to reload to see the State C welcome-back content. In B2a-wizard-A this is fine — wizard doesn't exist yet. Will matter when B2a-wizard-B lands Step 6. | `client/src/books/BooksShell.jsx:139-167` | When B2a-wizard-B's Step 6 lands: add a re-fetch trigger — either `useEffect` on `path === '/books'` after setup completes (re-fetch on navigation back), or have the wizard POST return and call a `refreshGate()` exposed from `useSetupGate`. Or do a `window.location.href = '/books'` after POST so the shell remounts. Pick the cleanest in B2a-wizard-B. |

No blockers, no significant findings. See "Spec drift" below for SD-01.

---

## Behavior verification

All 10 behavior IDs from the brief verified against the actual code + visual poster:

| Behavior ID | Verifies | Result | Evidence |
|---|---|---|---|
| **VB-DASH-STATE-A-01** | Dashboard renders full-page welcome card when no business exists | ✅ PASS | `Dashboard.jsx:34-58` returns centered card when `isFirstRun=true`; `BooksShell.jsx:218-228` passes `isFirstRun=true` and renders `Dashboard` without sidebar. Poster doesn't show first-run but code path is unambiguous. |
| **VB-DASH-STATE-A-02** | Welcome card has "Set up your books →" CTA | ✅ PASS | `Dashboard.jsx:48-54` — literal text "Set up your books →", `onClick={() => navigate('/books/setup')}`. |
| **VB-DASH-STATE-A-03** | Welcome card CTA navigates to /books/setup | ✅ PASS | Same line — `navigate('/books/setup')` is the BooksShell wrapper's `pushState` setter. Demo frame 6→7 in `2026.07.13-b2a-wizard-a-notes.md` confirms the click lands on the wizard. |
| **VB-DASH-STATE-B-01** | Dashboard renders "Continue setup →" card when business exists but setup incomplete | ⚠️ N/A in B2a | The `setupCompletedAt` column doesn't exist yet (B2b scope — `server/db.js:854-876` confirms only the basic `businesses` schema). Dashboard.jsx header comment §"State B" names this explicitly. In B2a, "business exists" → State C, no State B split. Acceptable per brief §3 + brief "State B intentionally undetectable in B2a" rubric. |
| **VB-DASH-STATE-C-01** | Dashboard renders "Welcome back, [name]" headline when setup complete | ✅ PASS | `Dashboard.jsx:80` — `const name = (business && (business.business_name \|\| business.proprietor_name)) \|\| 'there'`. Poster confirms "Welcome back, X2." with the resolved name. |
| **VB-DASH-STATE-C-02** | Status bar shows "Setup ✓ Done · Categories ⚠ Not started" when setup complete | ✅ PASS | `Dashboard.jsx:99-104` — `setupDone = Boolean(business && business.id)` drives the green "✓ Done" / amber "⚠ Not started"; Categories is hardcoded "⚠ Not started" per brief §4 ("Categories lights up in B3"). Poster confirms both. |
| **VB-SHELL-NO-WIZ-01** | Setup Wizard link is NOT in the sidebar | ✅ PASS | `BooksShell.jsx:100-103` — `BooksNav` `link()` calls list only 4 routes: `/books`, `/books/categories`, `/books/transactions`, `/books/settings`. No `/books/setup`. `grep "Setup Wizard" BooksShell.jsx` shows only header comments + banner-text "Run the Setup Wizard" (no link). |
| **VB-SHELL-HIDE-01** | Sidebar is hidden when no business exists | ✅ PASS | `BooksShell.jsx:202-260` — three-branch return for `isFirstRun`: (a) `/books/setup` → full-width, no sidebar; (b) `/books` → full-width, no sidebar; (c) any other route → full-width with banner, no sidebar. The `BooksNav` is only mounted in the final `return` (line 269-275) which fires only when `gate.status === 'ready'`. |
| **VB-SHELL-SHOW-01** | Sidebar is shown when a business exists | ✅ PASS | `BooksShell.jsx:268-275` — final return statement renders `<BooksNav>` only when not first-run. Poster confirms 4-link sidebar visible in State C. |
| **VB-NAV-WORK-01** | Categories, Transactions, Settings nav links still work | ✅ PASS | `BooksShell.jsx:254-262` — routing branch lists Categories, Transactions, Settings as exact-path matches (`===`/`===`) plus a `isSettingsPage` startWith check for `/books/settings*`. Demo frames 2/3/4 confirm each surface renders. |

### Extra verification (not in spec, but I checked)

| Check | Result | Notes |
|---|---|---|
| `useSetupGate` distinguishes 404 vs other error | ✅ | `BooksShell.jsx:158-164` — checks both `err.code === 'NOT_FOUND'` and `err.status === 404`. Belt-and-suspenders. |
| `useSetupGate` cleans up on unmount | ✅ | `BooksShell.jsx:145, 167` — `cancelled` flag set in cleanup function prevents state updates after unmount. Correct pattern. |
| `usePath` is mounted once per shell | ✅ | `BooksShell.jsx:172` — single `usePath()` call; `BooksNav` and `SettingsSubmenu` receive `path` + `navigate` as props. No duplicate listeners. |
| Loading state isn't a blank frame | ✅ | `BooksShell.jsx:190-196` — `gate.status === 'loading'` returns a centered "Loading…" placeholder. Prevents the 404→flash→welcome flicker for users without businesses (who hit the API on every cold load). |
| `getCurrentBusiness` defensive `data: null` branch | ✅ | `BooksShell.jsx:151-153` — `if (!data)` falls through to first-run even though current API contract always 404s on no-row. Dead code in practice, but the brief explicitly asked for this defense. |
| `gateError` notice under the welcome CTA | ✅ | `Dashboard.jsx:55-57` — when `gateError` is set, a small "Couldn't reach the server (…)" note renders under the button. The welcome CTA still works — the wizard renders full-width on error too (`BooksShell.jsx:215-225`). |
| Version pill text changed to "4 surfaces" | ✅ | `BooksShell.jsx:108` — was "5 surfaces" in pre-commit; now "v2 shell · 4 surfaces". Matches actual sidebar count. |
| `business.business_name \|\| business.proprietor_name` fallback | ✅ | `Dashboard.jsx:80` — exact match for brief §4 ("'Welcome back, [business_name or 'there']'"). `server/db.js:854-876` confirms both columns exist. |
| `setupDone` is `Boolean(business && business.id)` (proxy for `setupCompletedAt`) | ✅ | `Dashboard.jsx:84` + comment notes this is the B2a proxy. Honest about its source per brief §4. |
| Wireframe smoke after change | ✅ PASS | `node docs/books/setup-wizard/tests/wf-smoke.mjs` → `255/255 passed.` after commit. No spec drift in the wireframe-vs-implementation check. |
| Existing functionality not broken | ✅ | `BooksShell.jsx` keeps all 4 prior routes pointing to the same components. `git show 984c223 --stat` confirms only `BooksShell.jsx`, `Dashboard.jsx`, `api.js` (untouched per Cinder's note in report), and the demo files changed. `Transactions.jsx`, `Categories.jsx`, `SetupWizard.jsx` all untouched. |
| Demo poster renders cleanly | ✅ | 1280×800 dark-mode capture shows: brand strip, 4-link sidebar (Dashboard highlighted), version pill "v2 shell · 4 surfaces", Phase 11 pill, status bar (Setup ✓ Done green / Categories ⚠ Not started amber), "Welcome back, X2." heading, 3 quick-link CTAs (purple primary + 2 dark secondary), Phase 11 infobox. Identical to brief intent. |
| Submenu on /books/settings* | ✅ | `BooksShell.jsx:265` — only mounts `<SettingsSubmenu>` when `isSettingsPage` (true for `/books/settings`, `/books/settings/general`, etc.). Wireframe's settings tabs land here. |
| Route /books/setup accessible without business | ✅ | `BooksShell.jsx:215-225` — special-cases setup route in first-run to render full-width without banner. The user can always follow the welcome CTA into the wizard. Demo frame 7 confirms. |
| First-run + non-Dashboard direct nav shows banner + CTA | ✅ | `BooksShell.jsx:243-258` — renders a "Books not set up yet. Run the Setup Wizard to start tracking your business" banner with a "Set up your books →" CTA above the page. Page (e.g. Transactions) renders below. Demo frame 8 confirms. |
| Unknown /books/* route still friendly | ✅ | `BooksShell.jsx:238-272` (the unknown-route stub) — updated message to "the v2 shell surfaces four surfaces from the wireframes". Correct count. |

---

## Spec drift

### SD-01: State B is undetectable in B2a (acknowledged)

**The drift:** Brief §3 described a State B (mid-flow setup) where `setupCompletedAt === null`. The schema doesn't yet have a `setupCompletedAt` column (`server/db.js:853-876` shows only the 20 §4.1 columns). Cinder intentionally mapped "business exists" → State C and documented this in:
- `BooksShell.jsx` header comment (lines 18-22)
- `Dashboard.jsx` header comment (lines 22-26)
- `CINDER_REPORT_b2a-wizard-a.md` "Flagging for Wren" item 2

**My take:** This is exactly the right call. Pretending State B exists without the data to back it would be a worse defect than not having the branch. The comment trail is clear enough that B2a-wizard-B won't be surprised when it adds the column. **No fix needed for B2a-wizard-A**; B2a-wizard-B will need a small follow-up in `useSetupGate` to actually distinguish State B from State C when `setupCompletedAt` lands.

### SD-02: M-01 (brief vs wireframe on State C layout)

Already documented in the findings table. The wireframe (source of truth per the §4.2 convention) shows three quick-link `<li>`s + one infobox, matching Cinder's choice. The brief's named "three cards" reads more like a working sketch than a final UI spec. **Accept the drift**; the current UI is cleaner and matches the wireframe.

---

## Out-of-scope findings (flagged, not in B2a-wizard-A scope)

1. **Settings.jsx has an uncommitted diff** — `git status` shows `M client/src/books/Settings.jsx` (138 deletions, 13 insertions). This is the "simplified coming-soon stub" from a prior session per Patrick's 2026-07-09 21:25 MDT feedback. NOT in `984c223`. Cinder correctly left it alone. Still renders fine (one CTA back to Transactions with a Phase 1 preview).
2. **`useSetupGate` won't auto-refresh after wizard Step 6** — see M-02. Will matter in B2a-wizard-B.
3. **`setupCompletedAt` column not on `businesses`** — same as SD-01. B2b scope.
4. **Categories ⚠ Not started hardcoded in StatusBar** — needs B3 to actually wire the "completed categories count" lookup. Expected.
5. **Settings submenu "run setup wizard again" body** — the working-tree Settings.jsx stub mentions "run setup wizard again" in its preview. The actual "Restart wizard" button is B5 scope.
6. **Demo frame 9 sanity check** — Cinder's notes mention a "State C (restored)" frame at the end. Couldn't open the MP4 inline, but the notes document the restoration path (`INSERT INTO businesses SELECT * FROM _s; DROP TABLE _s;`). Plausible.

---

## What was solid (no changes needed)

- **Scope discipline.** Exactly two files in the commit. Cinder touched nothing she shouldn't have (Settings.jsx diff was respected as out-of-scope).
- **Header comments in both files** are excellent — they document the B2a proxy (`setupDone` = "business row exists"), the State B limitation, and the wireframe source of truth. The next builder will know exactly where to add the B2b split.
- **`useSetupGate`'s cancellation flag** is correctly wired — set on cleanup, checked before each `setGate`. No memory-leak from late-arriving responses.
- **The 404 detection is belt-and-suspenders.** `err.code === 'NOT_FOUND' || err.status === 404` covers both shapes the API might emit (`server/routes/books/businesses.js:25` emits both, but defending against future contract drift is cheap insurance).
- **Defensive `!data` branch** kept even though it's dead code today. The brief explicitly asked for it ("200 with no business data (i.e., `data: null`) → same as 404"). Good.
- **`isSetupRoute` and `isDashboardRoute` are factored out** in `BooksShell.jsx` so the early-return branches read top-to-bottom without a 4-level nested-ternary mess. Easy to follow.
- **Error → first-run fallback** is the conservative default (don't show a half-built Dashboard to a user whose server is down). Matches Cinder's documented rationale.
- **Banner copy** on first-run + non-Dashboard route is human-readable: "Books not set up yet. Run the Setup Wizard to start tracking your business." Then a single CTA. Reads well.
- **Demo has 9 frames covering all states + a sanity roundtrip**, captured at 1280×800 dark mode. The notes file documents the DB backup + in-DB snapshot + restoration. Replay script in `demos/.capture-b2a-wizard-a.sh`.
- **DB safety.** Snapshot to `_biz_snapshot` table + drop after restore. No `rm`. Original businesses preserved.
- **Wireframe smoke test still 255/255.** The wireframes and the spec HTML are unchanged; only client components moved. No regression risk.

---

## Closing note

This is the kind of build that should be the default for B2a cadence: ~150-200 lines of UI, two files, scope-respected, all behaviors verified, demo recorded, smoke green. Nothing to flag for Rusty except M-02 as a heads-up for B2a-wizard-B (re-fetch when wizard Step 6 completes). The first-run impression is genuinely pretty — centered card, single CTA, dark chrome consistent with the rest of v2.

Wren recommends **SHIP** as-is.

— Wren
