# Virta Books — Planning, briefs, reviews, and QA

> **Migrated from `~/clawd/projects/accounting-app/` on 2026-07-01** (Option B of the repo-layout decision: consolidate Books and Tasks into a single repo). The original `accounting-app/` directory is now archived at `~/clawd/projects/archive/accounting-app-pre-consolidation/` for historical reference.
>
> The canonical Books source code lives in `server/routes/books/` and `client/src/books/` (not here). This directory holds only the *documentation* about Books — the spec, the briefs, the reports, the reviews, and the QA scaffolding.

## What lives here

| Subdirectory | What it is |
|---|---|
| `ACCOUNTING-v1.md` | The canonical spec for Virta Books — chart of accounts, customers, invoices, payments, import, categorization, dedupe, reports, reconciliation, dashboard, asset register, build order. Read this first. |
| `CINDER_BRIEF_*.md` | Phase briefs I sent to Cinder (the builder agent) before each phase. One per phase, in chronological order. |
| `CINDER_REPORT_*.md` | Cinder's reports back to me after shipping each phase. Includes backup trail, migration diff, smoke tests, and Test coverage sections. |
| `CINDER_FIXES_*.md` | Older-style "FIXES" reports from the pre-report-template era. Same content shape as the REPORT files, different naming. (Phases A and B used this naming before we standardized.) |
| `ECHO_BRIEF_*.md` / `ECHO_REPORT_*.md` | Echo (the QA reviewer) briefs and reports. Currently only one pair (Phase C dedupe) — more will land after each phase's QA pass. |
| `WREN_REVIEW_*.md` | Wren (the code reviewer) reports. Phases A+B bundled, Phase C standalone. |
| `LORE_RESEARCH.md` | Lore's pre-build research from 2026-06-28 — competitor analysis, tech choices, gotchas. Reference only. |
| `qa/` | QA discipline scaffolding: `METHODOLOGY.md` (the discipline), `QA.md` (the behavior register for Books), `templates/` (brief templates for Cinder and Echo). |

## Why this moved

**Books and Tasks share a SQLite database, a Node server, a Cloudflare tunnel, and a deploy lifecycle.** They are operationally one product. Living in two repos meant:

- Two `.gitignore` files to keep in sync
- Two backup stories
- A manual mirror of the Books source code that occasionally went stale
- Two repos to clone when onboarding a developer

Consolidating into a single repo (where this directory lives) reflects operational reality and removes the mirror-sync tax. The QA scaffolding and planning docs now travel with the code they describe — when you clone `virta`, you get everything.

## Cross-references in older docs

Documents written before 2026-07-01 reference paths under `~/clawd/projects/accounting-app/...`. These are historical and have been left intact — they were correct at the time. New briefs and reports use the path under `docs/books/` (or relative paths from this directory).

## Multi-tenancy future work (not implemented)

When a non-family member wants to use Books (e.g., "Chantelle's friend wants to run her business in Books"), the work needed is substantial — `tenant_id` columns on every tenant-relevant table, query-layer filtering, an app-level auth model (sign-up + sessions), per-tenant Google OAuth, multi-tenant deployment. The repo decision (B) is independent of that work; when the time comes, a repo split can happen alongside the schema work. Today's `tenant_id` prep is to add the column (nullable) to any new table Cinder creates, so future work is a constraint flip rather than a refactor. See backlog for the trigger conditions.

## Change log

- 2026-07-01 — Migrated from `~/clawd/projects/accounting-app/`. Original archived at `~/clawd/projects/archive/accounting-app-pre-consolidation/`.
