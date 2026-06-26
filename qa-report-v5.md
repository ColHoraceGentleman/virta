# QA Report v5 — Virta Task Manager (MODERATE-1 re-test)

**Date:** 2026-06-26
**Tester:** Echo 🔍
**Build under test:** Cinder v5 (`CINDER_FIXES_5.md`)
**Scope:** Focused re-test of MODERATE-1 fix + minimal regression sanity

---

## Verdict: ✅ PASS

**MODERATE-1: FIXED.** Same category name in different projects now creates cleanly. Same name in same project still rejected with 409 CONFLICT. No regressions detected. Final DB state matches initial state exactly.

---

## 1. MODERATE-1 Fix Verification

**Bug:** `POST /categories {name:"Foo", projectId:"P1"}` then `{name:"Foo", projectId:"P2"}` returned 409 on the second call. Should be 200.

**Setup:** Created two fresh test projects `qa-p1-1761560000` and `qa-p2-1761560000`.

| # | Action | Expected | Got | Result |
|---|---|---|---|---|
| 1 | `POST /categories {name:"Foo", color:"#aaaaaa", projectId:P1}` | 200 | `200 {"data":{"id":"1569f5eb0f7575062aaf8a674d2951cf","name":"Foo",...,"project_id":"f825ebb33c5124bfe53ea2489f6ed02c","position":0}}` | ✅ PASS |
| 2 | `POST /categories {name:"Foo", color:"#bbbbbb", projectId:P2}` (different project) | 200 | `200 {"data":{"id":"f43bc2e1fa0251f89df152f55e970601","name":"Foo",...,"project_id":"20080714dd9f03cef44c425a67c64163","position":0}}` | ✅ PASS (was 409 before fix) |
| 3 | `POST /categories {name:"Foo", color:"#cccccc", projectId:P2}` (same project) | 409 CONFLICT | `409 {"error":"Category name already exists","code":"CONFLICT"}` | ✅ PASS |

**Per-project UNIQUE enforcement works correctly.** The composite `(name, project_id)` index is doing its job — different projects can share names, same project cannot.

### Row counts — before/after

| Table | Before tests | After tests | After cleanup | Match? |
|---|---|---|---|---|
| projects | 1 | 3 (1 original + 2 test) | 1 | ✅ |
| categories | 5 | 7 (5 original + 2 test "Foo") | 5 | ✅ |
| columns | 5 | 5 | 5 | ✅ |
| tasks | 16 | 16 | 16 | ✅ |

**Existing data preserved** — all counts match initial state. No data loss.

---

## 2. Schema Sanity

Ran the verification script against `./data/tasks.db` (read-only):

```
TABLE: CREATE TABLE "categories" (
        id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name       TEXT NOT NULL,
        color      TEXT NOT NULL DEFAULT '#6366f1',
        created_at TEXT DEFAULT (datetime('now')),
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        position   REAL DEFAULT 0
      )
HAS_UNIQUE_ON_NAME: false
INDEX: sqlite_autoindex_categories_1 → null
INDEX: idx_categories_name_project → CREATE UNIQUE INDEX idx_categories_name_project ON categories(name, project_id)
```

| Check | Expected | Actual | Result |
|---|---|---|---|
| `HAS_UNIQUE_ON_NAME` | `false` | `false` | ✅ |
| UNIQUE index on `(name, project_id)` | `idx_categories_name_project` | present, exact match | ✅ |
| Other UNIQUE indexes on `categories` | none | only `sqlite_autoindex_categories_1` (PRIMARY KEY backing) | ✅ |

Schema is correct. The legacy global UNIQUE on `name` is gone; the per-project composite UNIQUE is the only UNIQUE constraint on `categories`.

---

## 3. Quick Regression Sanity (4 tests, not the full suite)

| # | Test | Expected | Got | Result |
|---|---|---|---|---|
| 1 | `GET /api/v1/projects` | 200 with original Personal project | 200, includes `Green Seed` (id `ca272e5f2aa23e801b54fa09e48852a7`) | ✅ |
| 2 | `GET /api/v1/categories` | 200 with original 5 categories | 200, all 5 present (Data Labs, Green Seed, REDX, United Angels, WAVV) plus the 2 test Foo entries we created | ✅ |
| 3 | `GET /api/v1/categories/835a29849a808ac17303c70d070802e3` | 200 JSON, not HTML | `200 application/json; charset=utf-8` with proper category body | ✅ |
| 4 | `npm run build` | success | ✓ 46 modules transformed, built in 449ms, dist/ updated | ✅ |

**No regressions** — all 4 sanity checks pass.

---

## 4. Cleanup

| Action | HTTP | Result |
|---|---|---|
| `DELETE /api/v1/categories/1569f5eb0f7575062aaf8a674d2951cf` (Foo in P1) | 200 | removed |
| `DELETE /api/v1/projects/f825ebb33c5124bfe53ea2489f6ed02c` (P1, cascade) | 200 | removed |
| `DELETE /api/v1/projects/20080714dd9f03cef44c425a67c64163` (P2, cascade — removes Foo in P2) | 200 | removed |

**Final state** verified to match initial state: 1 project, 5 categories, 5 columns, 16 tasks.

---

## Detailed Findings

### What's working

1. **MODERATE-1 fully fixed.** The migration successfully removed the legacy global UNIQUE on `categories.name` and left the composite `(name, project_id)` UNIQUE in place. Same names across projects now work as expected.
2. **Service-layer error handling intact.** The 409 path with `code: "CONFLICT"` and `error: "Category name already exists"` still fires correctly when the same name is reused in the same project. The composite UNIQUE violation message (`UNIQUE constraint failed: categories.name, categories.project_id`) still contains the `UNIQUE` substring the route checks for.
3. **Cascade deletes work.** Deleting a project correctly cascades to its categories. Confirmed by deleting P2 (which held the second test "Foo") and observing that both P2 and the test category disappeared.
4. **Build is clean.** No TypeScript or Vite warnings.

### Out of scope (still MINOR, still tracked separately)

- **MINOR-1** (per v4): `createProject()` does not assign sequential positions. Still observed (P1 and P2 both have `position:0` after creation). Pre-existing, not part of this fix.
- **MINOR-2** (per v4): upload route basename reliance. Not exercised in this focused re-test.

### Loop/cost compliance

- 1 iteration only. Migration verified on first try. No retries needed.
- No sub-agents spawned.
- No service restarts.
- 3-iteration budget unused.

---

## Bottom Line

**MODERATE-1: FIXED.** Cinder's v5 migration in `server/db.js` correctly rebuilt the `categories` table to drop the legacy global UNIQUE on `name` and enforce a per-project UNIQUE on `(name, project_id)`. The functional test, schema check, and 4-point regression sanity all pass. The system is ready to ship the fix.

**Recommendation:** ✅ Accept v5. Mark MODERATE-1 as resolved.
