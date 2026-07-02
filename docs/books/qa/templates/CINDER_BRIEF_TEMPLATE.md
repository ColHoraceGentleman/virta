# Cinder Brief Template — Copy, fill in, spawn

> Replace `[...]` with project-specific details. Do not change section structure unless the methodology (`qa/METHODOLOGY.md`) changes.
>
> **Companion templates:** see `qa/templates/ECHO_BRIEF_TEMPLATE.md` for the QA-execution brief format.

---

## Hard rules — read first, every time

These are non-negotiable. They come from real bugs that have caused data loss or wasted time on this project. If you find yourself about to violate one, **stop, surface to Rusty, do not "fix" it in flight**.

1. **If the migration breaks ANY existing data or fails unexpectedly, STOP and surface to Rusty before proceeding.** Do not try to "make it work" by being clever — report and step back. Document the failure in your report's "Backup & rollback trail" section.
2. **For SQLite migrations, FK enforcement interacts with DROP TABLE.** With `PRAGMA foreign_keys=ON`, `DROP TABLE parent` cascade-kills children that reference it via `ON DELETE CASCADE` on the *child*'s FK — same cascade you'd want during normal deletes. When migrating a parent table (rebuild/add constraint/rename), wrap the rebuild with `db.pragma('foreign_keys = OFF')` … migration body … `db.pragma('foreign_keys = ON')`. Hex IDs are preserved by `INSERT … SELECT` during the rebuild so children still resolve after the rename.
3. **Take a database backup before any schema-touching change.** `cp data/tasks.db data/backups/tasks-pre-<phase>-$(date +%s).db`. WAL mode produces `.db-shm` and `.db-wal` siblings — copy those too if the service is still running, or stop the service first.
4. **Idempotent migrations only.** Detect old schema via `PRAGMA table_info` or `SELECT sql FROM sqlite_master`. New code paths and migrations must be safe to run on a fresh DB and on a DB that's already migrated.
5. **Atomic writes wrap in `db.transaction(...)`.** Multi-statement deletes/inserts/updates get wrapped. (better-sqlite3 native transactions; they're fast and synchronous.)

---

## Header

**Goal:** [One sentence — what this build pass produces.]
**Read first (in this order):**
1. This brief (you're here).
2. `[<project>/]qa/METHODOLOGY.md` — the QA discipline (especially the "Test coverage appended" section below).
3. `[<project>/]qa/QA.md` — the existing behavior list. **Don't break any of these.**
4. `[<project>/ACCOUNTING-v1.md]` or equivalent spec — for definitions.
5. `[latest CINDER_REPORT_<phase>.md]` — what was just shipped (if applicable).
6. `[latest ECHO_REPORT_<phase>.md]` and/or `[latest WREN_REVIEW_<phase>.md]` — what was found in the last QA/review.

**Authoritative code paths (live):**
- `[<project>/server/<path/to/changed/file>.js]` — what to change.
- `[<project>/server/<path/to/shared/file>.js]` — adjacent code that might break.
- `[<project>/client/src/<path/to/changed/file>.jsx]` — frontend changes (if any).
- Live service: `[<URL:port>]`. Live DB: `[<path/to/db>]`. Live fronted URL: `[<https://…>]`.

**Live state right now:**
- Service phase: `[A/B/C/D/…]`. Counts: `[N transactions, M rules, K mappings, …]`. Health: `[OK/degraded]`.
- DB backups in `[<path/to/backups>]`. Recent: `[…]`.
- Last QA verdict: `[<SHIP / FIX-FIRST / NEEDS-DISCUSSION>]`.

---

## Scope and what NOT to touch

**Be specific:**
- ✅ Add `[feature]`.
- ✅ Modify `[behavior]`.
- ✅ Tests for `[new behavior]` — add to QA.md via Rusty after delivery (you append; Rusty curates).

**Be explicit:**
- ❌ Don't refactor `[unrelated area]`.
- ❌ Don't rewrite `[file]` — only patch the listed lines.
- ❌ Don't add features not in scope.

---

## Migration spec (if applicable)

If your task involves schema changes:

**Pattern reference:** `[<existing migration in db.js>]` (the categories rebuild is the canonical example for DROP/CREATE/INSERT/RENAME migrations).

- Detection: `[PRAGMA table_info check / sqlite_master SQL parse / etc.]`
- Backup: `cp data/tasks.db data/backups/tasks-pre-<phase>-$(date +%s).db` BEFORE touching `db.js`.
- Migration body: `[inline spec or pointer to code already in this brief]`.
- FK handling: see Hard Rule #2.
- Verification: `[PRAGMA checks + smoke tests + health check]`.

---

## Verification spec

What you test before declaring done. Always include:

1. **Schema check** (if schema changed): `[PRAGMA queries that confirm the new shape]`.
2. **Smoke tests** (the actual demo): `[3-5 scenarios, each with: action, expected result, verification command]`.
3. **No-regression checks**: pick 1-2 behaviors from QA.md that are *adjacent* to your changes and confirm they still work.
4. **Visual confirmation** (REQUIRED for any change to rendering, color, layout, typography, dark mode, or theme handling): actually open the affected view in the browser. Confirm the change looks right **in both light and dark mode** if the app supports dark mode. Capture a screenshot or a one-line note describing what you saw. Do NOT just verify the code path is reachable — the runtime rendering is the test. (Cinder shipped dark-mode category colors in 2026-07 that looked brighter than expected; the cause was a missed dark-mode toggle, not a code bug. This rule is the fix.)
5. **Live health**: confirm service health endpoint after restart.

---

## What you append to your report (REQUIRED for QA integration)

The QA discipline requires that your report has a `## Test coverage` section. After your changes land, your report (e.g., `CINDER_REPORT_<phase>.md`) must end with:

```markdown
## Test coverage

### Behaviors added (new in this phase)
For each new behavior, one line: ID + description. Format matches the IDs in `qa/QA.md`.

- **VB-AR-07** — AR aging report filters by customer (new filter UI).
- **VB-AR-08** — AR aging CSV export honors the same filter.

### Behaviors changed (semantics updated)
- **VB-CAT-04** updated — bulk-categorize now respects vendor rules.

### Behaviors verified (you re-tested these and they still pass)
- **VB-DED-07** — verified post-F1 that cascade works for the resolve-duplicate path.
```

Rusty folds these into `qa/QA.md` between phases. If you don't include this section, Rusty can't update the QA doc and Echo runs QA against a stale list. Do not skip.

---

## What you DON'T need to do

- Don't rewrite schema unless the brief specifies it.
- Don't refactor unrelated code.
- Don't promote yourself to Sonnet. Use `[minimax/MiniMax-M3]` primary as your config.
- Don't paper over bugs with workarounds. See Hard Rule #1.

## Deliverable

A single `[<project>/]CINDER_REPORT_<phase>.md` with:

1. **TL;DR** — one-line summary at the top (e.g., "Phase D shipped: AR aging + Schedule C CSV + trial balance"). Include the verification verdict.
2. **Backup & rollback trail** — what backups exist, how to restore.
3. **Migration diff** — lines added/removed across db.js, route files, services. Show actual diff snippets.
4. **Build details** — what was added, file by file. Inline code excerpts for non-trivial logic.
5. **Smoke tests** — output of each test, with expected vs. actual.
6. **Test coverage** — see the required section above.
7. **Open follow-ups** — anything you noticed but didn't address; gets added to backlog if Rusty agrees.

Use `minimax/MiniMax-M3` (your default). Take a backup first. Stay focused: this is `[N min]` pass for you, not a feature build.

---

## Final reminder

The QA doc is a living contract. Every Cinder delivery is the basis for the next Echo run. If your report's Test coverage section is missing or thin, Echo either over-tests (slow) or under-tests (bugs ship). It costs you 2 minutes to write it. It costs us weeks otherwise.

Push completion event to parent session when done. If a BLOCKER is found, escalate immediately via sessions_send.
