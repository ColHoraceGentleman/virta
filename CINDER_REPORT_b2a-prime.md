# CINDER_REPORT — B2a-prime (server-side routers)

**Phase:** Setup Wizard Foundation — server-only
**Author:** Cinder (subagent)
**Date:** 2026-07-13 15:40 MDT
**Branch:** `main`
**Scope:** REST foundation for Setup Wizard — businesses + per-business settings.
**Status:** ✅ Complete. All 8 behavior IDs pass.

---

## What landed

Additive changes only. No DROP/CREATE/RENAME on existing tables (Hard Rule #2).

### Files added
- `server/services/businessService.js` (171 lines) — 5 export functions
- `server/routes/books/businesses.js` (69 lines) — 3 endpoints
- `server/routes/books/settings.js` (71 lines) — 3 endpoints

### Files modified (continued B2a work already on disk)
- `server/index.js` — 2 imports + 2 mounts (4 lines added)
- `client/src/books/api.js` — 6 client methods (9 lines added)

### Untouched (already on disk from B2a)
- `server/db.js` — schema migration (businesses + settings tables, accounts CHECK, NULL irs_line → '(unspecified)' fallback). Per the task brief: do not redo, do not re-run.
- `client/src/assets/naics-2022.json` + `naics-build.mjs`

---

## Endpoints exposed

Mounted under existing `/api/v1/books/*` namespace to match the convention used by every other books router:

| Method | Path | Behavior ID | Notes |
|---|---|---|---|
| GET    | `/api/v1/books/businesses/current`   | VB-API-BIZ-01 / 02 | Returns the singleton row, or 404 with `{ error, code: 'NOT_FOUND' }`. |
| POST   | `/api/v1/books/businesses`           | VB-API-BIZ-03 | Validates required fields (`proprietor_name`, `business_name`). 400 on validation, 201 with `{ data: business }` on success. |
| PATCH  | `/api/v1/books/businesses/current`   | VB-API-BIZ-04 | Partial update; bumps `updated_at`. 404 if no business. |
| GET    | `/api/v1/books/settings`             | VB-API-SET-01 | Returns `{ data: { key: value, … } }`. Empty map (not 404) when no business exists yet. |
| PUT    | `/api/v1/books/settings/:key`        | VB-API-SET-02 | Upsert (composite PK). Body is `{ value }`. |
| GET    | `/api/v1/books/settings/:key`        | VB-API-SET-03 / 04 | Single setting; 404 if missing. |

All responses use the existing envelope convention:
- success: `{ data: … }`
- error: `{ error: string, code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'SERVER_ERROR' }`

### Client methods (api.js)

```
booksApi.getCurrentBusiness()      → GET    /businesses/current
booksApi.createBusiness(data)      → POST   /businesses
booksApi.updateCurrentBusiness(d)  → PATCH  /businesses/current
booksApi.getSettings()             → GET    /settings
booksApi.updateSetting(key, value) → PUT    /settings/:key
booksApi.getSetting(key)           → GET    /settings/:key
```

---

## Service-layer shape (`businessService.js`)

- `getCurrentBusiness()` — `id='default_business'` sentinel, else first by `created_at`. Null if table empty.
- `createBusiness(payload)` — field whitelist, required-field validation, fiscal-year int 1-12 validation, generated UUID if no `id`.
- `updateBusiness(id, payload)` — partial update; bumps `updated_at`. Throws with `code='NOT_FOUND'` if missing.
- `getSettings(businessId)` → `{ [key]: value }`.
- `updateSetting(businessId, key, value)` — SQLite `ON CONFLICT … DO UPDATE` upsert. Coerces value to string.

Exports also include the raw `BUSINESS_FIELDS` whitelist and `REQUIRED_FIELDS` list, in case a future build (wizard validation) wants to reuse them.

---

## Test coverage — all 8 behavior IDs

| Behavior ID | Result | Evidence |
|---|---|---|
| VB-API-BIZ-01 GET /businesses/current returns seeded row | ✅ pass | After POST returned row with generated UUID; subsequent GET returned same row with HTTP 200. |
| VB-API-BIZ-02 GET /businesses/current returns 404 when no business exists | ✅ pass | Cleared DB → GET returned `{"error":"No business configured","code":"NOT_FOUND"}` with HTTP 404. |
| VB-API-BIZ-03 POST /businesses creates a business row with all fields | ✅ pass | Posted 14-field payload → 201 with full row echo including DB defaults (`country: 'US'`, `currency: 'USD'`). |
| VB-API-BIZ-04 PATCH /businesses/current updates a business row | ✅ pass | Patched 3 fields (`business_name`, `trade_name`, `ein`); GET showed them changed, `updated_at` advanced, other fields untouched. |
| VB-API-SET-01 GET /settings returns all settings for current business | ✅ pass | After 2 upserts, GET returned `{ "data": { "show_account_numbers": "false", "currency_display": "USD" } }`. |
| VB-API-SET-02 PUT /settings/:key upserts a single setting | ✅ pass | PUT same key twice with different values → DB showed latest value (idempotent, no duplicate rows). |
| VB-API-SET-03 GET /settings/:key returns single setting | ✅ pass | `GET /settings/show_account_numbers` returned `{ "data": { "key": ..., "value": ... } }` with HTTP 200. |
| VB-API-SET-04 GET /settings/:key returns 404 when key doesn't exist | ✅ pass | `GET /settings/does_not_exist` returned 404 with `{ error, code: 'NOT_FOUND' }`. |

### Edge cases also exercised

- **Missing required field on POST** → 400 `VALIDATION_ERROR` with message `proprietor_name is required`. Matches the journal-router validation pattern.
- **Upsert with new value overwrites** — confirmed `value` field updates in place rather than producing duplicates.

### State at end of smoke

DB cleared after testing so Wren sees the same starting state as a fresh user (no business, no settings). All tables are now empty.

---

## Out-of-scope findings (flagged for Rusty/Wren)

1. **Settings use-case for no-business state** — I chose to return `200 { data: {} }` from `GET /settings` when no business exists yet (the wizard hasn't run). The alternative was 404. Reasoning: the wizard's Step 5 (Settings & Categories) calls `GET /settings` to know `show_account_numbers` and `currency_display`. A 404 there would force the wizard to special-case "no business yet." An empty map is a cleaner contract: "no settings to read" is semantically distinct from "no business configured." **If Wren prefers the 404, it's a 1-line change in `routes/books/settings.js`.**

2. **PATCH /businesses/current uses the "current business" id internally** — it doesn't take an `:id` param. This matches the single-tenant v2 assumption in the brief. If a future multi-tenant build lands, the path will need to switch to `/businesses/:id` and the router will need an `id` resolution step. Out of scope for B2a-prime.

3. **No PUT for the whole settings object** — only per-key upsert. If the wizard's Step 5 wants to submit "all settings at once", it'll make N parallel PUTs. That's fine for the 2-3 keys we have today (`show_account_numbers`, `currency_display`). If Wren wants a single bulk endpoint later, easy add.

4. **NAICS JSON is already bundled** — `client/src/assets/naics-2022.json` + `naics-build.mjs` are on disk from B2a. The B2a-wizard build that lands the Step 2 NAICS picker can `import` from `client/src/assets/naics-2022.json` directly — no server endpoint needed (data is static).

5. **`server/db.js` still has the uncommitted B2a schema diff** — 93 lines, additive only. The commit for this build will include that diff alongside the new service + router files, since they're one logical change. Verified the server boots cleanly with the diff in place (`/api/health` returns 200, `/api/v1/books/health` returns full status).

---

## Demo

No demo recorded. This is a server-only build (the brief explicitly says demo is OPTIONAL) and the user-visible work lands when B2a-wizard adds the UI on top. A 2-3 minute curl walkthrough wouldn't add value over the test-coverage evidence above.

If the next build (B2a-wizard) wants a recorded demo of the server contract, it can record one after wiring the UI — that will be more useful than a CLI demo of `curl` against routes with no UI yet.

---

## Commit

Single commit pending with all 5 file changes (3 new, 2 modified). Hash will be reported in the completion event to main.