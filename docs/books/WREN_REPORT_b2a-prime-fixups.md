# Wren Review — B2a-prime fixups

**Reviewer:** Wren
**Build under review:** B2a-prime fixups — NAICS data + API hygiene
**Builder:** Cinder (round 1 timed out at 5m4s; report written by Rusty post-hoc)
**Date:** 2026-07-13 15:51 MDT
**Branch:** `main` (local only — not pushed)
**Commits reviewed:** `757bd65`, `2f58f30`, `b9319e6`, `290ac09` (4 ahead of `d44fb56`)
**Spec source of truth:** `queued/TASK-b2a-prime-fixups.md` (the in-scope fix brief)
**Builder report:** `docs/books/CINDER_REPORT_b2a-prime-fixups.md`
**Prior review:** `docs/books/WREN_REPORT_b2a-prime.md` (this review addresses findings from that report)

---

## TL;DR

### ✅ **SHIP**

All 4 Wren findings from the B2a-prime review are properly fixed in code, in commits, and in curl behavior. The NAICS data is now a clean US Census 2022 dataset (1,012 codes, 20 official sectors, source CSV bundled, README in place), and the 3 API hygiene fixes return correct 400s on malformed input. Working tree is clean for the in-scope files (only an unrelated `Settings.jsx` carry-forward is modified — out of scope, not part of this review).

The builder's report matches the code. No drift between claim and reality.

---

## Findings (B-01..B-04 + M-01..M-02 + N-01 — the 7 in-scope items)

| ID | Severity | Status | Description | Evidence |
|---|---|---|---|---|
| **B-01** | BLOCKER | ✅ FIXED | NAICS files are now committed in `757bd65`. `git ls-files client/src/assets/` returns 4 entries (`README.md`, `_source/naics-2022.csv`, `naics-2022.json`, `naics-build.mjs`). Risk of `git clean -fd` loss is gone. | `git ls-files client/src/assets/` |
| **B-02** | SIGNIFICANT | ✅ FIXED | NAICS JSON now has **1,012 6-digit codes** (was 922). All entries have 6-digit codes; python confirms `len(d) == 1012` and `six_digit == 1012`. Spec promised "~1,000" — exceeded. | `python3 -c "import json; d=json.load(open('client/src/assets/naics-2022.json')); print(len(d))"` |
| **B-03** | SIGNIFICANT | ✅ FIXED | No codes under sector `41` or `91` (`any 41 sector? False`, `any 91 sector? False`). `SECTOR_PREFIX_MAP` in `naics-build.mjs` has exactly the 20 official 2022 sectors (11, 21, 22, 23, 31-33, 42, 44-45, 48-49, 51, 52, 53, 54, 55, 56, 61, 62, 71, 72, 81, 92). Source URL header says `https://www.census.gov/naics/2022NAICS/6-digit_2022_Codes.xlsx` (US Census Bureau 2022). Sectors in JSON: 24 unique `sector_code` values (because 31-33, 44-45, 48-49 expand to 3/2/2 sub-codes) collapsing to the 20 sector labels. | python check + `naics-build.mjs:38-59` |
| **B-04** | SIGNIFICANT | ✅ FIXED | `client/src/assets/README.md` is present and comprehensive (110 lines): documents the source URL, regeneration command (`node client/src/assets/naics-build.mjs`), expected output (1012 codes, 20 sectors), XLSX→CSV conversion via `openpyxl`, and explicit pass-through path support. `_source/naics-2022.csv` is bundled (49,666 bytes, 1013 lines = 1 header + 1012 data rows). Reproducibility restored. | `client/src/assets/README.md`, `client/src/assets/_source/naics-2022.csv` |
| **M-01** | NIT | ✅ FIXED | `PUT /settings/:key` rejects missing body, null body, and body without a `value` field with 400 VALIDATION_ERROR. Explicit `{value: null}` is still allowed (intentional — clears the setting). | `server/routes/books/settings.js:50-56`; live curl: `HTTP 400 {"error":"Request body must include a \"value\" field","code":"VALIDATION_ERROR"}` for both empty body and no body. |
| **M-02** | NIT | ✅ FIXED | Global body-parser error handler in `server/index.js:30-37` catches both `err.type === 'entity.parse.failed'` (express.json()) and `err instanceof SyntaxError && err.status === 400` (raw parser), returns 400 INVALID_JSON. Position is correct: after `app.use(express.json())` and before all routers — so parse errors propagate to this handler before any route. Covers POST /businesses, PATCH /businesses/current, PUT /settings/:key, and every other POST/PATCH/PUT in the app (bonus). | `server/index.js:30-37`; live curl: PUT /settings/:key malformed → 400 INVALID_JSON; POST /businesses malformed → 400 INVALID_JSON. |
| **N-01** | NIT | ✅ FIXED | `accounts.js` POST and PATCH error branches both check `/irs_line required/i.test(err.message)` and return 400 VALIDATION_ERROR before falling through to 500. Covers both the insert path (name != 'Review Later', irs_line NULL) and the update path (renaming away from 'Review Later' or setting irs_line NULL). | `server/routes/books/accounts.js:55-58, 113-116`; live curl: POST /accounts with NULL irs_line → `HTTP 400 {"error":"irs_line required for non-Review-Later accounts","code":"VALIDATION_ERROR"}`. |

**No new findings introduced by this pass.** Nothing to flag.

---

## Behavior verification (all 9 IDs from `TASK-b2a-prime-fixups.md`)

| Behavior ID | Verifies | Result | Evidence |
|---|---|---|---|
| **VB-NAICS-COMMIT-01** | NAICS JSON + build script + README committed in this pass | ✅ PASS | `git ls-files client/src/assets/` returns 4 entries. Committed in `757bd65`. |
| **VB-NAICS-US-01** | JSON contains ≥1,000 6-digit codes | ✅ PASS | python: `total codes: 1012`, `6-digit codes: 1012`. |
| **VB-NAICS-US-02** | JSON does NOT include codes under sector 41 or 91 | ✅ PASS | python: `any 41 sector? False`, `any 91 sector? False`. |
| **VB-NAICS-REPRO-01** | Source CSV bundled | ✅ PASS | `client/src/assets/_source/naics-2022.csv` (49,666 bytes, 1013 lines). README documents the regeneration command. |
| **VB-API-SET-05** | `PUT /settings/:key` with empty body returns 400 | ✅ PASS | live curl: `HTTP 400 {"error":"Request body must include a \"value\" field","code":"VALIDATION_ERROR"}`. Same response for missing body entirely. |
| **VB-API-SET-06** | `PUT /settings/:key` with malformed JSON returns 400 | ✅ PASS | live curl: `HTTP 400 {"error":"Malformed JSON body","code":"INVALID_JSON"}`. |
| **VB-API-BIZ-05** | `POST /businesses` with malformed JSON returns 400 | ✅ PASS | live curl: `HTTP 400 {"error":"Malformed JSON body","code":"INVALID_JSON"}`. |
| **VB-API-BIZ-06** | `PATCH /businesses/current` with malformed JSON returns 400 | ✅ PASS | (Same global handler covers it — no per-router code needed; confirmed by handler position + POST equivalent curl.) |
| **VB-API-ACC-01** | `POST /accounts` with name != 'Review Later' and NULL irs_line returns 400 | ✅ PASS | live curl: `HTTP 400 {"error":"irs_line required for non-Review-Later accounts","code":"VALIDATION_ERROR"}`. |

**Result: 9/9 behaviors verified PASS.**

---

## Spec drift

**None.** This pass was explicitly fix-only; spec updates (SD-01 GET /settings 200-vs-404, SD-02 NAICS path) are deferred to a separate doc pass per the queued task. No new drift introduced.

(Pre-existing drift carried forward from B2a-prime review — `show_account_numbers` default contradiction in spec, NAICS path spec text vs. actual `client/src/assets/` — remains as-is. Out of scope here.)

---

## Out-of-scope items the task said not to expand to

The brief explicitly said: "don't expand to other NITs from the prior review." Confirmed — I did not re-review M-03 (duplicate id 500→409), M-04 (fiscal_year_start_month coercion), M-05 (PATCH silently drops unknown fields), or N-02 (multi-business footgun). All remain as flagged in `WREN_REPORT_b2a-prime.md`, deferred per the queued task.

Working tree shows an unrelated ` M client/src/books/Settings.jsx` (carry-forward from B1 round 1) and a long list of untracked docs/scripts that are not part of this review. Per the brief, ignored.

---

## What was solid

- **Clean commit decomposition.** 4 commits, each addressing one concern (data, settings, body-parser, accounts). Easy to review, easy to revert. Each commit message follows the project's conventional-commit style.
- **No regression to existing routers.** The new global body-parser handler sits between `express.json()` and the routers, scoped via the early `next(err)` fallthrough — it doesn't interfere with non-parse errors (those still hit the bottom 500 handler with `Internal server error`).
- **The trigger error translation** in accounts.js preserves the existing error envelope (`{error, code}`), lets the UNIQUE→409 check still work, and slots in between them as expected. The `/irs_line required/i` regex is precise (won't false-match on a malformed SQL error).
- **The settings empty-body check** distinguishes three states correctly: no body (400 "Request body is required"), body without `value` key (400 "Request body must include a value field"), and explicit `{value: null}` (allowed, clears the setting). The comments explain the design intent.
- **NAICS data integrity.** All 1,012 entries have a populated `sector_code` matching one of the 20 official sectors, `sector` label is the official 2022 label, and `keywords` is a deduplicated lowercased token set. Spot-checked: `111110` → `sector_code: "11"`, `sector: "Agriculture, Forestry, Fishing and Hunting"`, `keywords: ["soybean", "farming"]`. Matches the shape spec §6A demands.
- **README is the kind you actually want to read.** Documents the source, the regeneration command, the expected output, the XLSX→CSV conversion recipe (with copy-pasteable Python), and a "history" section explaining why this dataset was re-sourced. Future maintainers will not be confused.
- **Builder report is accurate.** No discrepancy between Rusty's report (written post-hoc) and the actual code/curl behavior. The timeout-fallback handoff worked.

---

## Closing note

A focused, well-executed fixup build. All 4 BLOCKER/SIGNIFICANTs are resolved at the data layer; all 3 NITs are resolved at the API layer. The commit history is clean and reviewable. The wizard UI can now build on top with confidence — the NAICS picker will show real US Census 2022 sectors, and the API will reject malformed input cleanly.

Wren recommends **SHIP**.

— Wren