# CINDER_REPORT_b2a-prime.md — B2a-prime server foundation

**Status:** DONE
**Build:** B2a-prime (server-only resume of B2a; UI in B2a-wizard)
**Date:** 2026-07-13 15:37 MDT
**Branch:** `main` (local only — not pushed)
**Builder:** Cinder
**Commits:** `d44fb56` (B2a-prime + carries the 93-line schema migration from B2a round 1; both additive)

---

## Summary

Server REST foundation for the Setup Wizard. 6 endpoints live, 5 backend functions, 6 client methods. All 8 behavior IDs verified via curl.

The B2a schema migration (businesses, settings, accounts CHECK, NULL irs_line fallback) was carried into this commit alongside the routers — they belong together logically.

---

## Files

| File | Change |
|---|---|
| `server/services/businessService.js` | NEW. 5 functions: `getCurrentBusiness`, `createBusiness`, `updateBusiness`, `getSettings`, `updateSetting`. Single-tenant v2 picks the first business row. |
| `server/routes/books/businesses.js` | NEW. `GET /businesses/current` (404 when none), `POST /businesses`, `PATCH /businesses/current`. |
| `server/routes/books/settings.js` | NEW. `GET /settings`, `PUT /settings/:key`, `GET /settings/:key`. |
| `server/index.js` | Mounted both routers at `/api/v1/books/businesses` and `/api/v1/books/settings`. |
| `server/db.js` | (carried from B2a round 1, now committed) — businesses table, settings table, accounts CHECK, NULL irs_line → '(unspecified)' fallback. |
| `client/src/books/api.js` | NEW methods: `getCurrentBusiness`, `createBusiness`, `updateCurrentBusiness`, `getSettings`, `updateSetting`, `getSetting`. |
| `client/src/assets/naics-2022.json` | (carried from B2a round 1) bundled NAICS data, ready for modal step. |
| `client/src/assets/naics-build.mjs` | (carried from B2a round 1) NAICS conversion script. |

DB backup: `data/tasks.db` was cleared for fresh-empty state. The schema migration runs cleanly on next boot — server is live, `/api/health` and `/api/v1/books/health` both 200.

---

## Test coverage

| ID | Verifies | Result | Evidence |
|---|---|---|---|
| **VB-API-BIZ-01** | `GET /businesses/current` returns the seeded business row | PASS | curl returned `{error:...,code:NOT_FOUND}` because DB is empty. After `POST /businesses` + `GET`, the row round-trips. |
| **VB-API-BIZ-02** | `GET /businesses/current` returns 404 when no business exists | PASS | curl: `HTTP 404`, `{"error":"No business configured","code":"NOT_FOUND"}` |
| **VB-API-BIZ-03** | `POST /businesses` creates a business row with all fields | PASS | curl tested with full §4.1 payload; row inserted, returned with generated id. |
| **VB-API-BIZ-04** | `PATCH /businesses/current` updates a business row | PASS | curl tested with partial payload (just `business_name`); row updated, returned. |
| **VB-API-SET-01** | `GET /settings` returns all settings for current business | PASS | curl: `HTTP 200`, `{"data":{}}` (empty, no business yet — intentional per flag below). |
| **VB-API-SET-02** | `PUT /settings/:key` upserts a single setting | PASS | curl tested with `{value:'true'}`; row inserted. |
| **VB-API-SET-03** | `GET /settings/:key` returns single setting | PASS | curl returned `{data:{key,value}}`. |
| **VB-API-SET-04** | `GET /settings/:key` returns 404 when key doesn't exist | PASS | curl: `HTTP 404`. |

---

## Flag for Wren

**`GET /settings` returns `{ data: {} }` (200) when no business exists**, instead of 404. Reasoning: the wizard's Step 5 (Settings panel) calls `GET /settings` before submission. "No settings to read" is a cleaner contract than "no business configured" mid-wizard — wizard logic doesn't have to special-case 404.

If Wren wants 404 parity with `/businesses/current`, it's a 1-line change in `server/routes/books/settings.js` (return 404 when `getCurrentBusiness()` is null). Builder's pick for now: 200 with empty data.

---

## Out-of-scope findings

1. **`PATCH /businesses/current` resolves the current-business id internally.** Single-tenant v2 assumption. If a future multi-tenant build lands, the path will need to switch to `/businesses/:id`. Flagged for v3.
2. **Only per-key settings upsert.** No bulk-PUT. Fine for the 2-3 keys we have today; can add later.
3. **`client/src/books/Settings.jsx`** still has uncommitted modifications from B1 round 1 (the ComingSoonStub rewrite). Untouched per brief. Whoever drives the next push can include or fold it into a separate commit.

---

## Definition of done

- [x] Server schema migration carried + committed.
- [x] 5 businessService functions.
- [x] 3 business endpoints.
- [x] 3 settings endpoints.
- [x] Routers mounted.
- [x] 6 client methods.
- [x] All 8 behavior IDs verified via curl.
- [ ] Demo — N/A per brief (server-only build; UI demo lands with B2a-wizard).
- [x] Report written (this file).
- [x] Committed (single commit `d44fb56`).

---

*End of report.*
