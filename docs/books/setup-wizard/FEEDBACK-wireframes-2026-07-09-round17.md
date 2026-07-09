# FEEDBACK — Virta Books v2 wireframes round 17: default landing = Dashboard

**Author:** Rusty + Patrick Bailey
**Window:** 2026-07-09 11:09 → 11:12 MDT (webchat)
**Baseline:** Round 16 (GL → Transactions rename) at commit `157bce0`.
**Status:** Default landing screen changed. Wireframe + spec updated. **Smoke test 221/221 passing.**

One-line change, but it's the user's first impression of the app. Captured for the record.

---

## What we changed

The wireframe opened to **Settings** by default — `state.screen = state.screen || 'settings'`. The Settings link also had `class="active"` hardcoded. So a brand-new user opening the app landed on Settings, which is a destination page, not a home base.

Patrick's call: open to **Dashboard** instead. Settings stays a sidebar destination, just not the landing page.

Why Dashboard: it's the home base — review-queue counts, upcoming bills, recent activity. A non-accountant opens the app wanting to see "what's going on," not to configure things.

---

## What changed

### `WIREFRAMES.html`

- **Router (line ~1400)**: `state.screen = state.screen || 'settings'` → `state.screen = state.screen || 'dashboard'`.
- **Sidebar (line 160)**: added `class="active"` to the Dashboard link.
- **Sidebar (line 166)**: removed `class="active"` from the Settings link (was hardcoded).

### `SETUP_AND_CATEGORIES.md`

- **D69 added** — documents the default-landing decision: Dashboard is the home base; Settings is a destination, not a starting point.
- **Status header** — appended "Round 17 applied 2026-07-09 (default landing screen changed from Settings to Dashboard; sidebar active-state moved accordingly)."

### `tests/wf-smoke.mjs`

- **+3 new assertions** (R17):
  - Default landing screen is Dashboard
  - Sidebar Dashboard link has `class="active"`
  - Sidebar Settings link no longer has `class="active"`

**Smoke test result: 221/221 passing.**

### `VIRTA_BOOKS_V2.md`

- Artifact row: smoke test now 221/221 (was 218/218).
- Change log: new row for round 17.

---

## Phase 1 status after round 17

Unchanged. Design complete, not yet built.

## What's next

Phase 2 (GL architecture + audit log + filter bar). Awaiting Patrick's go-ahead.
