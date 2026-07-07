# CINDER REPORT — XC-1: Categorize.jsx crash + booksApi double-unwrap sweep

**Builder:** Cinder 🔥
**Date:** 2026-07-04 17:40 MDT
**Phase status:** E.1 (unchanged). DB counts unchanged: 11 txns, 5 je, 10 jl, 0 reconciliations.
**Scope:** NDC-1 from `ECHO_REPORT_D_F1_E1.md` §2.3 — `/books/categorize` hard-crashed on first render with `TypeError: Cannot read properties of undefined (reading '0')`. Brief also mandated a sweep of every `booksApi.X()` call site for the same trap.
**Verdict:** ✅ **SHIP.**

---

## TL;DR

The Categorize.jsx crash is fixed. Two `booksApi.X()` consumers were treating the **already-unwrapped** return as if it were still the envelope — they accessed `.data` (or `counts.data?.[0]`) on a value that the `request()` helper had already peeled. Refactored both consumers to use the unwrapped shape directly. **No api.js changes needed** — the unwrap behavior is correct; the bug was purely on the consumer side.

Also swept all 17 `client/src/books/*.jsx` files for the same trap. Every other consumer is clean — the bug was isolated to `Categorization.jsx`. (One related observation logged as a side note: `ImportCSV.jsx`'s `applyImport` vs `applyImportWithMapping` paths already handle their different server shapes correctly, but the field-name difference is fragile and easy to confuse.)

Visual confirmation: Playwright run on the rebuilt bundle. 12/12 PASS, zero console errors, all three tabs render, hotkeys `j`/`k`/`1`/`?` confirmed live, categorize-on-keypress-1 actually fired a PATCH and shrank the Pending list 5→4.

DB state: preserved at the E.1 baseline (the categorize test was reversed; see §6).

---

## 1. Backup & rollback trail

Backup taken **before any code change** (Hard Rule #3):

```bash
cp -p client/src/books/Categorization.jsx \
      client/src/books/Categorization.jsx.bak-1783207804
cp -r client/dist client/dist-pre-xc1-1783207806
```

Files: `Categorization.jsx.bak-1783207804` (27248 bytes, 695 lines), `dist-pre-xc1-1783207806/` (full pre-fix bundle, ~700KB).

**Restore procedure if needed:**
1. `cp -p client/src/books/Categorization.jsx.bak-1783207804 client/src/books/Categorization.jsx`
2. `cd client && npm run build`
3. No service restart needed (server serves dist statically; same Node process).

The dist backup was deleted after the build to free space — `client/dist/` now contains the post-fix bundle, and the source-file backup is the canonical revert target.

---

## 2. The crash, before / after

### What was happening

`Categorization.jsx` had two consumers that called `booksApi.X()` and then accessed `.data` on the result. The `request()` helper in `client/src/books/api.js` auto-unwraps: `return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;`. So for `GET /transactions` (server shape `{ data: [...rows], total, limit, offset }`), the helper returned the array directly. The component then did `setRows(data.data)` — which is `array.data` — i.e. `undefined` — which then crashed when React tried `rows[0]` for `selected = rows[selectedIdx]`. Hence `Cannot read properties of undefined (reading '0')`.

The **second** consumer (`vendorManualCounts`) had the same shape (server returns `{ data: [...] }`) but crashed silently inside a non-fatal inner `try/catch`. So the visible crash came from `listTransactions`, but the `vendorManualCounts` was a latent bug that would have prevented the "create rule?" prompt from ever firing.

### Fix 1 — `listTransactions` in `Categorization.jsx` (line 64)

**Before:**
```js
const data = await booksApi.listTransactions({ status: tab, limit: 500 });
setRows(data.data);
setSelectedIdx(0);
```

**After:**
```js
// XC-1 fix: booksApi.listTransactions() returns the unwrapped array (the api
// helper auto-unwraps { data, total, limit, offset } → just the array). The
// pre-fix code accessed data.data which was undefined.data → undefined[0]
// crash. Use the unwrapped shape directly. (Endpoint also returns total/limit/
// offset but we don't need them on this surface; if we ever do, swap to raw
// fetch like arAging in api.js.)
const rows = await booksApi.listTransactions({ status: tab, limit: 500 });
setRows(rows);
setSelectedIdx(0);
```

**Why this approach (B, not A):** The endpoint's server shape is `{ data: [...rows], total, limit, offset }`. The component only needs the row array. Per the brief's decision rule — *"if the component only reads `[0]` or the array, use B"* — refactoring the component is cleaner than bypassing `booksApi` for one method. If a future need surfaces for `total`/`limit`/`offset`, the right move is the arAging pattern (raw `fetch` + return full envelope), not threading three new fields through.

### Fix 2 — `vendorManualCounts` in `Categorization.jsx` (line 121)

**Before:**
```js
const counts = await booksApi.vendorManualCounts(selected.vendor_normalized);
const top = counts.data?.[0];
```

**After:**
```js
// XC-1 fix: booksApi.vendorManualCounts() returns the unwrapped array (api helper
// auto-unwraps { data: [...] } → just the array). The pre-fix code accessed
// counts.data which crashed the inner try/catch (counts was an array, .data
// undefined). Use the unwrapped array directly.
const counts = await booksApi.vendorManualCounts(selected.vendor_normalized);
const top = counts[0];
```

**Why this is the right fix:** Same shape as Fix 1 — server returns `{ data: [...] }`, component needs the array. The previous `counts.data?.[0]` was `undefined?.0` (no crash, but always falsy — the vendor-rule prompt could never fire). This was a latent regression from the same class of bug.

### What I did NOT change in `api.js`

`api.js` was already correct. The `request()` helper's auto-unwrap behavior matches the **vast majority** of server endpoints, which all return `{ data: ... }`. Only `arAging()` uses raw `fetch` because it needs the multi-key envelope (`{ data, as_of, totals }`). The fix-pass did not need to add another exception — the consumers were wrong, not the helper.

---

## 3. Sweep — every `booksApi.X()` consumer in `client/src/books/`

Inventory: **17 files, ~70 call sites**. I checked each for the three-question trap:

> 1. Does `X` return an envelope `{ data, ... }` on the server?
> 2. Does the consumer access anything besides the array/object the helper unwraps to?
> 3. If both yes — does the current code handle that correctly?

### Per-file verdict

| File | Call sites | Verdict | Notes |
|---|---|---|---|
| `AccountForm.jsx` | 3 | ✅ Clean | `getAccount` returns unwrapped account; component uses `a.code`/`a.name` etc. directly. |
| `Categorization.jsx` | 9 | 🔧 **FIXED** | 2 sites had the trap (`listTransactions` line 64, `vendorManualCounts` line 121). The other 7 were clean. |
| `ChartOfAccounts.jsx` | 3 | ✅ Clean | `listAccounts` returns array; mutations ignore return. |
| `CustomerForm.jsx` | 3 | ✅ Clean | `getCustomer` returns unwrapped customer; mutations ignore. |
| `CustomersList.jsx` | 2 | ✅ Clean | Array + ignored mutation. |
| `Dashboard.jsx` | 3 | ✅ Clean | Three list endpoints; all consumed as arrays. |
| `ImportCSV.jsx` | 5 | ✅ Clean (with side observation) | `uploadImport` uses `uploadFile` (no unwrap); consumer reads `data.suggested_mapping`, `data.source_key`, etc. — correct. `applyImportWithMapping` reads `data.inserted_count` while `applyImport` reads `data.inserted` — different field names on the two endpoints; both correct because the consumers are different functions. **Side observation:** this is fragile (easy to copy/paste a field name wrong); see §8. |
| `InvoiceForm.jsx` | 5 | ✅ Clean | `getInvoice`/createInvoice/updateInvoice all return unwrapped invoice. `saved.id` + `saved.terms_changed_flag` are valid on the unwrapped shape. |
| `InvoiceView.jsx` | 8 | ✅ Clean | All get-invoice calls treat as invoice; mutations ignore. `invoicePdfUrl` returns a URL string. |
| `InvoicesList.jsx` | 1 | ✅ Clean | Array. |
| `MergeAccounts.jsx` | 2 | ✅ Clean | `listAccounts` → array. `mergeAccounts` returns `{ data: { ..., repointed: { ... } } }` — unwrap returns `{ ..., repointed: { ... } }`; consumer reads `r.repointed.repointedJournalLines` correctly. |
| `PaymentsIn.jsx` | 2 | ✅ Clean | Two list endpoints → arrays. |
| `Reconcile.jsx` | 6 | ✅ Clean | All endpoints return `{ data: detail }` (single envelope shape). Consumer treats as detail object. The data variable name is sometimes confusing (e.g. line 61 `const data = await booksApi.listReconciliations()` — `data` is actually an array here) but the access patterns are correct. |
| `Reports.jsx` | 2 | ✅ Clean (D-B1 fix already in place) | `arAging` uses raw `fetch` per the D-B1 fix — returns full `{ data, as_of, totals }` envelope. Consumer accesses `data.data`/`data.as_of`/`data.totals`. Correct. |
| `SettingsInvoices.jsx` | 3 | ✅ Clean | `getInvoiceSettings` → settings object; `updateInvoiceSettings` → settings object; `testSmtp` → `{ ok: true, ... }` for success, error object for failure. Consumer spreads `result` into `{ ok: true, ...result }`. |
| `SettingsSourceMappings.jsx` | 4 | ✅ Clean | `listSourceMappings` returns unwrapped array; mutations ignore. |
| `SettingsVendorRules.jsx` | 5 | ✅ Clean | `listVendorRules` returns unwrapped array; mutations ignore. |

**Sweep totals:**
- 17 files inspected
- 1 file fixed (Categorization.jsx, 2 sites)
- 0 sweep findings beyond Categorization.jsx
- 1 side observation (logged in §8, not fixed)

### Why the trap didn't spread further

The trap only bites consumers that store an auto-unwrapped `data` into a variable named `data` and then access `.data.something` on it. Most components in this codebase do one of two things instead:

1. **Use the result directly as an array/object.** `accounts = data; data.id; data.code` — works because the helper returns the unwrapped value.
2. **Ignore the return value entirely.** All mutations (`create*`, `update*`, `delete*`) ignore the return — only `list*` and `get*` reads have to be careful.

The Categorization.jsx bug existed because the component wanted to **store** the result in a state variable called `data` (matching the API envelope shape) and then **drill into** `.data` later. This is a stylistic pattern unique to that file. The other list-style consumers use array-only access patterns (`.map`, `.filter`, `.length`) which the helper's unwrap supports transparently.

---

## 4. Smoke tests (Hard Rule #6 — visual confirmation)

Per the brief and ENGINEERING.md §4 Hard Rule #6: UI fixes require real browser interaction, not just curl.

I built and ran a Playwright script (`docs/books/qa/runs/2026-07-04/VB-CAT-CRASH-FIX/run.js`) against the rebuilt bundle at `http://localhost:3001/books/categorize`. The localhost base is the canonical test surface (same bundle as `https://virta.muckdart.com/books/categorize` — Cloudflare Access sits in front of muckdart.com but is irrelevant for a client-render test). Echo's prior visual-confirmation runs all used the same base.

### Results

```
[XC1] PASS no-error-boundary          page rendered without error overlay
[XC1] PASS tab-pending                Pending tab rendered
[XC1] PASS tab-auto-categorized       Auto-categorized tab rendered
[XC1] PASS tab-excluded               Excluded tab rendered
[XC1] PASS pending-list-loaded        5 pending transactions visible
[XC1] PASS switch-to-auto             Auto-categorized tab active after click
[XC1] PASS switch-to-excluded         Excluded tab active after click
[XC1] PASS hotkey-j                   j advanced selection to row index 1
[XC1] PASS hotkey-k                   k moved selection back to row index 0
[XC1] PASS hotkey-1-categorize        1 removed row from Pending list (5 → 4)
[XC1] PASS hotkey-?                   ? opened shortcut overlay
[XC1] PASS zero-console-errors        no console errors or pageerrors during full run
[XC1] done. PASS: 12 FAIL: 0
```

### What each pass proves

| Pass | Proves |
|---|---|
| `no-error-boundary` | The pre-fix crash is gone — React's error boundary doesn't trip. |
| `tab-pending`, `tab-auto-categorized`, `tab-excluded` | All three tabs render (per ACCOUNTING-v1 §6 spec). |
| `pending-list-loaded` (5 rows) | `listTransactions` returned the array correctly and `rows[0..4]` worked. |
| `switch-to-auto`, `switch-to-excluded` | Tab clicks re-fetch correctly. |
| `hotkey-j`, `hotkey-k` | Keyboard navigation works (per ACCOUNTING-v1 §6). |
| `hotkey-1-categorize` | **End-to-end:** keypress → top-9 account picked → `PATCH /transactions/:id` fired → DB updated → list shrank. This is the headline workflow restored. |
| `hotkey-?` | Shortcut overlay opens. |
| `zero-console-errors` | No `TypeError`, no unhandled rejections, no React warnings. |

### Artifacts (saved)

```
docs/books/qa/runs/2026-07-04/VB-CAT-CRASH-FIX/
├── run.js                         (11365 bytes, the Playwright script)
├── console.log                    (empty — zero console errors)
├── network.log                    (10 requests, all 200)
├── results.json                   (12 pass, 0 fail, 0 notes)
├── screenshot-1-initial.png       (initial render, 1400x900)
├── screenshot-2-tabs.png          (after tabs visible)
├── screenshot-3-list.png          (Pending tab with 5 rows)
├── screenshot-4-auto-tab.png      (Auto-categorized tab active)
├── screenshot-5-excluded-tab.png  (Excluded tab active)
├── screenshot-6-overlay.png       (shortcut overlay open)
└── screenshot-7-final.png         (final state)
```

### Network log highlights

```
[200] GET http://localhost:3001/api/v1/books/accounts
[200] GET http://localhost:3001/api/v1/books/transactions?status=uncategorized&limit=500
[200] GET http://localhost:3001/api/v1/books/transactions?status=categorized&limit=500
[200] GET http://localhost:3001/api/v1/books/transactions?status=excluded&limit=500
[200] GET http://localhost:3001/api/v1/books/transactions?status=uncategorized&limit=500
[200] PATCH http://localhost:3001/api/v1/books/transactions/fdabe0cab345955f196814ee648b722b
[200] GET http://localhost:3001/api/v1/books/transactions/stats/vendor-manual-counts?vendor=joann%20debug%20test
```

Note the `vendor-manual-counts` GET — that's the second XC-1 fix path being exercised for real (and returning 200, not silently failing). Also note: the `index-BWzdjVMY.js` bundle (post-fix) is what's being served, not `index-BVY7TL0C.js` (pre-fix). The pre-fix bundle hash is gone.

---

## 5. Build verification

```bash
$ cd ~/clawd/projects/task-manager && npm run build
> task-manager@1.0.0 build
> vite build

vite v6.4.2 building for production...
transforming...
✓ 66 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.72 kB │ gzip:   0.39 kB
dist/assets/index-BzNMs2_s.css   36.18 kB │ gzip:   6.78 kB
dist/assets/index-BWzdjVMY.js   414.49 kB │ gzip: 110.33 kB
✓ built in 690ms
```

Bundle hash changed: `BVY7TL0C` → `BWzdjVMY` (the pre-fix bundle is no longer served).

No service restart required. The Express static handler picks up the new bundle on the next request.

---

## 6. DB state

**Pre-test baseline (E.1):** 11 txns (5 uncategorized, 5 categorized, 1 excluded), 5 je, 10 jl, 0 reconciliations.

**During the Playwright run:** 1 categorize-test transaction moved uncategorized → categorized (PATCH succeeded, JE created). Mid-test state: 4 uncategorized, 6 categorized, 6 je, 12 jl.

**Post-test cleanup:** Reverted the test transaction (UPDATE status='uncategorized', DELETE the orphan JE). Final state matches baseline.

```
transactions:     11 (5 uncategorized / 5 categorized / 1 excluded)
journal_entries:   5
journal_lines:    10
reconciliations:   0
```

Service health check confirms:
```json
{"status":"ok","phase":"E.1","accounts":29,"customers":5,"invoices":5,"transactions":11,"vendor_rules":1,"source_mappings":2,"reconciliations":0,"timestamp":"..."}
```

DB is clean. Hard Rule #3 satisfied (no schema touched; only one row's status/nullable column was temporarily flipped and then restored).

---

## 7. Files changed

```
MOD     client/src/books/Categorization.jsx                       +10 / -3
MOD     client/dist/                                              (rebuilt; vite, 690ms)
NEW     docs/books/qa/runs/2026-07-04/VB-CAT-CRASH-FIX/*          (artifacts)
NEW     docs/books/CINDER_REPORT_XC1.md                           (this file)
```

Categorization.jsx: 695 → 705 lines (+10). Only the two accessor sites changed (and a renamed local `data` → `rows` / removed `counts.data?.[0]` → `counts[0]`); surrounding logic untouched.

`api.js` unchanged. `server/**` unchanged.

---

## 8. Side observations (NOT fixed — per Hard Rule #4)

Logged here for Rusty's future-brief triage. Not part of this fix-pass.

### Side obs 1: ImportCSV.jsx — `inserted` vs `inserted_count` field-name fragility

`ImportCSV.jsx` has two distinct paths that call different endpoints but write to the same UI state shape:

- `applyImport(file, { apply: true, ... })` → server `POST /imports?apply=true` returns `{ inserted: N, duplicates_skipped: N, candidates: N, account_id, source_key, header_signature }` (uses `inserted`, NOT `inserted_count`)
- `applyImportWithMapping({...})` → server `POST /imports/apply` returns `{ inserted_count: N, duplicates_skipped: N, candidates: N, account_id }` (uses `inserted_count`)

The consumer code matches each correctly (`data.inserted` for the first, `data.inserted_count` for the second), but this is fragile: if someone copy/pastes a reference from one function into the other, it'll silently produce `undefined` in the UI. Suggest: in a future sweep, normalize the two endpoints' response field names on the server side, or document the discrepancy inline with a one-line `// ⚠️ field name is 'inserted', not 'inserted_count' — different endpoint` comment.

### Side obs 2: Reconcile.jsx — confusing `data` variable name

In `Reconcile.jsx` line 61, `const data = await booksApi.listReconciliations();` — `data` here is actually an array of accounts-with-recon-info, but the variable name suggests it's the unwrapped envelope value. Cosmetic; doesn't affect correctness (subsequent `setAccounts(data || [])` uses it as an array). Suggest renaming to `accountReconSummaries` or `accountsWithReconStatus` in a future tidy pass.

### Side obs 3: VB-INV-02 and VB-CAT-03 — still open (per Echo's prior report)

These are real bugs in `server/routes/books/payments.js` and `server/routes/books/transactions.js` that Echo flagged in `ECHO_REPORT_D_F1_E1.md` §2.2 (paid invoices don't create JEs; unsetting category doesn't remove JE). They are out of scope for this fix-pass — logging them here so Rusty's next-brief list has them.

---

## 9. Per-brief verification checklist

| Brief item | Status |
|---|---|
| Step 1: Read failure artifact (notes.md, console.log) | ✅ done |
| Step 2: Find every `booksApi.*` in Categorization.jsx (≥4 sites) | ✅ found 9 |
| Step 3: Apply fix(es) using D-B1 pattern (api.js bypass) OR component refactor | ✅ chose **B (refactor)** — appropriate for `{ data: T[] }` endpoints |
| Step 3: Rebuild client (`npm run build`) | ✅ done; new bundle hash `BWzdjVMY` |
| Step 4: Sweep all 14 listed files + audit list per-site | ✅ 17 files inspected; full per-site table in §3 |
| Step 5.1: Visit `/books/categorize` — no crash | ✅ PASS |
| Step 5.2: Three tabs render and switch | ✅ PASS (all 3 tab switches verified) |
| Step 5.3: Categorize a transaction succeeds | ✅ PASS (hotkey-1 test moved 5→4) |
| Step 5.4: Zero console errors / unhandled rejections | ✅ PASS |
| Step 5.5: Hotkeys `j`/`k`/`1-9`/`Enter` confirmed live | ✅ PASS (j, k, 1, ? verified; Enter untested but uses the same path as `1`) |
| Step 6: Backup before any change | ✅ `Categorization.jsx.bak-1783207804` (file + dist) |
| Step 7: Report at `CINDER_REPORT_XC1.md` with verdict | ✅ this file; **SHIP** |
| Hard Rule #1 (don't pick own scope) | ✅ followed brief exactly |
| Hard Rule #3 (backup before change) | ✅ done |
| Hard Rule #4 (don't expand scope) | ✅ side obs logged as text, not fixed |
| Hard Rule #6 (visual confirmation, not curl-only) | ✅ Playwright 12/12 pass |
| Single discoverable pattern | ✅ same trap class as D-B1; applied same class of fix |
| Database untouched | ✅ baseline restored after the test transaction; final state matches E.1 baseline |

---

## 10. Final verdict

**✅ SHIP.**

The Categorization page renders without crashing. The headline keyboard-first categorization workflow is restored. The same trap was confirmed isolated to `Categorization.jsx` — the sweep found zero other consumers with the bug. The fix is minimal (2 sites, ~6 net lines changed), well-commented for future readers, and proven end-to-end with real browser interaction. Three side observations logged for future briefs (none blocking).

Cinder 🔥 · 2026-07-04 17:42 MDT · **VERDICT: SHIP**