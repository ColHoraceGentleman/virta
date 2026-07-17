# TASK — B2a-prime: Server-side routers (businesses, settings)

**Status:** RESUMING — Cinder B2a timed out at 4m8s after getting schema migration + NAICS JSON on disk. This brief picks up from there.
**Phase:** v2 Setup Wizard — server-side foundation. Steps 1-2 UI comes in B2a-wizard.
**Author:** Rusty
**Date:** 2026-07-13 15:38 MDT
**Branch:** `main`

---

## What's already on disk from Cinder B2a (read this first)

Cinder B2a made real progress before the runtime failed. **All of this is in the working tree, uncommitted:**

- ✅ `server/db.js` — full schema migration: `businesses` table, `settings` table, `accounts` CHECK constraint, NULL irs_line → '(unspecified)' fallback. 93 lines added, all additive. Hard rule #2 compliant.
- ✅ `client/src/assets/naics-2022.json` — 168KB bundled NAICS data (all 6-digit codes).
- ✅ `client/src/assets/naics-build.mjs` — the conversion script.

**What's NOT done** (your scope):

- ❌ `server/services/businessService.js` — business + settings CRUD
- ❌ `server/routes/books/businesses.js` — REST endpoints
- ❌ `server/routes/books/settings.js` — REST endpoints
- ❌ `server/index.js` — mount the new routers
- ❌ Demo
- ❌ Report

**Verify the schema first** by hitting the server: `curl http://localhost:3001/api/v1/health` should still return 200. If it 500s, the schema migration broke something — check `data/tasks.db` was backed up.

---

## Scope of THIS build (B2a-prime, server-only)

### 1. Business service

Create `server/services/businessService.js`:

- `getCurrentBusiness()` — returns the first business row (we're single-tenant v2), or `null` if none.
- `createBusiness(payload)` — inserts a new business row. Validates required fields per §4.1. Returns the row with `id` (generate UUID if not provided).
- `updateBusiness(id, payload)` — partial update. Returns the updated row.
- `getSettings(businessId)` — returns all key/value pairs for a business as `{ [key]: value }`.
- `updateSetting(businessId, key, value)` — upsert single setting.

For v2 single-tenant, the "current business" is just `WHERE id = 'default_business' OR ORDER BY created_at LIMIT 1`.

### 2. Business router

Create `server/routes/books/businesses.js`:

- `GET /businesses/current` — returns `{ data: business }` or `{ error: 'No business configured', code: 'NOT_FOUND' }` with 404.
- `POST /businesses` — creates. Body: full payload per §4.1. Returns `{ data: business }` with 201.
- `PATCH /businesses/current` — updates. Body: partial. Returns `{ data: business }` with 200.

Use the existing booksApi envelope convention (`{ data }` / `{ error, code }`).

### 3. Settings router

Create `server/routes/books/settings.js`:

- `GET /settings` — returns all settings for the current business as `{ data: { key: value, ... } }`.
- `PUT /settings/:key` — upsert. Body: `{ value }`. Returns `{ data: { key, value } }` with 200.
- `GET /settings/:key` — returns single setting as `{ data: { key, value } }` or 404.

### 4. Mount routers

Edit `server/index.js` (or wherever routers are mounted):

- Mount `businessesRouter` at `/api/v1/books/businesses`
- Mount `settingsRouter` at `/api/v1/books/settings`

Look at how existing routers are mounted for the pattern.

### 5. Files to touch

- `server/services/businessService.js` (new) — ~80 lines
- `server/routes/books/businesses.js` (new) — ~50 lines
- `server/routes/books/settings.js` (new) — ~40 lines
- `server/index.js` — 2-line edit (mount the routers)
- `client/src/books/api.js` — add `getCurrentBusiness`, `createBusiness`, `updateCurrentBusiness`, `getSettings`, `updateSetting`, `getSetting`. (~30 lines)

**Do NOT touch** `server/db.js` (schema is already done; don't re-run).

---

## Build behaviors (Test coverage)

| Behavior ID | Name | Verifies |
|---|---|---|
| VB-API-BIZ-01 | `GET /businesses/current` returns the seeded business row | ✓ |
| VB-API-BIZ-02 | `GET /businesses/current` returns 404 when no business exists | ✓ |
| VB-API-BIZ-03 | `POST /businesses` creates a business row with all fields | ✓ |
| VB-API-BIZ-04 | `PATCH /businesses/current` updates a business row | ✓ |
| VB-API-SET-01 | `GET /settings` returns all settings for current business | ✓ |
| VB-API-SET-02 | `PUT /settings/:key` upserts a single setting | ✓ |
| VB-API-SET-03 | `GET /settings/:key` returns single setting | ✓ |
| VB-API-SET-04 | `GET /settings/:key` returns 404 when key doesn't exist | ✓ |

---

## Definition of done

- [ ] Verify schema is intact (curl `/api/v1/health` should be 200).
- [ ] Business service has all 5 functions.
- [ ] Business router has 3 endpoints.
- [ ] Settings router has 3 endpoints.
- [ ] Routers mounted in `server/index.js`.
- [ ] `client/src/books/api.js` has all 6 client methods.
- [ ] All 8 behavior IDs covered.
- [ ] **Demo is OPTIONAL for this build.** The user will see the work when B2a-wizard adds the UI on top. If you have time, record a curl-based demo showing the endpoints working. Path: `demos/2026.07.13-b2a-prime-server-routers.mp4` (silent, 2-3 min).
- [ ] `CINDER_REPORT_b2a-prime.md` with Test coverage section.
- [ ] Committed (single commit OK).

## When done

Push a completion event with:
- 2-line summary
- Commit hash
- Demo path (or "no demo recorded, server-only build")
- Anything to flag for Wren
- Any out-of-scope findings

## Hard rules

- `trash` > `rm`. Don't make new schema changes — the schema is already in `server/db.js`.
- Don't edit Transactions.jsx, Categories.jsx, the wireframe HTML, or any _archived/ file.
- No pushing to origin.
- No sub-agent spawns.

## Why this is a focused build

~200 lines of server + client wiring. The schema is already done. The UI is a separate build. This is the smallest unit that gets the B2a brief to a state where the next Cinder spawn can build the wizard UI on a working server foundation.

If you finish well under 2 min and have time left, **stop and report done**. Don't start any UI work — that's B2a-wizard.
