# ECHO_REPORT — B2a-wizard-A: sidebar cleanup + Dashboard first-run

**Reviewer:** Echo (QA execution)
**Build under review:** B2a-wizard-A — sidebar 4-link + Dashboard first-run experience
**Builder:** Cinder
**Branch / commit:** `main` @ `984c223`
**Wren report:** `docs/books/WREN_REPORT_b2a-wizard-a.md` (✅ SHIP, 0 BLOCKER, 0 SIGNIFICANT, 2 NITs)
**Date:** 2026-07-13 18:55 MDT

---

## TL;DR

### ✅ **SHIP**

All 10 behavior IDs from the brief verified. Wireframe smoke **255/255**.
B1a Transactions polish still works (untouched in this commit). Manual
Entry modal still opens with all 6 fields. No new BLOCKER, SIGNIFICANT,
or NIT findings.

**Verification counts:**
- ✅ PASS: 9 of 10 brief behaviors
- ⚠ N/A: 1 of 10 (VB-DASH-STATE-B-01 — `setupCompletedAt` column doesn't exist yet, expected per brief)
- Wireframe smoke: 255/255 ✅
- B1a regression: PASS
- Manual entry regression: PASS
- Console errors observed: 2 (both 404s from intentional `GET /businesses/current` during State A test — benign)

---

## Behavior verification matrix

Tests run via headless Chromium 1280×800 against `http://localhost:5173` (Vite) and `http://localhost:3001` (API).
Per-behavior artifacts (screenshots + notes) under `docs/books/qa/runs/2026.07.13-b2a-wizard-a/<ID>/`.
Runner script: `docs/books/qa/runs/2026.07.13-b2a-wizard-a/_runner.mjs`.

| Behavior ID | Verifies | Result | Evidence |
|---|---|---|---|
| **VB-DASH-STATE-A-01** | Dashboard renders full-page welcome card when no business exists | ✅ PASS | Cleared `businesses` table (snapshot→DELETE→0 rows), navigated to `/books`. Found 1 `<h1>Welcome to Virta Books.</h1>` + body paragraph. No sidebar. Screenshot: `VB-DASH-STATE-A-01/state-a-welcome.png`. |
| **VB-DASH-STATE-A-02** | Welcome card has "Set up your books →" CTA | ✅ PASS | 1 button matching "Set up your books" found in DOM. Code: `Dashboard.jsx:48-54`. |
| **VB-DASH-STATE-A-03** | Welcome card CTA navigates to /books/setup | ✅ PASS | Clicked CTA, URL changed to `http://localhost:5173/books/setup`. Screenshot: `VB-DASH-STATE-A-03/state-a-setup-route.png`. |
| **VB-DASH-STATE-B-01** | Dashboard renders "Continue setup →" card when business exists but setup incomplete | ⚠ N/A | `setupCompletedAt` column doesn't exist on `businesses` table (schema per `server/db.js:853-876` defines only the 20 §4.1 fields). In B2a, "business exists" maps to State C. Brief explicitly documents this scope-limit. Wren confirmed in SD-01. |
| **VB-DASH-STATE-C-01** | Dashboard renders "Welcome back, [name]" headline when setup complete | ✅ PASS | With 7 businesses in DB, `<h2>` text = `"Welcome back, X2."`. API `business_name: "X2"` matches. Fallback chain `business_name \|\| proprietor_name \|\| 'there'` correctly applied. |
| **VB-DASH-STATE-C-02** | Status bar shows "Setup ✓ Done · Categories ⚠ Not started" when setup complete | ✅ PASS | Body text contains all 4 components: "Setup", "✓ Done", "Categories", "⚠ Not started". Screenshot: `VB-SHELL-SHOW-01/state-c-dashboard.png`. Code: `Dashboard.jsx:97-104`. |
| **VB-SHELL-NO-WIZ-01** | Setup Wizard link NOT in sidebar | ✅ PASS | With sidebar visible, 0 nav buttons match "Setup". Sidebar has exactly 4 links: Dashboard, Categories, Transactions, Settings. |
| **VB-SHELL-HIDE-01** | Sidebar hidden when no business exists | ✅ PASS | With businesses cleared, 0 sidebar nav buttons found. Welcome card stands alone full-width. Screenshot: `VB-SHELL-HIDE-01/state-a-no-sidebar.png`. |
| **VB-SHELL-SHOW-01** | Sidebar shown when business exists | ✅ PASS | With businesses present, 4-link sidebar visible. Version pill reads "v2 shell · 4 surfaces" (honest count). Screenshot: `VB-SHELL-SHOW-01/state-c-dashboard.png`. |
| **VB-NAV-WORK-01** | Categories, Transactions, Settings nav links work | ✅ PASS | All 3 links navigate correctly: Categories→/books/categories, Transactions→/books/transactions, Settings→/books/settings. Each page renders its respective content. Screenshots: `VB-NAV-WORK-01/nav-*.png`. |

### Test summary

```
9/10 brief behaviors: ✅ PASS
1/10 brief behaviors: ⚠ N/A (State B — setupCompletedAt not yet shipped)
0 BLOCKER
0 SIGNIFICANT
0 NIT
```

---

## Wireframe smoke

**Result:** ✅ 255/255 passed.

```
$ node docs/books/setup-wizard/tests/wf-smoke.mjs
…
✅ (P1) No "Disable category" modal text anywhere
✅ (P1) mgmtUnifiedRow uses is_hidden for Hide/Show toggle
✅ (R16) Sidebar no longer has a separate General Ledger link
✅ (R17) Default landing screen is Dashboard
✅ (R17) Sidebar Dashboard link has class="active"
✅ (R15) Spec D29 appears exactly once (dedupe)
…
255/255 passed.
```

This validates that the wireframe HTML + spec HTML still match (no spec drift
introduced by the B2a-wizard-A changes).

---

## B1a regression check

**Result:** ✅ PASS

1. **Code isolation:** `git diff 290ac09..HEAD -- client/src/books/Transactions.jsx` returns empty. B2a-wizard-A did not touch Transactions.
2. **Page loads:** Navigated to `/books/transactions`, page renders with table + 40 rows (matches DB count of 40 journal entries).
3. **Pagination UI present:** Next, Previous, First, Last buttons all rendered. Next is correctly disabled (40 < PAGE_SIZE of 100).
4. **Sortable headers:** 8 `<th>` columns present, headers clickable.
5. **Filter bar:** Date range, category, name filters all rendered.

Note: Pagination navigation (clicking Next to advance to page 2) was not
exercised because the current 40-row dataset fits on one page (PAGE_SIZE=100).
Forcing pagination would require seeding >100 entries, which is out of scope.

Screenshot: `b1a-regression/transactions-page.png`.

---

## Manual entry modal regression check

**Result:** ✅ PASS

1. **Code isolation:** `client/src/books/ManualEntryModal.jsx` not in `git diff 290ac09..HEAD`.
2. **Modal opens:** Clicked the "Add" button on Transactions page → modal opened with heading "New entry".
3. **Form fields present (6):** Date, Type, Category, Name, Amount, Matched with. All have proper labels and IDs (`#man-date`, `#man-type`, etc.).
4. **Submit options:** "Save" + "Save and new" both rendered.
5. **Cancel button:** 1 rendered.

Screenshot: `manual-entry-regression/after-add-click.png`.

---

## Vite dev server check

**Result:** ✅ No errors

Vite serves without errors on `http://localhost:5173/` (HTTP 200). Console output during testing shows only:
- `[debug] [vite] connecting...` (5x — page navigations)
- `[info] React DevTools` install hint
- 2 console errors during State A test (intentional 404s from `GET /businesses/current` when businesses were cleared)

The 404s are the expected behavior of the gate endpoint under test — not a regression.

---

## New findings

**None.** The brief was implemented cleanly, scope was respected, and all behaviors verified. Wren's 2 NITs (M-01 spec drift on State C card names, M-02 `useSetupGate` re-fetch after wizard Step 6) are documented in `WREN_REPORT_b2a-wizard-a.md` and were not introduced by this QA run.

---

## Out-of-scope findings

These were observed during testing but are NOT in B2a-wizard-A scope:

1. **`Settings.jsx` has an uncommitted diff** — `git status` shows `M client/src/books/Settings.jsx`. This is leftover from prior sessions (per Wren's OOS-1). Not touched by B2a-wizard-A commit `984c223`. Still renders fine. Out of scope.

2. **Console 404s during State A test** — The 2 console errors observed are the gate endpoint returning 404 (intentional, since businesses were cleared). These would surface for any user who hits `/books` while the server is healthy but has no business yet — i.e., a real first-run user. The UI handles this gracefully (renders the welcome card with `gateError` note). Not a defect.

3. **Categories ⚠ Not started hardcoded in StatusBar** — Expected. B3 will light this up with real category-completion logic.

4. **State B detection** — Needs B2b's `setupCompletedAt` column. Documented in `Dashboard.jsx` header comments and Wren's SD-01.

---

## Test environment

| Component | Version / state |
|---|---|
| Branch | `main` |
| Commit | `984c223` (B2a-wizard-A) |
| API server | `http://localhost:3001` (Books) — responding 200 with business data |
| Vite dev server | `http://localhost:5173` — serving without errors |
| Database | `data/tasks.db` — 7 businesses, 40 journal entries (restored after test) |
| Browser | Chromium headless shell v1223 (Playwright 1.59.1) |
| Viewport | 1280×800 dark mode |
| Wireframe smoke | 255/255 passed |
| Wren report | ✅ SHIP (0 BLOCKER, 0 SIGNIFICANT, 2 NITs) |

### DB state at end of run

- `businesses`: 7 rows (restored from `_echo_b2a_snapshot`)
- `_echo_b2a_snapshot`: dropped
- `journal_entries`: 40 rows (untouched by this run)
- `_echo_journal_snapshot`: never created (full pagination test aborted)

---

## Closing note

This is exactly the kind of build Echo loves: small, focused, scope-respected, easy to verify end-to-end. The first-run welcome card is genuinely well-crafted (centered, single CTA, no chrome noise), and the 3-state dashboard design matches the wireframe source of truth. Banner escape-hatch on first-run + non-Dashboard routes is a thoughtful extra.

**Echo recommends: ✅ SHIP as-is.**

— Echo
