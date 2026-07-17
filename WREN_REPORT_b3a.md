# WREN_REPORT_b3a.md — Categories Wizard: Welcome + Steps 2-3

**Reviewer:** Wren
**Build under review:** B3a — Categories Wizard first half (Welcome + Step 2 Expenses + Step 3 Income)
**Builder:** Cinder (sonnet-5)
**Date:** 2026-07-14 15:30 MDT
**Commits:** `d32b3eb`, `d37c180`, `d38b580`, `5afa990`
**Brief:** `queued/TASK-b3a-categories-wizard-first-half.md`
**Spec:** `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md` §7 Steps 1-3, §10 defaults

---

## VERDICT: NEEDS-FIX (2 SIGNIFICANT, 1 NIT)

No BLOCKER. But two SIGNIFICANT findings — one is a genuine spec-violation bug (Review Later is deletable/hideable), the other is a data-fidelity gap flagged honestly by Cinder (tax-line mappings diverge from the spec's canonical §10 table on 21 of 23 rows, not "plausible inventions" — they're a **different, self-consistent scheme** that doesn't match the source of truth). Both are real but narrow/mechanical fixes, not architectural problems. Everything else — state machine, resume pattern, sort behavior, income ordering, route wiring, API method reuse — is correct and well-built.

---

## What I verified

1. **QA harness re-run live (not just read).** `node server/scripts/qa-b3a.mjs` against the actual running app (started backend + confirmed Vite dev server) → **23/23 passing**, matching Cinder's report exactly.
2. **Wireframe smoke re-run.** `node docs/books/setup-wizard/tests/wf-smoke.mjs` → **255/255 passed.**
3. **State machine + persistence** (`CategoriesWizard.jsx`): storage key `virta_books:wizard:categories:state` (distinct from Setup Wizard's `wizard:setup:state`), debounced 250ms save, `hydrateCategoriesWizardState()` validates shape and falls back to defaults on parse error — correct pattern, mirrors `SetupWizard.jsx`'s `hydrateWizardState()`.
4. **`currentStep` clamping** — `setStep` clamps to `[1, CATEGORIES_STEPS.length]` = `[1,6]`. Steps 4-6 render a "coming in B3b" placeholder if reached — confirmed by reading the `stepNumber >= 4` branch.
5. **`completedAt === null`** for all of B3a — confirmed in `freshDefaultState()`; nothing sets it in this build.
6. **Step 1 (Welcome)** — headline, body copy, and helper text match the spec's §7 Step 1 text verbatim. Toggle default OFF confirmed live (`aria-checked=false` on fresh load).
7. **VB-CATWIZ-STEP1-02 (settings PUT) — independently verified beyond the harness.** The harness itself doesn't assert this behavior end-to-end (no check calls out STEP1-02 specifically). I wrote and ran a standalone CDP probe: toggled the switch, then read `GET /api/v1/books/settings` directly — confirmed `show_account_numbers` flipped `false → true` server-side, then reverted `true → false` on toggle-back. Real round-trip, not just optimistic local state.
8. **Step 2 (Expenses)** — table columns (Name, Code, Tax line, Descriptor, Hide/Delete), sticky header (`sticky top-0`), default sort Name ascending (confirmed live: first row = "Accounting"), sortable headers with ↑/↓/↕ states, Code column correctly gated on the Step 1 toggle, inline rename, tax-line popover with PATCH wiring, Hide toggling `is_hidden`, delete confirmation modal + row removal on confirm (23→22 confirmed live), Skip = 23 defaults (confirmed live), empty state present, +Add opens the placeholder modal.
9. **VB-CATWIZ-STEP2-10 (defensive delete-disable) — independently verified beyond the harness's placebo check.** The harness's own assertion for this ID is `typeof window !== 'undefined'` — it doesn't actually exercise the code path. I wrote a standalone probe that injects `transactions_count: 5` on a live account via localStorage and reloads: confirmed the real Delete button disappears, a disabled `<span>` renders in its place with the exact tooltip text "This account has transactions. Manage it from Categories after setup.", matching the brief word-for-word.
10. **Step 3 (Income)** — same table UX as Step 2. **Default order confirmed correct and NOT alphabetical**: live DOM order = `["Sales", "Refunds & Returns", "Other Income"]`, matching spec §10 exactly (CW-007 exception honored). Clicking "Name" re-sorts alphabetically (confirmed in the sorted screenshot: Other Income → Refunds & Returns → Sales), and un-sorting doesn't exist as a UI action but the *initial* render always uses insertion order via `sort.field === null` — correct design per Cinder's judgment call #3.
11. **Resume-from-mid-wizard pattern** — read `SetupWizard.jsx` end-to-end. Important nuance: the actual 1:1-mirrorable pattern in `SetupWizard.jsx` is the **schema-mismatch banner** (`schemaPrompt`, triggered by version drift, not by "is there mid-wizard state"), not a generic "you started setup, resume?" banner — `SetupWizard.jsx` has no such generic banner; per `WREN_REPORT_b2b-1.md` NIT-1's own historical note, that gap was already flagged and deferred. Cinder's `CategoriesWizard.jsx` resume banner is actually **more literal to what the brief describes** (a proper "you started categories setup on [date], resume?" prompt) than what exists in `SetupWizard.jsx` today — this is a reasonable adaptation, not a mirror-failure, and Cinder's code comments (`CategoriesWizard.jsx` header) correctly describe it as "adapted since Categories Wizard doesn't have a schema-mismatch concept." Confirmed live via harness (RESUME-01/02/03 all pass) and independently by seeding `currentStep`, reloading, and confirming the banner + both buttons render.
12. **`api.js` — no new methods added, no `patchAccount`.** Confirmed by reading the file directly: `updateSetting`, `updateAccount` (PATCH), `deleteAccount`, `listAccounts` all pre-exist. Cinder's claim is accurate.
13. **BooksShell.jsx route swap** — `/books/categories/wizard` now renders `CategoriesWizard`; `/books/categories` still renders `Categories.jsx` unchanged. No orphaned imports — `Categories` import is still used for the unwizard route.
14. **`PlaceholderAddAccountModal` onSave contract** — accepts `onSave` as a prop with a documented `onSave(account)` signature in comments, even though callers currently pass a no-op `() => setAddOpen(false)`. The stub itself never calls `onSave` (nothing to save), which is correct per the brief — B3b needs to wire the real modal to call it with the new account. Not a functional gap for B3a.
15. **No regressions** — `git diff --stat` across the 4 commits touches only the 7 new Categories Wizard files + `BooksShell.jsx` + 2 QA scripts. `Settings.jsx`'s pre-existing uncommitted diff (from B1 round 1) is untouched — confirmed via `git status`. Setup Wizard, Transactions, and post-wizard `Categories.jsx` are not in the diff.
16. **Dark-mode screenshots** — viewed all 5 in `demos/2026.07.14-b3a/`. All are legitimate dark-mode renders (slate backgrounds, light text, no light-mode leaks, no overlap/broken layout). Step 2 sorted screenshot confirms descending sort correctly reverses the row order.

---

## Findings

### SIGNIFICANT-1: Review Later (system account) can be Hidden and Deleted — violates spec's explicit protection

- **Severity:** SIGNIFICANT
- **File:** `client/src/books/CategoriesWizardExpensesStep.jsx` (Hide/Delete action cells, ~lines 208-236); `client/src/books/CategoriesWizard.jsx` (`hideAccount`, `deleteAccount` callbacks, no `system` guard)
- **What's wrong:** Spec §7 Step 5 says: *"Review Later... (system category; user cannot rename/delete/merge)."* The code correctly blocks **rename** (`onClick={() => !acc.system && startEditName(acc)}`), but does **not** guard Hide or Delete. I verified this live: clicking Review Later's Hide button flips its label to "Unhide" (Hide is not blocked), and clicking Delete → confirming in the modal actually removes the row from the wizard's Step 2 table entirely. The account is also visible in Step 2 at all — the brief's own file-header comment in `CategoriesWizardExpensesStep.jsx` says "Review Later pinned first," implying it's expected to show, but the canonical spec (§7 Step 2's live spec text: `list = sortedList('expenses', state.expenses).filter(r => !r.system)` in the wireframe JS) and Step 5's dedicated screen both suggest Review Later should **not** appear in Step 2's table at all in the full 6-step flow — it gets its own Step 5. Since B3a doesn't ship Step 5 yet, showing it in Step 2 is a reasonable stopgap, but it needs the delete/hide guard regardless of which step displays it.
- **Evidence:** Live CDP probe — clicked `expense-hide-expense-6999` → label flipped to "Unhide" (not blocked). Clicked `expense-delete-expense-6999` → confirm modal opened → confirmed → row count decremented, Review Later gone from the table.
- **Fix proposal:** In `CategoriesWizardExpensesStep.jsx`, gate the Hide button and the Delete button (or the delete-disabled span logic) the same way rename is already gated: `acc.system ? <span title="Review Later can't be hidden or deleted.">...</span> : <button>...</button>`. Since B3a shows Review Later in Step 2 (a stopgap ahead of B3b's dedicated Step 5), it at minimum needs to be un-deletable/un-hideable wherever it's rendered in this build.

### SIGNIFICANT-2: 21 of 23 tax-line ("Schedule C line") mappings on `DEFAULT_EXPENSES` diverge from spec §10's canonical table — both codes/names and IRS line values differ, not just the 20 Cinder flagged

- **Severity:** SIGNIFICANT
- **File:** `client/src/books/CategoriesWizard.jsx:47-70` (`DEFAULT_EXPENSES`)
- **What's wrong:** Cinder's own report flagged this as a judgment call and asked for a sanity-check — this confirms the concern is real and larger than "just the tax lines." Comparing line-by-line against `SETUP_AND_CATEGORIES.md` §10:
  - **Names differ**, not just tax lines: e.g. spec has "Commissions" → code ships "Commissions & Fees"; spec has "Legal & Professional" → code ships "Legal & Professional Services"; spec has "Office Expense" → code ships "Office Expenses"; spec has "Rent" → code ships "Rent or Lease"; spec has "Wages" → code ships "Payroll & Wages"; spec has "Meals" → code ships "Meals (50% deductible)".
  - **5 spec categories are missing entirely** from the shipped defaults: **Depletion** (Line 12), **Insurance** (Line 14 — code instead ships a differently-named "Business Insurance" at Line 15), **Interest** (Line 15b), **Mortgage Interest** (Line 15a), **Phone** (Line 25b — code instead folds phone into "Utilities").
  - **4 categories are added that aren't in spec's §10 canonical list**: Bank Fees, Dues & Subscriptions, Licenses & Fees, Postage & Shipping, Software & Subscriptions (5, actually — Licenses & Fees duplicates/overlaps "Taxes & Licenses" territory).
  - **Tax-line values differ even where names match** — e.g. Accounting: spec = Line 16b, shipped = Line 17. Utilities: spec = Line 25a, shipped = Line 25. Repairs & Maintenance: spec = Line 20a, shipped = Line 21. Supplies: spec = Line 20b, shipped = Line 22. Rent: spec = Line 19, shipped ("Rent or Lease") = Line 20b.
  - The 23-count matches (good), and the 3 unmapped/renamed-but-line-correct items (Advertising, Car & Truck, Contract Labor, Depreciation, Meals, Travel) are correct, but the majority of the table is a **different, internally-consistent-but-non-canonical scheme** — it reads like Cinder built from a different (perhaps more "modern SaaS bookkeeping") mental model of expense categories rather than transcribing §10 literally.
  - This matters beyond cosmetics: Schedule C line mappings feed tax reporting (per spec §10A, this is "the accounting logic that runs behind the UI" for Phase 13 Reports). Shipping the wrong line numbers now means either a painful category-rename+remap pass later, or incorrect tax-line groupings if reports are built against these seed values before someone catches it.
- **Evidence:** Full line-by-line diff run against §10; see comparison in the review notes (available on request) — 21 of 23 default expense rows differ in name and/or Schedule C line from the spec's canonical table; only "Card & Truck," "Contract Labor," "Depreciation," "Advertising," "Meals," "Travel" match on Schedule C line even though several of those also carry renamed labels.
- **Fix proposal:** Replace `DEFAULT_EXPENSES` in `CategoriesWizard.jsx` with the exact 23-row table from `SETUP_AND_CATEGORIES.md` §10 (names, codes, and Schedule C lines verbatim) rather than Cinder's inferred set. This is a pure data-table swap — no structural change to `CategoriesWizardExpensesStep.jsx`'s rendering, sorting, or PATCH logic is needed. If the team has since decided the newer expanded category names (Bank Fees, Dues & Subscriptions, etc.) are actually preferred over the original §10 spec, that's a **product decision that needs to update the spec first**, not something a builder should infer silently — flag to Rusty/Patrick which source wins before Cinder re-does this table.

### NIT-1: QA harness has two placebo assertions that don't exercise real behavior

- **Severity:** NIT
- **File:** `server/scripts/qa-b3a.mjs`
- **What's wrong:** `VB-CATWIZ-STEP2-10`'s check is `hasDisabledPathAvailable = typeof window !== 'undefined'` — always true, doesn't touch the DOM or simulate a transaction. Also, there's no dedicated harness assertion for `VB-CATWIZ-STEP1-02` (the settings PUT round-trip) — Cinder's report table lists it as ✅ with a description implying it was checked, but the harness code has no corresponding block; STEP1-02 isn't even in the printed check list from the harness run (I counted the live output: 23 distinct check IDs printed, and neither of those two is a real end-to-end check). Both behaviors *are* correctly implemented (I independently verified both live via standalone CDP probes — see items 7 and 9 above), so this is a **test-coverage-claim accuracy** issue, not a functional bug. But the report's claim "23/23 passing... covering all 21 brief behavior IDs" slightly overstates what the harness itself proves for these two IDs.
- **Fix proposal:** For STEP1-02, add a harness block that toggles the switch and then fetches `/api/v1/books/settings` to assert the value actually changed server-side (like my standalone probe did). For STEP2-10, seed `transactions_count > 0` on an account via localStorage injection before asserting the disabled-span/tooltip renders (like my standalone probe did). Low priority — the underlying behaviors are correct; this only affects future regression-catching confidence in the harness.

---

## Recommended next step

1. Cinder should fix **SIGNIFICANT-1** (add a `system` guard to Hide/Delete in `CategoriesWizardExpensesStep.jsx`, mirroring the existing rename guard) — this is a small, well-scoped fix confined to the file already under review.
2. Cinder should fix **SIGNIFICANT-2** by replacing `DEFAULT_EXPENSES` with the literal §10 table — also confined to `CategoriesWizard.jsx`, no consumer changes needed. If Rusty/Patrick have a reason to prefer the newer category set Cinder invented, update `SETUP_AND_CATEGORIES.md` §10 first, then this becomes a non-issue and I'll re-verify against the updated spec.
3. NIT-1 can ride along with the above fixes or be deferred indefinitely — doesn't block ship.
4. Once SIGNIFICANT-1 and SIGNIFICANT-2 land, re-run `qa-b3a.mjs` + `wf-smoke.mjs` and this build is a clean SHIP. Everything else in the build — state machine, resume UX, Step 3 ordering, route wiring, API method reuse, dark-mode rendering — is solid and matches the brief precisely.

---

## Out-of-scope (confirmed, not touched by this review)

- B3b's real Add Account modal, Steps 4-6, and final POST/chaining — untouched, as expected.
- B2b-1/B2b-2 NITs — out of scope, not re-litigated here.
- Multi-entity/accrual/inventory — out of v2 scope, not applicable.
