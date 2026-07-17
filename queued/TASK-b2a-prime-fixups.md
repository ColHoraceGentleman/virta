# TASK — B2a-prime fixups: NAICS data + API hygiene

**Status:** Wren B2a-prime review identified 1 BLOCKER + 3 SIGNIFICANT + 3 NITs. Under B2a Protocol, Rusty decides BLOCKER/SIGNIFICANT. This brief covers the in-scope fixes.
**Phase:** v2 Setup Wizard — B2a-prime follow-up
**Author:** Rusty
**Date:** 2026-07-13 15:46 MDT
**Branch:** `main`

---

## Wren findings, this pass's scope

### BLOCKER (must fix)

**Wren B-01:** `client/src/assets/naics-2022.json` and `naics-build.mjs` are in the working tree but NOT committed in `d44fb56`. Real risk of data loss on `git clean -fd`.

**Fix:** Commit them with a follow-up commit (NOT amend — keep history clean).

### SIGNIFICANTs (must fix)

**Wren B-02:** NAICS JSON has **922 codes**, spec promises ~1,000.

**Wren B-03:** NAICS JSON includes sectors `41` and `91` which don't exist in US Census 2022 (they're Canadian NAICS from `BenDoyle/NAICS` mirror). The spec requires US Census 2022.

**Fix for B-02 + B-03 together:** Re-source from US Census 2022. Use one of:
1. Official US Census site: `https://www.census.gov/naics/?58967?yearbcktrk=2022` (download requires clicking through, may not be wget-able)
2. The `naics-build.mjs` script can pull from a Census API or alternative mirror
3. The most reliable path: use `https://github.com/naicscode/naics-code-list` or a confirmed-US-Census mirror

**Approach for B-02/B-03:**
1. Verify which data source the current `naics-build.mjs` uses.
2. If it's pulling from the Canadian mirror, switch to a confirmed US Census 2022 source.
3. The current `SECTOR_PREFIX_MAP` in `naics-build.mjs` includes sectors `41` and `91` — remove those entries; the official 2022 sectors are 11, 21, 22, 23, 31-33, 42, 44-45, 48-49, 51, 52, 53, 54, 55, 56, 61, 62, 71, 72, 81, 92. (20 sectors total: 18 single-digit + 2 ranges.)
4. Regenerate `naics-2022.json` from the corrected source.
5. Verify: should yield ≥1,000 6-digit codes (Census 2022 has 1,016 national industries).

**Wren B-04:** `naics-build.mjs` is not reproducible (no committed source CSV, no README).

**Fix:** Add a one-page README next to `naics-2022.json` documenting:
- Where to get the source (URL of the CSV/XLSX)
- The exact command to regenerate
- Expected output size and code count

If you can bundle the source CSV without bloating the repo too much (it's likely <500KB), do that. Otherwise, document the fetch URL.

### NITs (also fixing — all are API hygiene, cheap, prevents follow-up cycles)

**Wren M-01:** `PUT /settings/:key` with no body returns 200 with `value: null`.

**Fix in `server/routes/books/settings.js`:** Reject with 400 if `value` is `undefined` (allow explicit `null`).

**Wren M-02:** `PUT /settings/:key` with malformed JSON returns 500. Should be 400.

**Fix in `server/routes/books/settings.js`:** Catch `SyntaxError` from `express.json()` parser (or add a global body-parser error handler for this router) and return 400 `INVALID_JSON`. Apply same pattern to `POST /businesses` and `PATCH /businesses/current` for consistency.

**Wren N-01:** Existing `accounts` router POST/PATCH returns 500 when the new CHECK trigger fires (irs_line required for non-Review-Later). Should be 400 `VALIDATION_ERROR`.

**Fix in `server/routes/books/accounts.js`:** Add a check in create/update error branches: `if (/irs_line required/i.test(err.message)) return res.status(400).json({ error: msg, code: 'VALIDATION_ERROR' });`. Pre-existing file (not part of B2a-prime commit), but the trigger landed in B2a-prime, so fix in same pass.

### NOT in this pass (deferred / out of scope)

- **Wren M-03, M-04, M-05, N-02:** All NITs/cross-cutting concerns. Defer to a follow-up doc/code polish pass. Won't block B2a-wizard.
- **SD-01 (GET /settings 200 vs 404):** Spec clarification accepted. Update `SETUP_AND_CATEGORIES.md` §4.3 in a doc pass. Doesn't need code change.
- **SD-02 (NAICS path):** Spec clarification. Update §6A in a doc pass. Code is fine.

---

## Files to touch

- `client/src/assets/naics-2022.json` — regenerated from US Census 2022
- `client/src/assets/naics-build.mjs` — sector map fix (remove 41, 91); confirm US source URL
- `client/src/assets/README.md` (new) — regeneration docs
- `client/src/assets/naics-2022.csv` (new, if small enough) — bundled source for reproducibility
- `server/routes/books/settings.js` — empty-body 400 + JSON parse 400
- `server/routes/books/businesses.js` — JSON parse 400 (consistency with settings)
- `server/routes/books/accounts.js` — translate CHECK trigger error → 400

The NAICS source CSV if bundled should be added under a `client/src/assets/_source/` subfolder so it's clearly the source, not the runtime artifact.

---

## Build behaviors (Test coverage)

| Behavior ID | Name | Verifies |
|---|---|---|
| VB-NAICS-COMMIT-01 | NAICS JSON + build script + README committed in this pass | ✓ |
| VB-NAICS-US-01 | JSON contains ≥1,000 6-digit codes | ✓ |
| VB-NAICS-US-02 | JSON does NOT include codes under sector `41` or `91` | ✓ |
| VB-NAICS-REPRO-01 | Bundle source CSV (or document fetch URL clearly in README) | ✓ |
| VB-API-SET-05 | `PUT /settings/:key` with empty body returns 400 (not 200) | ✓ |
| VB-API-SET-06 | `PUT /settings/:key` with malformed JSON returns 400 (not 500) | ✓ |
| VB-API-BIZ-05 | `POST /businesses` with malformed JSON returns 400 | ✓ |
| VB-API-BIZ-06 | `PATCH /businesses/current` with malformed JSON returns 400 | ✓ |
| VB-API-ACC-01 | `POST /accounts` with name != 'Review Later' and NULL irs_line returns 400 (not 500) | ✓ |

---

## Definition of done

- [ ] NAICS JSON regenerated from US Census 2022 (≥1,000 codes, no 41/91 sectors).
- [ ] NAICS build script uses confirmed US source URL; sector map limited to 20 official 2022 sectors.
- [ ] README added documenting regeneration.
- [ ] Source CSV bundled (preferred) or fetch URL clearly documented.
- [ ] PUT /settings empty body → 400.
- [ ] PUT /settings malformed JSON → 400.
- [ ] POST /businesses malformed JSON → 400.
- [ ] PATCH /businesses/current malformed JSON → 400.
- [ ] POST /accounts with irs_line NULL → 400.
- [ ] All 9 behavior IDs verified.
- [ ] Committed in logical chunks (1 commit per concern: "data", "settings", "businesses", "accounts").
- [ ] CINDER_REPORT_b2a-prime-fixups.md written.

## When done

Push a completion event with:
- 2-line summary
- Commit hashes
- Anything still flagged for Wren

## Hard rules

- `trash` > `rm`. Make a fresh DB backup if you touch schema (you don't — no schema changes here).
- Don't edit wireframe HTML, spec, smoke test, _archived/ files.
- Don't push to origin.
- No sub-agent spawns.

---

## Why this is a focused build

Small, focused, all 9 behavior IDs are simple verifications. NAICS re-source is the longest task; everything else is 1-line fixes. If you finish well under 2 min, stop and report done.
