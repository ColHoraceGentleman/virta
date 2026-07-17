# Wren Review Brief — B2a-prime (server-only)

**Reviewer:** Wren
**Build under review:** B2a-prime — server REST foundation for Setup Wizard
**Builder:** Cinder (round 2 — round 1 hit a model timeout; B2a-prime resumed from where round 1 left off)
**Date:** 2026-07-13 15:40 MDT
**Branch:** `main`, 1 commit ahead of `bf94529`: `d44fb56`
**Spec source of truth:** `queued/TASK-b2a-prime-server-routers.md`
**Builder report:** `docs/books/CINDER_REPORT_b2a-prime.md`
**Schema migration:** `server/db.js` (93 lines, additive)

---

## What was built

**Server side:**
- `server/services/businessService.js` (5 functions: get/create/update business; get/update settings)
- `server/routes/books/businesses.js` (3 endpoints)
- `server/routes/books/settings.js` (3 endpoints)
- `server/index.js` (mount the routers)
- `server/db.js` (schema migration: businesses + settings tables, accounts CHECK, NULL fallback — committed in `d44fb56`)

**Client side:**
- `client/src/books/api.js` — 6 new client methods

**Bundled data (carried from B2a round 1, uncommitted now part of `d44fb56`):**
- `client/src/assets/naics-2022.json` (168KB)
- `client/src/assets/naics-build.mjs`

---

## What to review

Per Wren's discipline — design-level bugs, wrong action firing, contract drift, type confusion, edge cases that runtime QA might miss.

### A. Schema migration

- Confirm all 3 additions are additive (no DROP/CREATE/RENAME on existing tables).
- Confirm `accounts` CHECK constraint: `CHECK (name != 'Review Later' OR irs_line IS NOT NULL)` — verify it actually fires when it should.
- Confirm NULL → '(unspecified)' fallback ran correctly on existing seed data. List any accounts that got the fallback (should be a warning worth surfacing).
- Confirm `businesses` + `settings` tables exist with all 17 / 2 columns per §4.1 / §4.3.

### B. Business service (5 functions)

- `getCurrentBusiness()` — returns single-tenant row. Verify it picks the right row when multiple exist (or just the first).
- `createBusiness(payload)` — verify required-field validation per §4.1. Some fields are NULL-able, others NOT NULL with defaults. Confirm the boundary.
- `updateBusiness(id, payload)` — partial update. Verify it returns the updated row, not the old one.
- `getSettings(businessId)` — verify it returns `{[key]:value}` shape, not an array.
- `updateSetting(businessId, key, value)` — upsert. Verify INSERT OR REPLACE pattern.

### C. Business router (3 endpoints)

- `GET /businesses/current` — 404 when no row, 200 with `{data: business}` when exists. Verify the error envelope shape matches the rest of the books API: `{error, code}` not a bare string.
- `POST /businesses` — 201 on create, 400 on validation failure. Verify the response body includes the generated id.
- `PATCH /businesses/current` — resolves current-business id internally, then partial-updates. Verify it doesn't 404 spuriously (single-tenant v2 should not 404 when there's no business — should return an error or 400 instead).

### D. Settings router (3 endpoints)

- `GET /settings` — the **flagged behavior**: returns `{data:{}}` (200) when no business exists, not 404. Verify this is consistent with §4.3 spec or document why it differs.
- `PUT /settings/:key` — upsert. Verify it returns the upserted row, not the prior one. Verify body shape `{value: ...}` (not the full key+value object).
- `GET /settings/:key` — 404 when key doesn't exist. Verify the response body shape.

### E. Server mounting

- `server/index.js` — verify the new routers are mounted at `/api/v1/books/businesses` and `/api/v1/books/settings`. Verify middleware order (does auth run? Logger? body-parser?)
- Compare to how `journal.js` and `accounts.js` are mounted — the new routers should follow the same pattern.

### F. Client api.js

- New methods: `getCurrentBusiness`, `createBusiness`, `updateCurrentBusiness`, `getSettings`, `updateSetting`, `getSetting`.
- Verify they match the existing api.js patterns:
  - `async function name() { const res = await fetch(...); return res.json(); }`
  - Error handling consistent with the rest of the file
  - Query/body shape matches the server endpoints
- Verify return shape is the `data` field, not the whole envelope. (Check by reading what's used in consumers; this build has no UI consumer yet, so verify the convention by checking what other api methods return.)

### G. NAICS JSON bundling

- The 168KB JSON is committed in `d44fb56`. Verify it's valid JSON, parses cleanly, has the expected shape: `[{code, title, sector, keywords: []}, ...]`.
- Verify all ~1000 6-digit codes are present (the brief said "all 6-digit codes").
- Verify the `naics-build.mjs` script is reproducible — running it again produces the same JSON. Check that it's documented in a header comment.

### H. What you do NOT need to review

- The Setup Wizard UI component itself — that's B2a-wizard (separate build).
- The NAICS modal component — that's B2a-wizard.
- The Dashboard first-run experience — that's B2a-wizard.
- The BooksShell sidebar change — that's B2a-wizard.
- Settings.jsx (still in working tree as uncommitted modification from B1 round 1).
- Existing routers (journal.js, accounts.js) — they were not modified.
- Wireframe HTML, spec, smoke test.

---

## Output

Write `docs/books/WREN_REPORT_b2a-prime.md` with:

- TL;DR verdict: ✅ SHIP / ⚠️ SHIP WITH FIXES / ❌ BLOCKED
- Findings table (ID | Severity | Description | File:line | Suggested fix)
- Behavior verification table (each VB-API-* ID)
- Spec drift section (the `GET /settings` 200-vs-404 decision is the main thing)
- Out-of-scope findings section

Severity definitions unchanged from prior reviews.

## Hard rules

- `trash` > `rm`. No destructive commands.
- No edits to wireframe HTML, spec, smoke test, or any _archived/ file.
- No pushing to origin.
- No sub-agent spawns.
- **Look at the actual code, not just the report.** The report is the builder's claim; the code is the truth.

## Why this should be quick

Server-only build, ~200 lines of code, all under one commit. The scope is small and the contracts are simple. Don't expand the review — flag what you find, ship the rest.

Begin.