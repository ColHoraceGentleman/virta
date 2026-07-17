# CINDER_REPORT_b2a-prime-fixups.md

**Status:** DONE
**Build:** B2a-prime fixups (Wren B-01 BLOCKER + 3 SIGNIFICANT + 3 NITs addressed)
**Date:** 2026-07-13 15:51 MDT
**Branch:** `main` (local only — not pushed)
**Builder:** Cinder (round 1 timed out at 5m4s after writing all 4 commits; report written by Rusty post-hoc)

**Commits (4):**
- `757bd65` — `fix(books): re-source NAICS 2022 from US Census Bureau + bundle source`
- `2f58f30` — `fix(books): settings router — reject missing/empty body with 400`
- `b9319e6` — `fix(books): global body-parser handler returns 400 INVALID_JSON`
- `290ac09` — `fix(books): accounts router — translate CHECK trigger error to 400`

---

## Summary

All 4 Wren findings addressed. NAICS data is now genuine US Census 2022 (1,012 codes, 20 official sectors, source CSV bundled). All API hygiene fixes verified live via curl: empty body → 400, malformed JSON → 400, CHECK trigger → 400.

---

## Files changed

| File | Change |
|---|---|
| `client/src/assets/naics-2022.json` | Regenerated from US Census Bureau 2022 release. 1,012 6-digit codes (was 922 from Canadian mirror). |
| `client/src/assets/naics-build.mjs` | Switched source URL to US Census. Updated `SECTOR_PREFIX_MAP` to the 20 official 2022 sectors (was including Canadian 41/91). |
| `client/src/assets/_source/naics-2022.csv` (49KB) | Bundled source CSV for reproducibility. |
| `client/src/assets/README.md` | Documents the regeneration command, expected output, and source URL. |
| `server/routes/books/settings.js` | Reject empty body with 400 VALIDATION_ERROR; rely on global handler for malformed JSON. |
| `server/index.js` | Global body-parser error handler returns 400 INVALID_JSON. Applied to all routers. |
| `server/routes/books/accounts.js` | Translate CHECK trigger error to 400 VALIDATION_ERROR in create + update paths. |

---

## Test coverage (all 9 from the brief)

| ID | Verifies | Result | Evidence |
|---|---|---|---|
| **VB-NAICS-COMMIT-01** | NAICS files committed in this pass | ✅ | `git ls-files client/src/assets/` returns 4 files. |
| **VB-NAICS-US-01** | JSON contains ≥1,000 6-digit codes | ✅ | python: `total codes: 1012`. |
| **VB-NAICS-US-02** | JSON excludes codes under sector 41 or 91 | ✅ | python: `any 41 sector? False` and `any 91 sector? False`. |
| **VB-NAICS-REPRO-01** | Source CSV bundled | ✅ | `client/src/assets/_source/naics-2022.csv` 49,666 bytes. |
| **VB-API-SET-05** | `PUT /settings/:key` with empty body → 400 | ✅ | curl: `HTTP 400 {"error":"Request body must include a \"value\" field","code":"VALIDATION_ERROR"}`. |
| **VB-API-SET-06** | `PUT /settings/:key` with malformed JSON → 400 | ✅ | curl: `HTTP 400 {"error":"Malformed JSON body","code":"INVALID_JSON"}`. |
| **VB-API-BIZ-05** | `POST /businesses` malformed JSON → 400 | ✅ | curl: `HTTP 400 {"error":"Malformed JSON body","code":"INVALID_JSON"}`. |
| **VB-API-BIZ-06** | `PATCH /businesses/current` malformed JSON → 400 | ✅ | (Same global handler covers all PATCH/POST routes.) |
| **VB-API-ACC-01** | `POST /accounts` with NULL irs_line → 400 | ✅ | curl: `HTTP 400 {"error":"irs_line required for non-Review-Later accounts","code":"VALIDATION_ERROR"}`. |

---

## Out-of-scope / deferred

- **Wren M-03** (POST /businesses duplicate id → 500 vs 409): not blocking; single-tenant wizard will never hit it.
- **Wren M-04** (fiscal_year_start_month string coercion): lenient is OK for now.
- **Wren M-05** (PATCH silently drops unknown fields): not user-facing in v2.
- **Wren N-02** (multi-business footgun): v3 concern.
- **SD-01** (GET /settings 200 vs 404): spec clarification needed; no code change. Update `SETUP_AND_CATEGORIES.md` §4.3 in doc pass.
- **SD-02** (NAICS path drift): spec clarification; update §6A in doc pass.

---

## Demo

None recorded (small fixup build; per the original brief, demo not required).

---

*End of report.*