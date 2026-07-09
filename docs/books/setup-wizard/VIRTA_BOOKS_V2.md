# Virta Books v2 — Snapshot & Working Doc

**Status:** v2 design phase (NOT build phase). Phase 1 (Chart of Accounts foundations) **design complete** 2026-07-08 (D51–D67 + §10A formal schema + GL skeleton). Phase 1 cleanup (round 15) committed 2026-07-09. Everything else (live app + backlog) is called **v1**.
**Started:** 2026-07-08 17:15 MDT (Patrick's call after session close-out).
**Build philosophy:** step-by-step with the build → demo → play → decide gate (see `projects/process/ENGINEERING.md` §5.9). No section advances until the previous one is built, demoed, and Patrick thumbs-up.

---

## What "v1" and "v2" mean

**v1 = everything that already exists.** The live built app (Phases A through E.2 — Foundation, Invoicing, Import/Categorization, Reports, Reconciliation), plus all backlog items (Categorize/Transactions/Invoices pages, Reconcile E.3, Reports, Dedupe hardening F1, Settings → Other, bulk triage, sub-hierarchies UI, accrual, inventory/COGS, multi-entity). All of it is now lumped together as **v1** — parked, not actively worked, may or may not carry forward into whatever gets built for real.

**v2 = the new design phase**, starting from the wireframe scope in this morning's session. v2 is grown by adding design features on top of this baseline, then built for real once the design feels complete enough. v1 does not get silently promoted into v2 — anything from v1 that should be in v2 needs an explicit Patrick call.

**In scope (v2 starting baseline + Phase 1 add):**
- Setup Wizard (6 steps: Welcome + 5 form steps, merged owner+identity+tax step, NAICS modal, edit-on-review)
- Categories Wizard (Welcome + Expense + Income + Other accounts + Review Later + Final review)
- Categories Management (single-page, search + 4 filter chips + Show hidden + clickable sort headers)
- Settings → General (business name, EIN, currency)
- Settings → Categories (default sort, show account numbers)
- **Phase 1: Chart of Accounts foundations** (added 2026-07-08) — D51–D67, §10A formal schema, GL skeleton page with D62-D66 manual-entry modal. Phase 1 design complete; not yet built.

**v1 (everything else — parked, not in v2 unless explicitly added):**
- Categorize / Transactions / Invoices pages
- Reconciliation (Phase E.1/E.2/E.3 work)
- Reports (Phase D: AR aging, Schedule C export, trial balance)
- Dedupe hardening (Phase F1)
- Settings → Other tab content
- Bulk triage screen
- Sub-hierarchies UI (`parent_id` schema field unused in UI)
- Accrual accounting method
- Inventory / COGS accounts
- Multi-entity beyond `sole_proprietor`

---

## Artifacts at v2 snapshot

| Artifact | Path | Lines | Bytes | Notes |
|---|---|---|---|---|
| Wireframe | `WIREFRAMES.html` | 1425 | ~88 KB | Single-file SPA. Open in browser, click around. Includes General Ledger page (Phase 1). |
| Spec | `SETUP_AND_CATEGORIES.md` | 868 | ~56 KB | 67 decisions (D1–D67), 38 behavior IDs in §13, §10A formal schema, GL columns locked (D59). |
| Smoke test | `tests/wf-smoke.mjs` (in repo) | ~670 | — | **221/221 passing** as of round 17 (2026-07-09). Local node_modules in `tests/.deps/` (gitignored) for jsdom. |

**Feedback archive** in same folder:
- `FEEDBACK-wireframes-2026-07-08.md` (round 1)
- `FEEDBACK-wireframes-2026-07-08-round3.md`
- `FEEDBACK-wireframes-2026-07-08-round4.md`
- `FEEDBACK-wireframes-2026-07-08-round6.md`
- `FEEDBACK-wireframes-2026-07-08-rounds-7-14.md`
- `FEEDBACK-wireframes-2026-07-08-phase1-design.md` (Phase 1, design complete)
- `FEEDBACK-wireframes-2026-07-09-round15.md` (Phase 1 cleanup)

**Disposable artifacts:** `wf-snap-*.{html,png}` in same folder (smoke-test screenshots). Untracked, fine to delete.

---

## How to extend v2

1. Patrick describes the new design feature (in chat, or as a feedback doc).
2. Update `WIREFRAMES.html` and `SETUP_AND_CATEGORIES.md` together (spec change always paired with wireframe change).
3. Extend the smoke test with new assertions for the new feature.
4. Append a `FEEDBACK-wireframes-YYYY-MM-DD-roundN.md` capturing what changed and why.
5. Commit with `docs(books): wireframes round N — <one-line summary>`.
6. Bump this v2 doc's status line + artifact row counts.

When v2 feels complete, we move to build phase. Build phase uses the build-demo-play gate per process doc.

---

## v2 scope rules (Patrick's 2026-07-08 17:15/17:17 MDT calls)

- The wireframe-from-this-morning is **the only thing considered v2-approved right now** (now extended to include Phase 1).
- Everything else — the live built app AND the backlog — is lumped together as **v1**. It may or may not be used going forward.
- Adding to v2 is intentional and Patrick-driven. Each addition is a deliberate design feature, not "we'll need this eventually."

---

## Phase roadmap (Virta Tasks → Rusty project → Backlog)

| Pos | Pri | Card | Status |
|---|---|---|---|
| 12 | high | Virta Books v2 (umbrella) | Active roadmap entry |
| 14 | high | Phase 1: Chart of Accounts foundations | ✅ Design complete (round 15 cleanup) |
| 15 | high | Phase 2: General Ledger architecture (incl. audit log) | ⏳ Next up |
| 16 | high | Phase 3: Customer records | ⏳ Pending |
| 17 | high | Phase 4: Invoicing | ⏳ Pending |
| 18–25 | med/low | Phases 5–12 (Vendors → Calendar) | ⏳ Pending |
| 26 | low | Phase 13: Reports | ⏳ Pending |
| (sep) | — | v3 candidates (sales tax, multi-user, recurring) | Parked |

**Phase 2 scope (preview):** Lock GL posting rules, lock the audit-log click-to-reveal pattern (where does the "audit" link live), and design the GL filter bar (date range + category + name — explicitly MVP per Patrick 2026-07-08). Reconciliation status semantics are deferred to Phase 9.

---

## Open questions carried into v2 work

These are NOT blockers for v2 design iteration. They're flagged so the next session can pick them up cleanly when Patrick brings them up.

1. ~~Spec hygiene: D29–D32 and D43–D49 each appear twice~~ — **DONE in round 15.** All 11 duplicates removed.
2. ~~Smoke test portability: `/tmp/wf-smoke.mjs` lives outside the repo~~ — **DONE in round 15.** Moved to `tests/wf-smoke.mjs`; local node_modules in `tests/.deps/` (gitignored).
3. ~~`WIREFRAMES.html` cleanups (sidebar stale counts, dead `state.activeTab`, legacy `catFilter` routing)~~ — **DONE in round 15.** All three items removed.
4. **Settings → Other tab content** is undefined in the spec. It exists in the wireframe (`renderSettings()` with `state.settingsTab === 'other'`) but renders an empty placeholder. Spec §11 (multi-entity / future-proofing) sketches what it could hold. **v1, not in v2 baseline.**
5. **E.2 demo `demos/2026.07.07-E2-reconcile.mp4`** is still UNREVIEWED. **v1** — blocks Reconcile-related work if v1 is ever resumed, but not relevant to v2.
6. **Wren's two Q1/Q2 design questions from 2026-07-06** are still unanswered. **v1** — blocks E.3 fix-pass if v1 is ever resumed. Not in v2 scope.
7. **GL filter bar** (date range, category, name) — Patrick said "for MVP" during Phase 1 design but didn't make it into the wireframe. Default: add to wireframe during Phase 2 design.

---

## Session-start handshake for v2

**Patrick's intended phrasing:** "Let's work on Virta Books v2" (or "continue v2", "add to v2", etc.)

**What I should do on hearing that:**
1. Read this doc (`VIRTA_BOOKS_V2.md`).
2. Read the wireframe (`WIREFRAMES.html`) and spec (`SETUP_AND_CATEGORIES.md`).
3. Confirm the v2 baseline is still what was committed at the latest `docs(books): wireframes…` commit — if not, surface the diff.
4. Ask Patrick what design feature to add next, or whether to start the build phase.

**What I should NOT do:**
- Pull in v1 scope (Categorize / Invoices / Reconcile / Reports / anything else already built or backlogged) without an explicit "add X to v2" call.
- Start building for real (writing React components, DB migrations, etc.) without an explicit "start build" call.
- Treat this doc as the only source of truth — the wireframe and spec are equally authoritative; this doc points at them.

---

## Change log

| Date | Change | Commit |
|---|---|---|
| 2026-07-08 17:15 MDT | v2 snapshot created. Baseline = round 1–14 wireframe close-out. | `b6b4d05` |
| 2026-07-08 17:17 MDT | Naming clarified: everything outside the v2 wireframe (live built app + backlog) is collectively **v1**. | `5034b43` |
| 2026-07-08 23:05 MDT | Phase 1 design complete (D51–D67, §10A, GL skeleton, D62 manual-entry modal). Wireframe + spec updated; smoke test 191/191 (pre-cleanup). | (uncommitted) |
| 2026-07-09 10:38 MDT | Phase 1 cleanup (round 15): spec dedupe of D29–D32/D43–D49; wireframe removed `state.activeTab` + dead `catFilter='revenue'/'ale'` router; smoke test moved into repo, 2 stale D61-assertions fixed + 11 new D62/D63/D64/D65 assertions + 11 dedupe/cleanup assertions. Smoke 216/216. | `23b2469` |
| 2026-07-09 11:10 MDT | Round 16: sidebar **General Ledger** link renamed to **Transactions** (D68). Functionally unchanged — `renderLedger()` still backs the page; only the user-facing nav label changed. Smoke 218/218. | `157bce0` |
| 2026-07-09 11:12 MDT | Round 17: default landing screen is **Dashboard** (D69), not Settings. Sidebar active-state moved accordingly. Smoke 221/221. | (pending) |
