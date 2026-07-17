# Virta Books — Project Brief

**Date:** 2026-07-17 14:35 MDT
**Author:** Rusty
**For:** Patrick (cold-read)
**Repo:** `/Users/colonelhoracegentleman/clawd/projects/task-manager`
**Head:** `a3627f3`
**Smoke test:** 255/255 passing
**Phase status:** v2 design complete → v2 build in progress (Phase 1 + Phase 1.5 = "Categories Wizard")

---

## 0. One-paragraph summary

Virta Books is a single-user, Schedule C-filer accounting app for Patrick's side businesses (quilting + consulting). It went through a v1 implementation (Phases A through E.2) which is **live but parked**, then a v2 redesign (2026-07-08) that produced a 26-round wireframe + spec with a new design baseline (Setup Wizard + Categories Wizard + Categories Management + Settings). We're now building v2 — Phase 1 (Chart of Accounts + Manual Entry) is shipped, Phase 1.5 (Categories Wizard) is 90% shipped (Welcome + Steps 2-3 SHIPped, Steps 4-6 queued), and the chain is paused waiting on Echo QA to certify B3a.

---

## 1. v1 → v2 distinction (read this first — affects everything else)

**Patrick's call 2026-07-08 17:15 / 17:17 MDT:** Everything outside the new v2 wireframe is collectively **v1**. v1 = the live built app (A through E.2) + all backlog items. v1 is parked, not actively worked. Nothing from v1 gets silently promoted into v2; each promotion requires an explicit "add X to v2" call.

### What v1 covers (parked)
| Phase | What | Status |
|---|---|---|
| A | Foundation (accounts + customers) | ✅ Live |
| B | Invoicing | ✅ Live |
| C | Import + Categorization + parsers + vendor rules + source mappings | ✅ Live (E.3 blocked on 2 BLOCKERs + 1 SIGNIFICANT, see §6) |
| D | Reports (AR aging, Schedule C export) | ✅ Live |
| E.1 | Per-account Reconciliation | ✅ Live |
| E.2 | Reconcile UI rewrite (ReconcileList + AccountGate + ReconcileWorking + StaleBanner + RollbackModal) | ✅ Live |
| E.3 | Reconcile fixes (D-B1, F1-B1, E1-S1/S2) | ⏸ Blocked on Wren findings, parked |
| F1 | Dedupe hardening + FK migration | ✅ Live |

### What v2 covers (active scope)
**v2 baseline (14 rounds, locked 2026-07-08):**
- Setup Wizard (6 steps: Welcome + 5 form steps, merged owner+identity+tax step, NAICS modal, edit-on-review)
- Categories Wizard (6 steps: Welcome + Expense + Income + Other accounts + Review Later + Final review)
- Categories Management (single-page, search + 4 filter chips + Show hidden + clickable sort headers)
- Settings → General (business name, EIN, currency)
- Settings → Categories (default sort, show account numbers)

**v2 Phase 1 add (rounds 15-26, locked 2026-07-08/09):**
- Chart of Accounts foundations (D51–D67, §10A formal schema, GL skeleton)
- Manual-entry modal redesign (FreshBooks `+ Add X` collapse pattern, Save and new button, Sage-style warning for import-driven accounts)
- Sidebar rename: General Ledger → **Transactions** (D68)
- Default landing: **Dashboard** (D69)

**Everything else from v1 (Categorize / Invoices / Reconcile / Reports / Dedupe / bulk triage / sub-hierarchies / accrual / inventory / multi-entity)** is v1, parked, not in v2.

---

## 2. Where we are right now (chain position)

```
Phase 1 (Chart of Accounts + Manual Entry) ............ ✅ SHIPPED
Phase 1.5a (Categories Wizard Welcome + Steps 2-3) ... ✅ BUILT, verified clean by Wren 2026-07-17
Phase 1.5b (Echo QA on B3a) ........................... ⏳ QUEUED, not yet spawned — chain paused here
Phase 1.5c (Cinder B3b: Steps 4-6 + Add Account modal)  📝 Brief staged, spawns after Echo PASS
Phase 1.5d (Wren B3b review) ........................... 📝 Brief staged, spawns after Cinder B3b
Phase 1.5e (Echo B3b QA) ............................... 📝 Brief staged, spawns after Wren B3b SHIP
Phase 1.5 demo to Patrick (play-and-decide gate) ....... 🔒 First time Patrick sees the wizard
```

**The chain stopped because I (Rusty) said "spawning Echo on B3a now" but the tool call never landed.** Patrick caught the gap at 13:41 MDT. The actual review work (Wren B3a-fixes re-review) is done — the report is at `WREN_REPORT_b3a-fixes.md` (9.2 KB, SHIP). Echo's brief is staged at `docs/books/ECHO_BRIEF_b3a.md`.

### Live app status (verified 14:30 MDT)
- **Vite:** `http://localhost:5173` ✅ HTTP 200
- **API:** `http://localhost:3001` ✅ HTTP 200
- **Playable right now:**
  - `/books` — Dashboard (v2 shell stub)
  - `/books/setup` — Setup Wizard end-to-end (Welcome → Steps 1-6 → POST → chained to Categories Wizard)
  - `/books/categories/wizard` — Categories Wizard Welcome + Step 2 (Expenses, 23 rows incl. Review Later, sortable, hide/delete with system guard) + Step 3 (Income, 3 rows). Steps 4-6 render "coming in B3b" placeholders.
  - `/books/categories` — Categories Management (v1 build, live)
  - `/books/transactions` — GL architecture (Phase 1+2 build output, ships manual-entry modal)
  - `/books/settings` — v2 stub (Settings.jsx Coming Soon — per Patrick 2026-07-09 21:25 feedback)

---

## 3. v1 — what was built (the live parked app)

Brief inventory by phase. All live at the URLs above.

### Phase A — Foundation (commit `1521849`)
- Accounts schema + REST router (`server/routes/accounts.js`)
- Customers schema + REST router
- Chart-of-accounts seed (default categories)

### Phase B — Invoicing (commit `17c20f9`)
- Invoice CRUD + invoice line items
- Invoice numbering, customer linkage, status tracking
- Invoice print view (`InvoiceView.jsx`)
- Invoice form (`InvoiceForm.jsx`)

### Phase C — Import + Categorization (commit `8b884ab`)
- CSV importer (`ImportCSV.jsx`)
- Categorization UI (`Categorization.jsx`) — bulk operations + per-row
- Vendor rules engine (auto-categorization on import)
- Prebuilt parser interface (`detect+parse` for drop-in PDF support later)
- Source mappings (raw import → canonical schema)

**C review found 2 BLOCKERs + 3 SIGNIFICANTs + 1 NIT** (from `WREN_REVIEW_C.md`, dated 2026-06-30):
- BLOCKER: bulk-categorize double-UPDATE
- BLOCKER: PayPal/Venmo sign-convention naming
- SIGNIFICANT: Rule button fires wrong action
- SIGNIFICANT: Enter no-op in some flows
- SIGNIFICANT: restore action leaves orphaned journal entries
- NIT: cosmetic

Status: BLOCKERs not fixed, parked with v1.

### Phase D — Reports (commit `6f0997f`)
- AR aging report
- Schedule C export (PDF, grouped by IRS line)
- Trial balance

### Phase E.1 — Reconciliation engine (commit `831b534`)
- Per-account monthly reconciliation
- Paste bank balance, see uncleared txns, surface diff, approve
- New schema: `reconciliations` + `reconciliation_clears` + `transactions.cleared_at` column

### Phase E.2 — Reconcile UI rewrite (commit `b44eff6`)
- 5 components: ReconcileList + AccountGate + ReconcileWorking + StaleBanner + RollbackModal
- TransactionEditor integration for editing during reconcile

### Phase F1 — Dedupe hardening (commit `8b884ab`, same as C)
- Two-tier dedupe: exact (auto-skip on UNIQUE hash) + near-duplicate (flag for user review)
- Vendor normalization NOT in exact hash
- Near-duplicate match = same vendor + same amount + ±3 days
- FK migration from string IDs to real foreign keys

### v1 polish (later commits)
- `e9420b4` Transactions page polish — pagination + sortable columns + flexible dates
- `11162a4` server-side sort whitelist for GL listing
- `980a55c` v2 shell rebuild — greenfield 5-surface nav + wireframe-accurate stubs (this replaced the v1 shell)

---

## 4. v2 design — what was locked in rounds 1-26

| Round | Date | What | Commit |
|---|---|---|---|
| 1-14 | 2026-07-08 | Initial 14-round wireframe close-out (Setup Wizard + Categories Wizard + Categories Management + Settings) | `b6b4d05` |
| 15 | 2026-07-09 | Phase 1 cleanup: spec dedupe (D29–D32/D43–D49), wireframe dead-code removal, smoke test moved into repo | `23b2469` |
| 16 | 2026-07-09 | Sidebar General Ledger → **Transactions** (D68) | `157bce0` |
| 17 | 2026-07-09 | Default landing = Dashboard (D69) | `04e8636` |
| 18 | 2026-07-09 | Manual-entry modal: Type picker first (D62/D64 revised) | `653b185` + `6e0c32e` + `fbb6e77` |
| 19 | 2026-07-09 | Description uses placeholder, not pre-filled | `a3d27c2` |
| 20 | 2026-07-09 | Clear all manual-entry defaults | `be2c05a` |
| 21 | 2026-07-09 | "Other account" → "Matched with" | `1906b4c` |
| 22-23 | 2026-07-09 | "Account" → "Category" + Name field added | `06ed31e` |
| 24 | 2026-07-09 | Amount label always "Amount" | `db2b202` |
| 25 | 2026-07-09 | Modal layout overhaul (scrollable body, sticky footer, Notes "(internal only)") | `46abbd6` |
| 26 | 2026-07-09 | FreshBooks `+ Add X` collapse (5-field default), Save and new button (D71), Sage warning for import-driven accounts (D70) | `e84f780` |
| 27 | 2026-07-09 | Matched with restored to default view (after research invalidated the collapse) | `8e4fdab` + `c64b951` |

**Total spec decisions:** 71 (D1–D71) + §10A formal schema. **Smoke test:** 255/255 assertions passing.

**Artifacts:**
- `docs/books/setup-wizard/WIREFRAMES.html` — 1554-line single-file SPA, clickable in browser
- `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md` — 872-line spec with all decisions + behavior IDs (§13)
- `docs/books/setup-wizard/tests/wf-smoke.mjs` — Playwright-style smoke harness, lives in repo
- `docs/books/setup-wizard/VIRTA_BOOKS_V2.md` — snapshot doc, the cold-start handshake
- `docs/books/setup-wizard/feedback/` — per-round feedback archive

---

## 5. v2 build — what's been built

### Phase 1+2 build (commit `2f48417`) — **SHIPPED**
The big v2 shell rebuild + Chart of Accounts + Manual Entry modal + GL architecture.

Includes:
- v2 shell rebuild (5 surfaces, sidebar nav, default Dashboard landing)
- GL architecture: transactions table, journal entries, double-entry posting
- Manual-entry modal with FreshBooks pattern (collapsed default + `+ Add X` reveals)
- Save and new button in sticky footer
- Sage-style warning for import-driven accounts
- Server foundation: businesses + settings REST, NAICS source data
- Transactions page polish (pagination, sort, dates)

### Phase 1 fixes (`2a97193`) — **SHIPPED**
- BLOCKER-1: GL row after-save didn't appear correctly
- SIG-1/2/3: review-driven fixes
- NIT-2/3/4: polish

### B1a — Transactions polish (commit `bf94529`) — **SHIPPED**
- GL row reordering
- Date filter chip refinements
- Wren review PASSED

### B2a — Setup Wizard foundation + Steps 1-2 (commits `d44fb56` + `984c223` + `5de5cef`) — **SHIPPED**
- Server: businesses + settings REST routes with CHECK trigger translation, JSON validation
- Client: sidebar 4-link + Dashboard first-run experience + wizard Steps 1-2 + NAICS modal

### B2b-1 — Setup Wizard Steps 3-5 (commit `bfdd386`) — **SHIPPED**
- Steps 3 (Contact), 4 (Accounting), 5 (Timeline)
- Wren SHIPped (0 blockers, 0 sig, 2 nits)
- Nits captured later in `37973cd` (F4 NAICS Clear + N2 Step 4 helper text)

### B2b-2 — Setup Wizard Step 6 + Final POST + Chaining (commit `9c04ffc`) — **SHIPPED**
- Step 6 (Review & create), final POST, chaining into Categories Wizard
- Wren SHIPped (0 blockers, 0 sig, 1 cosmetic NIT)
- Echo QA 18/18 PASS (`d5e6b36`)

### B3a — Categories Wizard Welcome + Steps 2-3 (commits `d32b3eb` + `d37c180`) — **NEEDS-FIX → FIXED → Wren SHIPped (2026-07-17)**
- Welcome screen
- Step 2 (Expenses): 23-row table with sortable headers, sticky header, inline rename, hide/delete, tax-line popover with PATCH, +Add opens placeholder modal
- Step 3 (Income): 3 rows in non-alphabetical order (Sales, Refunds & Returns, Other Income)
- Step 1 toggle for show_account_numbers cascades to Steps 2/3
- QA harness 23/23 (`d38b580`)
- **Original Wren NEEDS-FIX:** 2 SIGNIFICANTs (system-account Hide/Delete guard missing; DEFAULT_EXPENSES/INCOME diverged from spec §10 on 21/23 rows)
- **Cinder fixes (`ea7836e` + `1ab7a47`):** system-account guard + §10 verbatim alignment, including extending IRS_LINE_OPTIONS with Line 15a/15b/25a/25b
- **Wren B3a-fixes re-review (`85b4757` doc, 9.2 KB, 2026-07-17 13:03 MDT):** SHIP, both SIGNIFICANTs RESOLVED via commit diff + independent live CDP probes, QA 23/23, smoke 255/255, 1 pre-existing cosmetic NIT (sticky header 80% opacity) deferred

### Settings.jsx stub — **SHIPPED (2026-07-17)**
- Commit `a3627f3` — replaces 3-tab stub (empty tab bodies felt broken per Patrick 2026-07-09 21:25 MDT feedback) with single "Coming in Phase 1" stub via shared `_stub-template.jsx`

---

## 6. What's queued / what remains in current build phase

### Immediate next steps (the chain)

| # | Step | Status | Brief location |
|---|---|---|---|
| 1 | Echo B3a QA | ⏳ Queued, spawn NOW | `docs/books/ECHO_BRIEF_b3a.md` |
| 2 | Cinder B3b build | 📝 Brief staged | `queued/TASK-b3b-categories-wizard-second-half.md` |
| 3 | Wren B3b review | 📝 Brief staged | `docs/books/WREN_BRIEF_b3b.md` |
| 4 | Echo B3b QA | 📝 Brief staged | `docs/books/ECHO_BRIEF_b3b.md` |
| 5 | **Demo to Patrick** (play-and-decide gate) | 🔒 First time Patrick sees the Categories Wizard |

### B3b scope (Cinder's next build, ~500 lines)
Per `queued/TASK-b3b-categories-wizard-second-half.md`:
1. **Step 4** — Asset / Liability / Equity (3 subheader sections):
   - Cash & bank (3 defaults: Business Checking 1010, Savings 1020, Cash on Hand 1100)
   - Credit & loans (2 defaults: Business Credit Card 2000, Loans Payable 2100)
   - Equity (3 defaults: Owner Contributions 3000, Owner Draws 3010, Owner's Equity 3020)
   - Single "Add account" button at the top, opens generic Add Account modal with Type picker pre-focused
2. **Step 5** — Review Later (auto-create single system expense account #6999 "Review Later", not user-actionable)
3. **Step 6** — Final review (3 collapsible sections: Income / Expenses / Other) + **final POST** that bulk-writes `accounts` rows
4. **Add Account modal** (the placeholder from B3a becomes real here) — full create flow per spec §8.2

### Phase 2 (next after B3b) — Chart of Accounts + Manual Entry in real app
Wait — Phase 1+2 build is already SHIPPED. So "Phase 2" in the v2 roadmap is actually **GL architecture: posting rules + audit log click-to-reveal + GL filter bar (date range + category + name)**. This was already partially built in `2f48417`, but the **filter bar** is still missing (Patrick flagged it as MVP during Phase 1 design but didn't make it into the wireframe).

### Open design questions carried into v2 work
1. ~~Spec hygiene~~ — DONE in round 15
2. ~~Smoke test portability~~ — DONE in round 15
3. ~~Wireframe cleanups~~ — DONE in round 15
4. **Settings → Other tab content** — undefined in spec, exists in wireframe as empty placeholder. v1, not in v2 baseline.
5. **E.2 demo `demos/2026.07.07-E2-reconcile.mp4`** — UNREVIEWED. v1. Blocks Reconcile work if v1 is ever resumed, not relevant to v2.
6. **Wren's Q1/Q2 design questions from 2026-07-06** — still unanswered. v1. Blocks E.3 fix-pass if v1 is ever resumed.
7. **GL filter bar** (date range, category, name) — Patrick said "for MVP" during Phase 1 design but didn't make it into the wireframe. Default: add during Phase 2 design.

### Standing items (Patrick-side decisions)
None currently Books-related. Heartbeat Reporter cron flakiness (cfea5a99, GPT-5.5 isolated-mode) was on the list but is off-topic for Books.

### Cosmetic NITs deferred from Wren reviews (worth noting, not blocking)
- **Sticky thead `bg-slate-900/80`** lets row text ghost through faintly during scroll (predates B3a-fixes, predates B3a, in original `d32b3eb`). Future pass: `bg-slate-900` full opacity or `bg-slate-900/95` + backdrop-blur.
- Several B2b nits captured in `37973cd` (F4 NAICS Clear, N2 Step 4 helper text) — already addressed in that commit, not pending.

---

## 7. Roadmap — what comes after Categories Wizard

Source: `VIRTA_BOOKS_V2.md` phase roadmap (also mirrored in Virta Tasks cards).

| Pos | Pri | Phase | Status | Notes |
|---|---|---|---|---|
| 12 | high | **Virta Books v2 (umbrella)** | Active | This card |
| 14 | high | **Phase 1: Chart of Accounts foundations** | ✅ Design complete | Built + shipped as `2f48417` |
| 1.5a | high | **Categories Wizard (Welcome + Steps 2-3)** | ✅ B3a shipped | Wren SHIP 2026-07-17 |
| 1.5b | high | **Categories Wizard (Steps 4-6 + Add modal)** | ⏳ Queued | B3b → Wren B3b → Echo B3b → demo |
| 15 | high | **Phase 2: GL architecture (audit log + filter bar)** | ⏳ Next | GL filter bar (date/category/name) + posting rules + audit log click-to-reveal. Reconcile status semantics deferred to Phase 9. |
| 16 | high | Phase 3: Customer records | ⏳ Pending | |
| 17 | high | Phase 4: Invoicing | ⏳ Pending | |
| 18-25 | med/low | Phases 5-12 (Vendors → Calendar) | ⏳ Pending | |
| 26 | low | Phase 13: Reports | ⏳ Pending | |

### v3 candidates (parked, separate from roadmap)
- Sales tax (multi-jurisdiction)
- Multi-user
- Recurring transactions
- Anything else from v1 backlog not promoted to v2

---

## 8. Decision log (Patrick's calls that shaped the current state)

| Date MDT | Call | Effect |
|---|---|---|
| 2026-06-28 | MVP spec committed (Schedule C filer, no inventory/COGS, home office warning on dashboard) | Anchored v1 scope |
| 2026-06-30 | Two-tier dedupe (exact auto-skip + near-duplicate user review); vendor normalization not in hash; near-dup = same vendor + same amount + ±3 days | Defined F1 behavior |
| 2026-06-30 | Reconciliation inserted before Dashboard (Phase E.1) | Phases reordered |
| 2026-07-08 17:15 | "Wireframe-from-this-morning is the only thing considered v2-approved" | Drew the v1/v2 line |
| 2026-07-08 17:17 | "Everything else is v1 — may or may not carry forward" | Parked v1 explicitly |
| 2026-07-09 21:25 | Settings.jsx stub feedback ("3-tab empty bodies felt broken") | Settings.jsx → single Coming Soon stub (shipped 2026-07-17) |
| 2026-07-13 10:39 | "Build everything in the wireframes" | Authorized B2a + B3 chain |
| 2026-07-14 13:13 | "Where did you get to on the Books build?" | Triggered the chain restart after gateway-timeout stall |
| 2026-07-14 13:58 | "Get through B2b before I review. Queue B3 next." | B3 briefs staged, no mid-pipeline pause |
| 2026-07-14 14:08 | "Demo = playing with the running surface, NOT a video" | Changed play-now ping protocol |
| 2026-07-14 14:13 | "I'll check with you in an hour — move forward on a B2a Protocol basis" | Sub-agent-only chain, post-hoc ping, no mid-pipeline demo gates |

---

## 9. Key files & where to look

| What | Where |
|---|---|
| Cold-start v2 doc | `docs/books/setup-wizard/VIRTA_BOOKS_V2.md` |
| Wireframe (clickable in browser) | `docs/books/setup-wizard/WIREFRAMES.html` |
| Spec (71 decisions, §10A schema) | `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md` |
| Smoke test | `docs/books/setup-wizard/tests/wf-smoke.mjs` |
| Per-round feedback archive | `docs/books/setup-wizard/FEEDBACK-wireframes-*.md` (rounds 1-27) |
| Briefs (queued, ready to spawn) | `docs/books/{WREN,ECHO,CINDER}_BRIEF_*.md` + `queued/TASK-*.md` |
| Reports (post-build) | `WREN_REPORT_*.md` + `ECHO_REPORT_*.md` + `CINDER_REPORT_*.md` (repo root) |
| QA scripts | `server/scripts/qa-b3a.mjs` + `server/scripts/wren-probe-b3a-fixes.mjs` |
| v2 shell | `client/src/books/BooksShell.jsx` |
| Categories Wizard (current) | `client/src/books/CategoriesWizard.jsx` + `CategoriesWizardExpensesStep.jsx` + `CategoriesWizardIncomeStep.jsx` |
| Settings stub | `client/src/books/Settings.jsx` + `client/src/books/_stub-template.jsx` |
| Manual-entry modal | `client/src/books/ManualEntryModal.jsx` |
| Server foundations | `server/routes/books/` + `server/lib/` |

---

## 10. Honest risks / things I'm watching

1. **Gateway timeouts.** The 4-day stall 2026-07-09 → 2026-07-13 was gateway/provider timeouts during long main-session turns. Sub-agent runs are fast (Wren B3a-fixes: 3 min). Long main-session turns still time out mid-response. B2a Protocol (sub-agents only, post-hoc pings) is the mitigation that worked.
2. **Memory paths drift.** `MEMORY.md` uses `~/clawd/projects/task-manager/...` which resolves correctly under `$HOME`. This was on a stale-paths standing item but turned out to be a phantom — paths were always correct.
3. **Phase 2 filter bar still not designed.** Patrick flagged "MVP" during Phase 1 design but didn't add it to wireframe. B3b ships first; this is a Phase 2 design task.
4. **v1 BLOCKERs not fixed.** Phase C E.3 has 2 BLOCKERs + 1 SIGNIFICANT from 2026-06-30 that haven't been touched. They're not in v2 scope, but if v1 is ever resumed they need a Cinder fix-pass first.
5. **Wren's 2026-07-06 Q1/Q2 design questions** still unanswered. v1 territory, blocks E.3 if resumed.
6. **Gateway-restart risk.** `openclaw gateway restart` from a session hangs UI and forces onboard wizard. Only safe restart is `launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway 2>&1 &` (backgrounded). In AGENTS.md.
7. **Pre-existing cosmetic NITs.** Sticky thead transparency (in B3a, not blocking), and other minor things captured in older review reports.

---

*Last updated: 2026-07-17 14:35 MDT by Rusty. Next update on next chain completion or scope change.*