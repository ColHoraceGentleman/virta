# Virta Books v2 — Snapshot & Working Doc

**Status:** v2 design phase (NOT build phase). Wireframe + spec complete after rounds 1–14 on 2026-07-08.
**Started:** 2026-07-08 17:15 MDT (Patrick's call after session close-out).
**Build philosophy:** step-by-step with the build → demo → play → decide gate (see `projects/process/ENGINEERING.md` §5.9). No section advances until the previous one is built, demoed, and Patrick thumbs-up.

---

## What "v2" means

The wireframe scope from this morning's session is the **v2 starting baseline**. Everything else (Categorize, Invoices, Reconcile, Reports, etc.) is **deep v1 backlog** — may or may not survive into a real build. v2 will be grown by adding design features on top of this baseline, then built for real once the design feels complete enough.

**In scope (v2 starting baseline, 2026-07-08 close-out):**
- Setup Wizard (6 steps: Welcome + 5 form steps, merged owner+identity+tax step, NAICS modal, edit-on-review)
- Categories Wizard (Welcome + Expense + Income + Other accounts + Review Later + Final review)
- Categories Management (single-page, search + 4 filter chips + Show hidden + clickable sort headers)
- Settings → General (business name, EIN, currency)
- Settings → Categories (default sort, show account numbers)

**Out of scope for v2 baseline (deep v1 backlog — design TBD, may or may not be added to v2):**
- Categorize / Transactions / Invoices pages
- Reconciliation (Phase E.1/E.2/E.3 work)
- Reports (Phase D: AR aging, Schedule C export, trial balance)
- Dedupe hardening (Phase F1)
- Settings → Other tab
- Bulk triage screen
- Sub-hierarchies UI (`parent_id` schema field unused in UI)
- Accrual accounting method
- Inventory / COGS accounts
- Multi-entity beyond `sole_proprietor`

---

## Artifacts at v2 snapshot

Both on disk, both committed in commit `b9300b4 docs(books): session-close feedback doc — rounds 7-14 summary` (HEAD on `main`).

| Artifact | Path | Lines | Bytes | Notes |
|---|---|---|---|---|
| Wireframe | `WIREFRAMES.html` | 1343 | 82 KB | Single-file SPA. Open in browser, click around. |
| Spec | `SETUP_AND_CATEGORIES.md` | 790 | 51 KB | 60 decisions (D1–D50, some duplicated across rounds), 31 behavior IDs in §13. |

**Smoke test:** `/tmp/wf-smoke.mjs` (NOT in repo) — 172/172 assertions passing as of session close-out.

**Feedback archive:** five FEEDBACK-*.md files in same folder — round 1, 3, 4, 6, 7-14. Round-by-round reasoning for every Patrick-visible change.

**Disposable artifacts:** `wf-snap-*.{html,png}` in same folder (smoke-test screenshots from rounds 2/3/4). Untracked, fine to delete.

---

## How to extend v2

1. Patrick describes the new design feature (in chat, or as a feedback doc).
2. Update `WIREFRAMES.html` and `SETUP_AND_CATEGORIES.md` together (spec change always paired with wireframe change).
3. Extend the smoke test with new assertions for the new feature.
4. Append a `FEEDBACK-wireframes-2026-07-08-roundN.md` (or new-date) doc capturing what changed and why.
5. Commit with `docs(books): wireframes round N — <one-line summary>`.
6. Bump this v2 doc's status line + artifact row counts.

When v2 feels complete, we move to build phase. Build phase uses the build-demo-play gate per process doc.

---

## v2 scope rules (Patrick's 2026-07-08 17:15 MDT call)

- The wireframe-from-this-morning is **the only thing considered v2-approved right now**.
- Anything not in that wireframe is **deep v1 backlog that may or may not be used** — do not silently promote it into v2.
- Adding to v2 is intentional and Patrick-driven. Each addition is a deliberate design feature, not "we'll need this eventually."

---

## Open questions carried into v2 work

These are NOT blockers for v2 design iteration. They're flagged so the next session can pick them up cleanly when Patrick brings them up.

1. **Spec hygiene:** `SETUP_AND_CATEGORIES.md` has duplicate D-rows (D29, D30, D31, D32, D43–D49 each appear twice — once from each round that touched them). Content is consistent across duplicates (later is the canonical version). Cosmetic fix: dedupe the table. Low priority.
2. **Smoke test portability:** `/tmp/wf-smoke.mjs` lives outside the repo. If we want CI to run it, it should move into the repo (e.g. `docs/books/setup-wizard/tests/wf-smoke.mjs`).
3. **`WIREFRAMES.html` cleanups** (also flagged in session-close handoff, not blocking):
   - Sidebar stale counts `Income (4) / Expenses (18) / Other (8)` — hardcoded markup leftover, not visible after round 7's collapse to single Categories link.
   - `state.activeTab` dead code since round 5.
   - Legacy `catFilter` routing at bottom of script — unreachable after round-7 collapse.
4. **Settings → Other tab content** is undefined in the spec. It exists in the wireframe (`renderSettings()` with `state.settingsTab === 'other'`) but renders an empty placeholder. Spec §11 (multi-entity / future-proofing) sketches what it could hold. **Not in v2 baseline.**
5. **E.2 demo `demos/2026.07.07-E2-reconcile.mp4`** is still UNREVIEWED. Blocks Reconcile-related work but not v2 baseline. (Reconcile is out of v2 scope anyway.)
6. **Wren's two Q1/Q2 design questions from 2026-07-06** are still unanswered. Block E.3 fix-pass. Not in v2 scope.

---

## Session-start handshake for v2

**Patrick's intended phrasing:** "Let's work on Virta Books v2" (or "continue v2", "add to v2", etc.)

**What I should do on hearing that:**
1. Read this doc (`VIRTA_BOOKS_V2.md`).
2. Read the wireframe (`WIREFRAMES.html`) and spec (`SETUP_AND_CATEGORIES.md`).
3. Confirm the v2 baseline is still what was committed at `b9300b4` — if not, surface the diff.
4. Ask Patrick what design feature to add next, or whether to start the build phase.

**What I should NOT do:**
- Pull in Categorize / Invoices / Reconcile / Reports scope without an explicit "add X to v2" call.
- Start building for real (writing React components, DB migrations, etc.) without an explicit "start build" call.
- Treat this doc as the only source of truth — the wireframe and spec are equally authoritative; this doc points at them.

---

## Change log

| Date | Change | Commit |
|---|---|---|
| 2026-07-08 17:15 MDT | v2 snapshot created. Baseline = round 1–14 wireframe close-out. | (this doc, not yet committed) |