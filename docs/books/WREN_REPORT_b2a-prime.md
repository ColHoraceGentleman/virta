# Wren Review — B2a-prime (server-only resume of B2a)

**Reviewer:** Wren
**Build under review:** B2a-prime — server REST foundation for Setup Wizard
**Builder:** Cinder
**Date:** 2026-07-13 15:40 MDT
**Commit:** `d44fb56` on `main` (1 ahead of `bf94529`)
**Spec source of truth:** `queued/TASK-b2a-prime-server-routers.md` + `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md` §4.1, §4.2, §4.3
**Builder report:** `docs/books/CINDER_REPORT_b2a-prime.md`

---

## TL;DR

### ⚠️ **SHIP WITH FIXES**

The server foundation is **functionally correct and the 6 endpoints behave as the spec demands** (all 8 behavior IDs verified via curl). The router mounting, service layer, schema migration, and trigger enforcement are all sound. **What blocks a clean ✅ SHIP is the NAICS data state** — the bundled JSON is in the working tree but was **not committed in `d44fb56` as the brief and the builder's report both claim**, contains **~80 fewer 6-digit codes than the spec promises**, and includes **two sector codes (41, 91) that don't exist in the US Census 2022 NAICS release** — strong evidence the source CSV is wrong (likely the Canadian NAICS list from BenDoyle/NAICS, not US Census 2022).

**Fix before B2a-wizard lands on top:**
1. Stage and commit `client/src/assets/naics-2022.json` + `naics-build.mjs` (the brief said "committed in d44fb56" — verify it's not, and amend the commit or land a follow-up).
2. Re-source the NAICS data from US Census 2022 release and regenerate, OR document the discrepancy and reduce the sector map to 20 official sectors.
3. Surface 3 small but real issues (see Findings B-04, M-02, M-03) as nits to fix in the same pass.

Everything else is solid. The wizard UI can land on this foundation.

---

## Findings

| ID | Severity | Description | File:line | Suggested fix |
|---|---|---|---|---|
| **B-01** | BLOCKER | `client/src/assets/naics-2022.json` (168 KB) and `naics-build.mjs` are **NOT committed in `d44fb56`**. Both the brief and the builder's report claim they are. `git ls-files` returns empty for both; `git status` shows `?? client/src/assets/`. Risk: a `git clean -fd` or a re-clone loses the data. | (working tree) | Amend `d44fb56` to include both files, OR commit them as a follow-up `feat(books): bundle NAICS data` before B2a-wizard. |
| **B-02** | SIGNIFICANT | NAICS JSON contains **922 6-digit codes**, not the spec's promised ~1,000 (spec §6A: "for all ~1,000 6-digit codes"; Census 2022 has 1,016 national industries). ~80 codes missing. | `client/src/assets/naics-2022.json` | Re-source from US Census 2022 NAICS release (`https://www.census.gov/naics/?58967?yearbcktrk=2022`), regenerate, re-commit. |
| **B-03** | SIGNIFICANT | JSON includes 72 codes under `sector_code: "41"` (e.g. 411110 Live Animal Wholesaler-Distributors) and 29 under `sector_code: "91"` (e.g. 911110 Defence Services). **41 and 91 are not valid 2022 NAICS sectors** (the US Census 2022 release uses 42 for Wholesale Trade and 92 for Public Administration; 41 was retired in 1997 and 91 was reorganized in 2017). This strongly suggests the source CSV is the **Canadian NAICS** list (likely BenDoyle/NAICS) rather than US Census 2022. | `client/src/assets/naics-build.mjs:30-50` (SECTOR_PREFIX_MAP) | Re-source from US Census, AND remove the `'41'` and `'91'` entries from `SECTOR_PREFIX_MAP` so they don't incorrectly capture Canadian codes if a re-source is partial. |
| **B-04** | SIGNIFICANT | The `naics-build.mjs` script is **not reproducible** in the sense the brief asked me to verify — I cannot re-run it (no source CSV present), and the build script header says `node client/src/assets/naics-build.mjs /tmp/naics.csv`. There is no committed source, no lock file, no checksum, and no CI hook. If someone needs to regenerate, they have to know to download the upstream CSV by hand. | `client/src/assets/naics-build.mjs:8-14` | Either (a) bundle the source CSV in `tmp-naics-source.csv` at the repo root, or (b) document the regeneration command in a `README.md` next to the JSON. |
| **M-01** | NIT | `PUT /settings/:key` with **no body at all** (or an empty body) returns 200 and silently creates a key with `value: null`. This makes it easy to typo-create settings with no value. | `server/routes/books/settings.js:36-44` (and `businessService.updateSetting`) | Reject with 400 if `req.body` is missing/empty or `value` is `undefined` (allow `null` explicitly). One-line change. |
| **M-02** | NIT | `PUT /settings/:key` with **malformed JSON** (e.g. body `not json`) returns **500 SERVER_ERROR** because Express's `express.json()` parser raises a SyntaxError that the try/catch doesn't translate. Other routers in this codebase (e.g. `journal.js`) return 400 on validation issues. | `server/routes/books/settings.js:36-44` | Add `express.json()`-style `SyntaxError` handling — return 400 `INVALID_JSON` for any body-parse failure. Same pattern needed in the other two POST/PATCH handlers in this router for consistency. |
| **M-03** | NIT | `POST /businesses` with an **explicit duplicate `id`** returns 500 SERVER_ERROR. The accounts router returns 409 CONFLICT for the same case. Inconsistent. | `server/routes/books/businesses.js:21-31` (and the accounts router for the parallel) | Add `if (err.message.includes('UNIQUE')) return res.status(409).json(...)` to the POST error branch. (Low priority — in v2 single-tenant the wizard always uses `generateId()`, so this would only fire on hand-crafted requests.) |
| **M-04** | NIT | `updateBusiness` accepts `fiscal_year_start_month` as a string (`"7"`) and silently coerces it. Slightly lenient, but not wrong — the spec doesn't require a specific type. Not blocking. | `server/services/businessService.js:60-65, 87-92` | Optional: add a stricter `typeof === 'number'` check. Leave as-is if the wizard might send a string. |
| **M-05** | NIT | `pickBusinessFields` silently drops unknown fields. `PATCH /businesses/current` with `{"not_a_field": "foo"}` returns 200 with the unchanged row. The client might think it updated something and didn't. | `server/services/businessService.js:32-38` and `server/routes/books/businesses.js:53-67` | Add a `console.warn` for dropped unknown fields, or include them in a `warnings: [...]` field of the response. Not strictly required. |
| **N-01** | NIT | `accounts` router does not translate the new B2a-prime trigger's `RAISE(ABORT, ...)` to a 400. So a POST `/accounts` with `name != 'Review Later'` and `irs_line = NULL` returns **500 SERVER_ERROR** instead of 400 VALIDATION_ERROR. The trigger is correct; the existing accounts router just doesn't catch this error class. | `server/routes/books/accounts.js:44-70` (pre-existing, but the trigger was added in B2a-prime) | Add a check in the create/update error branches: `if (/irs_line required/i.test(err.message)) return res.status(400).json({ error: msg, code: 'VALIDATION_ERROR' });`. Out of strict B2a-prime scope but worth fixing in the same commit since the trigger was added here. |
| **N-02** | NIT | Spec §4.1 implies `businesses` is the canonical "current business" singleton, but `getCurrentBusiness()` first tries `WHERE id = 'default_business'`, falling back to `ORDER BY created_at LIMIT 1`. This means a `POST /businesses` followed by another `POST /businesses` creates two rows; `GET /current` always returns the oldest. This is the v2 single-tenant assumption and is documented, but it means **the wizard must never POST a second business** (or it silently creates a phantom). | `server/services/businessService.js:42-50` | Either (a) add a uniqueness check in `createBusiness` (return 409 if a row already exists, unless `payload.id` matches), or (b) document explicitly in the wizard that POST is one-shot. The current behavior is not wrong, but it's a footgun. |

---

## Behavior verification

| Behavior ID | Verifies | Result | Evidence |
|---|---|---|---|
| **VB-API-BIZ-01** | `GET /businesses/current` returns the current business row | ✅ PASS | After `POST /businesses` with `{proprietor_name, business_name}`, `GET /businesses/current` → `200` `{data: <row>}`. |
| **VB-API-BIZ-02** | `GET /businesses/current` returns 404 when no business exists | ✅ PASS | With empty `businesses` table, `GET /businesses/current` → `404` `{"error":"No business configured","code":"NOT_FOUND"}`. |
| **VB-API-BIZ-03** | `POST /businesses` creates a business row with all fields | ✅ PASS | Minimal valid payload `{proprietor_name:"X", business_name:"Y"}` → `201` `{data: <row with generated uuid + defaults>}`. Full §4.1 payload also round-trips. |
| **VB-API-BIZ-04** | `PATCH /businesses/current` updates a business row | ✅ PASS | `PATCH` with `{business_name:"Renamed", trade_name:"TBR"}` → `200` `{data: <updated row>}`. Partial update works; only whitelisted fields apply. |
| **VB-API-SET-01** | `GET /settings` returns all settings for current business | ⚠️ PASS w/ spec drift | Returns `200` `{data: {}}` when no business exists — see SD-01. When a business exists and 3 keys are set, returns `200` `{data: {show_account_numbers: "true", tax_year_format: "2025", empty_value: null}}`. |
| **VB-API-SET-02** | `PUT /settings/:key` upserts a single setting | ✅ PASS | `PUT /settings/show_account_numbers` with `{value: "true"}` → `200` `{data: {key, value: "true"}}`. Upserts correctly via `ON CONFLICT(business_id, key) DO UPDATE`. |
| **VB-API-SET-03** | `GET /settings/:key` returns single setting | ✅ PASS | `GET /settings/show_account_numbers` → `200` `{data: {key, value: "true"}}`. Shape matches spec. |
| **VB-API-SET-04** | `GET /settings/:key` returns 404 when key doesn't exist | ✅ PASS | `GET /settings/does_not_exist` → `404` `{"error":"Setting not found: does_not_exist","code":"NOT_FOUND"}`. |

### Extra verification (not in spec, but I checked)

| Check | Result | Notes |
|---|---|---|
| Required-field validation on POST | ✅ | Missing `proprietor_name` → 400; whitespace-only `business_name` → 400 (via `String(v).trim() === ''` check). |
| `fiscal_year_start_month` range check | ✅ | 0, 13, 12.5 all → 400 with `'must be an integer 1-12'`. String `'7'` → 201 (lenient coercion). |
| `accounts` CHECK trigger fires on INSERT | ✅ | POST `/accounts` with `name='Trigger Test'`, no `irs_line` → **500** (trigger `RAISE(ABORT, 'irs_line required for non-Review-Later accounts')`). Should be 400 — see N-01. |
| `accounts` CHECK trigger allows 'Review Later' with NULL | ✅ | POST `/accounts` with `name='Review Later'`, no `irs_line` → 200. |
| `accounts` CHECK trigger fires on UPDATE | ✅ | PATCH existing account to set `irs_line=null` → 500. (Trigger covers `BEFORE UPDATE OF irs_line, name`.) |
| Migration is idempotent | ✅ | Re-running `db.js` is safe: triggers are checked before CREATE; `CREATE TABLE IF NOT EXISTS`; `UPDATE … WHERE irs_line IS NULL` only fires when `nullCount > 0`. |
| DB is fresh-empty | ✅ | At review time: 31 accounts, 0 with NULL `irs_line`, 0 with `'(unspecified)'` (no backfill ran because no seed data had NULLs). |
| `businesses` + `settings` table columns | ✅ | All §4.1 columns present (20 total = 17 user-facing + id + created_at + updated_at). All §4.3 columns present (3: business_id, key, value). |
| Router mounting in `server/index.js` | ✅ | `app.use('/api/v1/books/businesses', booksBusinessesRouter)` and `app.use('/api/v1/books/settings', booksSettingsRouter)` both present, between `journal` and `health` — consistent with the other books routers. |
| `api.js` client methods match server | ✅ | All 6 methods present (`getCurrentBusiness`, `createBusiness`, `updateCurrentBusiness`, `getSettings`, `updateSetting`, `getSetting`). Use `request()` helper which auto-unwraps `data` — consistent with the rest of the file. No envelope leakage. |
| Spec drift (SD-01): `GET /settings` 200 vs 404 | ⚠️ | See Spec drift section. |
| Spec drift (SD-02): NAICS path `client/src/assets/` vs spec's `server/src/books/data/` | ⚠️ | See Spec drift section. |
| NAICS file is in d44fb56 (per brief) | ❌ FAIL | See B-01. |
| NAICS has ~1,000 codes (per spec §6A) | ❌ FAIL | 922 codes. See B-02. |
| NAICS source is US Census 2022 (per spec §6A) | ❌ FAIL | Includes 41 and 91 sectors (Canadian, not US). See B-03. |

---

## Spec drift

### SD-01: `GET /settings` returns 200 with empty data instead of 404 when no business exists

**The drift:** Spec §4.3 describes `settings` as a per-business table but doesn't explicitly say what `GET /settings` should return when no business exists. The builder chose **200 with `data: {}`** (flagged in `CINDER_REPORT_b2a-prime.md`) on the rationale that the wizard's Step 5 (Settings) calls `GET /settings` before submission, and "no settings to read" is a cleaner contract than "no business configured."

**My take:** The builder's reasoning is sound. The wizard flow is:
- Step 6: create business (`POST /businesses`)
- Step 7/8: write settings (`PUT /settings/:key`)

The wizard's Step 5 may indeed call `GET /settings` to pre-populate — getting 200 `{}` lets the wizard treat "no settings yet" as a normal state without special-casing 404. Returning 404 would force every consumer to handle a 404-then-200 transition.

**Recommendation:** **Accept the drift, but update the spec** to explicitly document the contract: "`GET /settings` returns 200 with `{data: {}}` when no business exists. Returns 200 with `{data: {key: value, ...}}` otherwise." This is a one-line spec clarification that locks the contract for any future consumer.

### SD-02: NAICS JSON path

Spec §6A says: "a bundled offline JSON snapshot at `server/src/books/data/naics-2022.json`". Actual: `client/src/assets/naics-2022.json`. This is fine architecturally (the file is consumed by a client-side modal, not the server), but the spec is wrong. **Update the spec** to match the actual path: `client/src/assets/naics-2022.json`.

### Pre-existing spec inconsistencies (not introduced by B2a-prime, but worth noting)

- **Spec §4.3** says `show_account_numbers` default is `'true'` (line 179). Multiple other places (D27, §6 line 672, CW-013 line 824) say **default OFF**. The spec contradicts itself. Out of scope for B2a-prime — but B5 (Settings → General) will need to resolve this.
- **Spec §4.2** says `short_id` column should be added to `accounts`. It hasn't been. Pre-existing, out of scope.

---

## Out-of-scope findings (flagged, not in B2a-prime scope)

These are things I noticed that are **not part of B2a-prime** but worth surfacing to the right next-build owners:

1. **'Review Later' account has `is_system=0`** in the current DB. Spec §4.2 says `is_system` is the flag that "locks Review Later from delete/type-change." The seed should set it to 1. Pre-existing v1 issue. (Likely fix in B3a-categories-wizard-first-half or wherever Review Later gets re-seeded.)
2. **`accounts` router doesn't translate the new B2a-prime trigger to 400.** See N-01. The trigger is correct, but the existing accounts router's error handling leaks a 500. If fixed in the same B2a-prime commit, it's a 1-line change; otherwise it should land in the next router-touching build.
3. **NAICS data is uncommitted.** See B-01. This is the most urgent out-of-scope-by-mistake finding.
4. **NAICS source is likely Canadian, not US Census 2022.** See B-03. Needs a re-source before the wizard's NAICS modal lands (modal UX will show the wrong sector labels to the user if not).
5. **`Settings.jsx` has uncommitted modifications** (` M client/src/books/Settings.jsx` in working tree). Per the brief this is "carry-forward from B1 round 1, not part of this review." I didn't touch it.
6. **`POST /businesses` with explicit `id` collision** returns 500. See M-03. Low priority — wizard always uses `generateId()`.
7. **`PUT /settings/:key` with no body** silently creates a null-valued setting. See M-01.

---

## What was solid (no changes needed)

- **Schema migration is fully additive.** No DROP/CREATE/RENAME on existing tables. `CREATE TABLE IF NOT EXISTS` for the two new tables, trigger-based CHECK for accounts (the only correct way since SQLite can't `ALTER TABLE ADD CONSTRAINT`), idempotent one-time UPDATE for the irs_line backfill. Hard Rule #2 compliant.
- **Trigger is correctly written.** `BEFORE INSERT` and `BEFORE UPDATE OF irs_line, name` with `WHEN NEW.name != 'Review Later' AND NEW.irs_line IS NULL` — fires exactly when it should, allows exactly what it should.
- **Field whitelist + required-field validation in `createBusiness`** is tight. Unknown fields are dropped at the service layer (`pickBusinessFields`), and the wizard's two required fields (`proprietor_name`, `business_name`) are enforced server-side as a defense-in-depth.
- **Error envelope convention** matches the rest of the books API: `{data}` on success, `{error, code}` on failure. Stable error codes (`NOT_FOUND`, `VALIDATION_ERROR`, `SERVER_ERROR`) for client branching.
- **Client `api.js` methods** use the existing `request()` helper, auto-unwrap `{data}` via the `hasOwnProperty('data')` check, and follow the same shape conventions as `getInvoiceSettings`, `getAccount`, etc. No envelope leakage.
- **Router mounting order** in `server/index.js` is consistent with the existing pattern — between `journal` and `health`, with the same `app.use('/api/v1/books/X', XRouter)` shape. No middleware order surprises.
- **`getCurrentBusiness` is well-documented** about its single-tenant assumption and the `default_business` sentinel vs `ORDER BY created_at ASC` fallback. Clear, easy to grep.
- **Service exports include `BUSINESS_FIELDS` and `REQUIRED_FIELDS`** — these are not required by the spec but are useful for the wizard UI to introspect (and the export is harmless).
- **The builder's report** is honest: it flagged `GET /settings` 200-vs-404 as a deliberate design choice, called out the "single-tenant v2" assumption for `PATCH /current`, and noted the NAICS data was "carried from B2a round 1." (It incorrectly stated the NAICS data was "part of d44fb56" — see B-01.)

---

## Definition of done for SHIP WITH FIXES

For Rusty to flip the verdict to ✅ SHIP, the next Cinder pass (or a small follow-up commit) needs to:

1. **Stage and commit `client/src/assets/naics-2022.json` + `client/src/assets/naics-build.mjs`** (B-01). One-line fix; nothing structural changes.
2. **Resolve the NAICS source question** (B-02 + B-03). Either:
   - **(a) Re-source from US Census 2022** and regenerate via `naics-build.mjs` (preferred). 1,016 codes, no Canadian sectors, accurate `sector_code` values. Requires fetching the source CSV.
   - **(b) Document the discrepancy** in a `README.md` next to the JSON, and shrink `SECTOR_PREFIX_MAP` to remove the 41 and 91 entries (which would orphan the 101 Canadian codes — they would get the `'Other'` label from the fallback in `deriveSector`).
3. **Fix M-01** (PUT /settings/:key with no body returns 200). One-line guard.
4. **Fix M-02** (malformed JSON returns 500). Add SyntaxError handling.
5. **Fix M-03** (POST /businesses with duplicate id returns 500). One-line check in the create branch.
6. **Optional but recommended: fix N-01** (accounts router doesn't translate trigger ABORT to 400). This is the only finding where the B2a-prime code change (`server/db.js` trigger) is exposing a pre-existing weakness in a code path B2a-prime didn't otherwise touch.

If 1–4 land, the wizard UI can build on top with confidence. The other items (B-04, M-04, M-05, N-02) are nice-to-haves that can be deferred to the next round.

---

## Closing note

This is a focused, well-executed server build. Cinder hit the scope cleanly — the routers do exactly what the spec asks, the schema is additive, and the trigger enforces the constraint correctly. The one real problem (NAICS data is uncommitted and probably wrong-sourced) was hiding in plain sight in both the brief and the report; the actual code is fine.

Wren recommends **SHIP WITH FIXES** for the B2a-prime core, with the NAICS data fix landing before B2a-wizard begins.

— Wren
