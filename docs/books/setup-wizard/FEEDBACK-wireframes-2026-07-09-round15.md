# FEEDBACK — Virta Books v2 wireframes round 15: Phase 1 cleanup

**Author:** Rusty + Patrick Bailey
**Window:** 2026-07-09 10:00 → 10:45 MDT (webchat)
**Baseline:** Phase 1 design complete (D51–D67, §10A, GL skeleton) from 2026-07-08 23:05 MDT.
**Status:** Phase 1 cleanup applied. Wireframe + spec + smoke test updated. **Smoke test 216/216 passing.** Not yet built for real.

This document captures the small-coordinated Phase 1 cleanup pass that closes out the design work from last night. Pure hygiene — no new design features. The roadmap is unchanged.

---

## What we set out to do

`VIRTA_BOOKS_V2.md` carried three open questions as low-priority cleanup items (per Patrick's 2026-07-08 17:15/17:17 MDT scope rules):

1. **Spec hygiene** — D29–D32 and D43–D49 each appeared twice in the §3 decisions table (once from each round that touched them). Cosmetic.
2. **Smoke test portability** — `/tmp/wf-smoke.mjs` lived outside the repo, broke between sessions, and depended on `/tmp/node_modules`.
3. **Wireframe dead code** — three artifacts from the round-5/7 collapse to a single-page Categories Management that were never removed:
   - `state.activeTab:'expenses'` field (never read after the collapse)
   - Legacy `catFilter='revenue' | 'ale'` router branches in the global click handler (unreachable)
   - The Categories Management link in the Dashboard widget still used `state.activeTab='expenses'` (also dead)

Plus a fourth item surfaced during execution: two stale smoke-test assertions for the manual-entry modal were written against the original D61 form (with fields "Date/Name/Amount/Description/Category/Matched with/Notes" and title "Manual journal entry") but the wireframe was updated to the locked D62 form ("Account + Change + Other account", title "New entry"). The assertions were failing, not the wireframe.

---

## What changed

### `SETUP_AND_CATEGORIES.md` (spec)

- **§3 Decisions — dedupe pass.** Removed 11 duplicate D-rows (D29, D30, D31, D32, D43, D44, D45, D46, D47, D48, D49 — each appeared twice). Kept the later (more refined) wording in every case. §3 now lists each decision exactly once.
- **Status header** — appended "Round 15 applied 2026-07-09 (Phase 1 cleanup: spec dedupe of D29–D32/D43–D49, wireframe dead-code removal of `state.activeTab` + legacy `catFilter='revenue'/'ale'` router, smoke test updated for the D62 New-entry modal)."

### `WIREFRAMES.html`

- **Line ~258** (state init): removed `activeTab:undefined, /* removed round 15 */` field. The field was never read after the round-5 single-page collapse and only existed for routing compat.
- **Line ~1259** (Dashboard widget): changed the Categories — Expenses link from `state.activeTab='expenses'` to `state.catFilter='expenses'`. Aligns with the sidebar Categories link (which already uses `catFilter='all'`).
- **Lines ~1418–1420** (global click router): removed the three if/else branches that mapped `data-screen="income" | "expenses" | "other"` to legacy `catFilter` values `'revenue' | 'expenses' | 'ale'`. None of those `data-screen` values exist anywhere in the sidebar (which is the only place `data-screen` is used), so all three branches were unreachable. Router is now the simple form: `state.screen = k; render();`.

### `tests/wf-smoke.mjs` (moved from `/tmp` into repo)

- **Import path** changed from `/tmp/node_modules/jsdom/lib/api.js` to `jsdom` (resolved via local `tests/.deps/node_modules/`).
- **2 broken assertions fixed** (the manual-entry modal — they were written against the superseded D61 form, not the locked D62 form):
  - Was: `manualEntryModal.includes('Manual journal entry')` → Now: `manualEntryModal.includes('New entry')` (D62 locked button text)
  - Was: fields `['Date','Name','Amount','Description','Category','Matched with','Notes']` → Now: `['Date','Account','Change','Description','Other account','Notes']` (D62 locked field set)
- **5 new assertions added** for the D62/D63/D64/D65 manual-entry modal:
  - Title is "New entry" (D62)
  - All 6 fields present (D62)
  - Sign convention copy: "positive = it went up" + "negative if it went down" (D63)
  - No "Save draft" or "Post entry" button (D65 — single Save)
  - No Type picker in the modal (D62/D64 — label adapts to picked Account's type)
  - No debit/credit language (D63)
  - "Balanced ledger entry behind the scenes" copy present (D62)
- **11 new assertions added** for round 15 cleanup itself:
  - 11 dedupe verifications (D29–D32, D43–D49 each appear exactly once in the spec)
  - Wireframe has no `activeTab:` field
  - Wireframe has no legacy `catFilter='revenue'|'ale'`
  - Sidebar has no `data-screen="income" | "expenses" | "other"`
  - Global click router is the simple form
  - Dashboard widget uses `catFilter='expenses'`
  - Spec status header mentions "Round 15 applied 2026-07-09"

**Smoke test result: 216/216 passing.**

### `VIRTA_BOOKS_V2.md` (umbrella)

This document was significantly out of date. Just rewrote. Key changes:
- Status line bumped to "Phase 1 design complete + round 15 cleanup committed"
- Added Phase 1 to "In scope" (D51–D67, §10A, GL skeleton, D62 modal)
- Artifact row updated: 1425L / 868L / 666L (smoke) / 216/216 passing / smoke now in repo at `tests/wf-smoke.mjs`
- Added full phase roadmap (12–26) with Phase 1 marked ✅ Design complete
- Retired open questions #1 (spec dedupe), #2 (smoke portability), #3 (wireframe cleanups) — all DONE in round 15
- Added #7 (GL filter bar) as the next thing to design in Phase 2
- Change log grew from 2 rows to 4 (added Phase 1 design complete + round 15)

---

## Items explicitly deferred

| Item | Why | Resolved at |
|---|---|---|
| ~~Spec dedupe~~ | ~~cosmetic~~ | Done this round |
| ~~Smoke test portability~~ | ~~broke between sessions~~ | Done this round |
| ~~Wireframe dead code (activeTab, catFilter router, sidebar stale counts)~~ | ~~not visible but polluting the file~~ | Done this round |
| GL filter bar (date range, category, name) | Patrick said "for MVP" during Phase 1; design will land in Phase 2 | Phase 2 design |
| Settings → Other tab content | v1 scope; placeholder in the wireframe | v1 / not v2 |
| E.2 reconcile demo review | v1 scope | v1 / not v2 |
| Wren Q1/Q2 from 2026-07-06 | v1 scope | v1 / not v2 |

---

## Phase 1 status after round 15

- **Design complete.** All D51–D67 decisions locked, §10A formal schema documented, GL skeleton in the wireframe with D62-D66 manual-entry modal, spec is deduped and clean, wireframe has no dead code, smoke test is in-repo and at 216/216.
- **Build phase not started.** Per the build → demo → play → decide gate (`process/ENGINEERING.md` §5.9), Phase 1 build needs an explicit "start build" call from Patrick.
- **Phase 2 design** is the next thing up. Scope: lock GL posting rules, lock the audit-log click-to-reveal pattern, design the GL filter bar.

---

## What next session should do

- If continuing v2 design: pick up **Phase 2 (GL architecture + audit log)**. Start by re-reading `FEEDBACK-wireframes-2026-07-08-phase1-design.md` (the Phase 1 design doc) to load context on D51–D67 and §10A.
- If switching to v1 (live app + backlog): not recommended while the v2 design phase is open; flag for explicit Patrick call.
- If `VIRTA_BOOKS_V2.md` or the spec feels stale again: trust the wireframe + spec as authoritative, then update the umbrella to match.
