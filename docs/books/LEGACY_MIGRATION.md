# Virta Books — Legacy Migration Plan

**Date:** 2026-07-17 14:59 MDT
**Author:** Rusty
**Trigger:** Patrick 2026-07-17 14:57 MDT — "fix it in GitHub, then rename the local project as an 'archived' legacy project."

---

## Purpose

Migrate Virta Books v2 development from Mac-mini-first to GitHub-first. The repo on GitHub becomes the source of truth for the v2-only state; the Mac mini holds a renamed "legacy" copy as a rollback safety net, then gets replaced with a fresh clone once we're confident in the GitHub state.

This is a workflow change, not a code change. The repo structure stays the same; only the source-of-truth location moves.

---

## Background — why we did this

Before 2026-07-17, the Mac mini working tree held a mix of v1 and v2 client surfaces (`client/src/books/_archived/` for v1, all other `client/src/books/*.jsx` for v2). When Patrick went to GitHub to look at the project, the mix was confusing — he couldn't tell what was v2-approved vs. v1-parked.

The v1 client surfaces are still useful as rollback reference (Phase A through E.2 work, ~6 months of accounting app history), but they shouldn't be on GitHub going forward.

**Patrick's call (2026-07-17 14:46 MDT):** "All v1 gone from GitHub so the repo is clean when poking around."

**Patrick's call (2026-07-17 14:57 MDT):** "Mac mini keeps the original structure; GitHub is fixed first; Mac mini gets renamed to legacy; when GitHub feels right, clone it back down."

---

## Migration phases

### Phase 1 — Stabilize GitHub as source of truth ✅ DONE (2026-07-17 14:55 MDT)
- Commit `c834067` pushed to `ColHoraceGentleman/virta`
- 18 files deleted on GitHub (17 v1 client files + 1 misplaced Tasks feature brief)
- `client/src/books/_archived/` no longer exists on GitHub
- Mac mini working tree keeps the deleted files as **untracked** working-tree entries (rollback safety net)
- `.gitignore` rules added to prevent accidental `git add -A` staging

### Phase 2 — Rename Mac mini project to "legacy" (pending Patrick)
When Patrick says "do it":
- Rename `/Users/colonelhoracegentleman/clawd/projects/task-manager` → `/Users/colonelhoracegentleman/clawd/projects/task-manager-legacy-v1`
- Update any local references:
  - launchd plists pointing at the old path (`ai.openclaw.task-manager`)
  - Cloudflare Tunnel config (`virta` tunnel id `e9db7f70-…`)
  - IDE bookmarks / workspace settings
  - Any cron jobs or scripts that reference the absolute path
- **CRITICAL:** Do NOT rename the project directory until the live site (https://virta.muckdart.com) is either:
  - Updated to point at the new path, OR
  - Confirmed running from a different mechanism (e.g., deployment from GitHub directly, not from the local checkout)
- Live URL `virta.muckdart.com` is configured for the current `task-manager` path; renaming without reconfiguring breaks the live site
- After rename: the legacy copy is preserved as historical reference; can be deleted whenever Patrick wants (not required)

### Phase 3 — Clone back down when GitHub feels stable (pending Patrick)
When Patrick says "GitHub feels right":
- `git clone https://github.com/ColHoraceGentleman/virta.git /Users/colonelhoracegentleman/clawd/projects/task-manager`
- This replaces the renamed-legacy path with a fresh v2-only working copy
- The legacy copy stays at `task-manager-legacy-v1` as historical reference
- Day-to-day work happens on this fresh clone
- End-of-session workflow: make commits locally, `git push` to GitHub at end of working session

### Phase 4 — Day-to-day workflow (after Phase 3)
- Develop against `/Users/colonelhoracegentleman/clawd/projects/task-manager` (fresh clone)
- Sub-agents (Cinder, Wren, Echo, Lore) read briefs and the local clone's files
- Commit frequently with conventional commit messages (`feat(books): …`, `fix(books): …`, `docs(books): …`, `chore(books): …`)
- Push to GitHub at end of each working session
- Pull at start of each working session
- The legacy `task-manager-legacy-v1` directory is reference-only; can be deleted whenever

---

## What's currently where (post Phase 1)

| Artifact | GitHub | Mac mini (current) |
|---|---|---|
| `client/src/books/_archived/` (17 v1 files) | ❌ Deleted at `c834067` | ✅ Intact, untracked, gitignored |
| `queued/TASK-completed-system-folder.md` | ❌ Deleted at `c834067` | ✅ Intact, untracked, gitignored |
| `client/src/books/*.jsx` (v2 surfaces) | ✅ All present | ✅ All present (tracked) |
| `docs/books/` (v2 design + reports) | ✅ All present | ✅ All present (tracked) |
| v1 server routes (`server/routes/books/{transactions,journal,accounts,…}.js`) | ✅ Intact | ✅ Intact (v2 surfaces still depend on them) |
| `client/src/books/_stub-template.jsx` | ✅ Intact | ✅ Intact (tracked) |

---

## Rollback story (if anything goes wrong)

### If the GitHub cleanup was wrong:
- Revert on GitHub: `git revert c834067 && git push origin main` (any user with repo write access can do this)
- Mac mini can re-pull to match: `cd task-manager && git pull` (this will delete the untracked v1 files locally, but they're in git history at `9f89737` so recoverable)

### If the Mac mini working tree was damaged:
- The v1 files are preserved at `/Users/colonelhoracegentleman/clawd/projects/task-manager/client/src/books/_archived/` (untracked but present)
- The legacy project is at the same path until Phase 2 renames it
- Recovery: `git checkout 9f89737 -- client/src/books/_archived/ queued/TASK-completed-system-folder.md` to re-track the v1 files locally

### If Phase 3 (clone back down) goes wrong:
- Legacy is still at `task-manager-legacy-v1` (or the original path if Phase 2 hasn't run yet)
- `rm -rf /Users/colonelhoracegentleman/clawd/projects/task-manager` (delete failed fresh clone)
- `mv /Users/colonelhoracegentleman/clawd/projects/task-manager-legacy-v1 /Users/colonelhoracegentleman/clawd/projects/task-manager` (rename legacy back)

---

## `.gitignore` protection rules (added in Phase 1)

The following rules were added to prevent accidental `git add -A` from staging the untracked v1 files on Mac mini:

```
# Mac mini legacy migration (Patrick 2026-07-17 14:57 MDT)
client/src/books/_archived/
queued/TASK-completed-system-folder.md
```

**Important:** These rules must be **removed** after Phase 3 completes. Once the fresh clone is in place, there are no untracked v1 files to protect, and the rules become dead weight (the directories don't exist in the fresh clone, so the rules are inert but confusing).

To remove them after Phase 3:
1. Edit `.gitignore` and remove the legacy migration block
2. Commit: `chore(books): remove legacy migration gitignore rules`
3. Push to GitHub

---

## What stays in v1 forever (decision record)

These v1 server routes **stay** on GitHub even though the v1 client surfaces are deleted, because v2 surfaces still depend on them:

- `server/routes/books/transactions.js` — backed by `/books/transactions` (v2 GL page) + ManualEntryModal
- `server/routes/books/journal.js` — journal entry POST for ManualEntryModal
- `server/routes/books/accounts.js` — Categories Wizard final POST writes accounts rows
- `server/routes/books/businesses.js` — Setup Wizard + Dashboard (v2)
- `server/routes/books/settings.js` — Setup Wizard + Categories Wizard toggle (v2)
- `server/routes/books/settings/*` — settings sub-routes (v2)

These are not "v1 leaks" — they're the v2 API surface that Phase 1+2 build delivered. They'll be gradually replaced as v2 Phases 2-4 ship new server work (GL filter bar, audit log, customer records, invoicing).

The remaining v1 server routes (customers, imports, invoices, payments, reconcile, reports, source-mappings, vendor-rules) are **truly v1** and were the foundation for Phases B-E.2. They could in theory be deleted, but doing so would break the existing `/books/transactions` reconciliation flow and `/books/categories` v1 stub if those features ever get used. **Conservative call: keep them.** AGENTS.md "greenfield reset" rule covers this — keep what the Phase 1+2 build actually needs; delete what it doesn't.

---

## Future work that needs the v1 files

These items would re-introduce v1 client code into the repo if worked on, and should be re-archived to `_archived/` or refactored into v2 surfaces:

1. **Phase C E.3** — 2 BLOCKERs + 1 SIGNIFICANT from `WREN_REVIEW_C.md` (2026-06-30). v1 territory, blocked if v1 is ever resumed.
2. **v1 BLOCKERs** — bulk-categorize double-UPDATE, PayPal/Venmo sign-convention naming. Would need a Cinder fix-pass.
3. **Wren's 2026-07-06 Q1/Q2 design questions** — still unanswered. v1 territory.

These are explicitly out of v2 scope per `VIRTA_BOOKS_V2.md` and should remain out unless Patrick explicitly adds them.

---

## Session-start handshake for legacy migration

When Patrick opens the project cold, check:

1. **Is this session pre-Phase-3?** (i.e., is `/Users/colonelhoracegentleman/clawd/projects/task-manager` the legacy copy with untracked v1 files?)
   - If yes: warn about `git add -A` risk; protect with current `.gitignore` rules
2. **Is this session post-Phase-3?** (i.e., is `/Users/colonelhoracegentleman/clawd/projects/task-manager` a fresh clone?)
   - If yes: remove the legacy migration block from `.gitignore`
3. **Is this session post-Phase-2?** (i.e., is the legacy at `task-manager-legacy-v1`?)
   - If yes: GitHub is the canonical state; legacy is reference-only

---

*Last updated: 2026-07-17 14:59 MDT by Rusty. Next update when Phase 2 or Phase 3 completes.*