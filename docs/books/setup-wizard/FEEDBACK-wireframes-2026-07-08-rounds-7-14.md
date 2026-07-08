# Wireframes Feedback — Rounds 7–14 (final of 2026-07-08 session)

- **Source:** Patrick, 2026-07-08 ~11:15–15:54 MDT (post-1st-meeting through end of session)
- **Scope:** Wizard post-setup polish; Categories Management page finalize; Settings tabs; Balance column
- **Status:** All rounds applied. Final commit: `ec4bbb8`. Smoke test: 172/172 passing.
- **Apply to:** Both `SETUP_AND_CATEGORIES.md` and `WIREFRAMES.html`

This file captures rounds 7 through 14 — the final stretch of today's wireframe work. Round 1 was applied 2026-07-07; rounds 2–6 are in their own feedback docs (`-round3.md`, `-round4.md`, `-round6.md`).

---

## F7.1 — Wizard steps 2/3/4 CTAs move inside the scroll window (D40)

**Why:** The wizard step CTA buttons were a separate region *below* the scrollable table, requiring a second scroll on long tables. Patrick wanted them inside the table's scroll container so a single scroll reaches them.

**Change:**
- New `.step-window` wrapper class (CSS: `position: relative; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; max-height: calc(100vh - 320px)`).
- The scroll-able `<div class="scroll">` wraps the `<table>`. The `.step-cta-inside` row lives inside `.step-window` after the scroll div, with `position: sticky; bottom: 0; z-index: 2` so it stays visible at the bottom edge of the scroll viewport while still scrolling the table.
- Applies to wizard steps 2 (expenses), 3 (income), 4 (other accounts). Step 5 has no table; the CTA stays in the standard `.step-cta` position.

## F7.2 — Edit modal Code field hidden when account numbers are off (D37)

**Why:** The Edit modal showed the Code field unconditionally. When account numbers are off, the Code has no meaning. Inconsistent with the table's hide-Code-when-off behavior.

**Change:** Code label + input rendered inside `state.showNumbers ?` ternary in `__openEdit`'s modal body. `__commitEdit` reads `#edit-code` only if present.

## F7.3 — Edit modal Type picker always shown; locked in wizard context (D38)

**Why:** Edit needed the same Type semantics as Add — but the spec says "the Edit screen should look the same in wizard or management" with Type locked in the wizard.

**Change:** New `<select id="edit-type">` always rendered at the top. Disabled (`<select ... disabled>`) when `state.screen === 'cats'`. Pre-selected to the calling step's type (step 2 → Expense; step 3 → Income; step 4 → the row's existing Asset/Liability/Equity).

## F7.4 — Edit modal Notes placeholder rewritten (D39)

**Why:** The previous "Optional. Free-form context shown in audit logs and Reports drill-down" made a capability claim that isn't true.

**Change:** Label stays "Notes"; placeholder is now "What is this category used for? (e.g. Dues paid to local trade association)". Helper text drops the audit/reports mention.

## F7.5 — Step 5 (Review Later) explainer + description

**Why:** Code "9999" doesn't need to be in the description (visible in the row when accounting codes are on, confusing when they're off).

**Change:** Step 5 infobox description: removed "(code 9999)". Replaced with the cleaner "Review Later is a default expense bucket for when you can't confidently categorize a transaction. Once you have discovered the correct category, you can come back and move items to the right category any time."

## F7.6 — Round-4 chained-edit bug fixed

**Why:** During round 7, a multi-edit chain accidentally shadowed step-5's `else if` block with step-4's group-block body. Result: Review Later was unreachable; navigating from step 4 landed on a "Step 5" header showing step-4 content. Caught by smoke-test regression on `check('Step 5: name is "Review Later"')` returning false.

**Fix:** Removed the duplicate `} else if(s===5){` block in renderCats. The actual step-5 review-later block at the higher line number is now reached correctly.

---

## F8.1 — Sidebar single Categories link (D42)

**Why:** Three sub-links (Income/Expenses/Other) were stale. Filtering is now done by chips on the Categories Management page.

**Change:** Sidebar shows one "Categories" link that routes to `mgmt` with `catFilter='all'`. The Review Later badge remains on the single entry.

**Cleanup:** The legacy `if(k==='income') { catFilter='revenue'; } else if(...) { ... }` routing block is kept for compatibility but no longer has any links pointing to it.

## F8.2 — Sidebar Review Later badge → small circle (D45)

**Why:** The original `.nav .badge` was a full-width pill ("Review Later · 3"). Visually heavy.

**Change:** New `.nav .review-pill` class: `display: inline-flex; min-width: 18px; height: 18px; border-radius: 50%; background: var(--badge); color: var(--badge-ink); font-size: 11px; font-weight: 600; line-height: 1; padding: 0 4px`. Renders as a small colored circle next to the "Categories" link. `refreshBadge()` simplified to just `b.textContent = String(n)`.

## F8.3 — Step 6 (Final review) count fix (D44)

**Why:** Counts showed `0` for Income / Expense / Other because the code used `e.on` (a round-2 leftover field that's been undefined since round 4). Round 4 replaced `e.on` with `is_hidden` / `is_deleted`, but step 6's review code never migrated.

**Fix:** Changed `state.expenses.filter(e=>e.on).length` → `state.expenses.length` (and same for income / other). Now Step 6 shows the actual totals.

## F8.4 — Sidebar link: lower-cased sub-link styling cleanup

**Why:** The Categories sidebar link is the only "real" sub-link after the round-7 collapse of three links to one. The "•" bullet prefix is from the old sub-link class.

**Change:** None yet. The "•" is harmlessly styled; not a regression.

## F8.5 — Add modal Type locked in wizard context (D46/D47 reversed)

**Why:** Round 7 had the Add-modal Type free everywhere. Per Patrick, the wizard should always lock Type to the calling step; only Categories Management (outside the wizard) gets free Type.

**Change:**
- `__openAdd(kind)` now sets `inWizard = state.screen === 'cats'`.
- Type select gains `disabled` when in wizard (matching Edit modal behavior).
- Free-Typer label changes to "(locked — wizard context)".
- Categories outside the wizard (management): Type is fully free.

## F8.6 — Settings page segmented into tabs (D49)

**Why:** The bare settings page had a long list of mixed concerns. Patrick: top-of-page tabs (General | Categories | Other).

**Change:**
- New `state.settingsTab` state with three values: `'general' | 'categories' | 'other'`. Default `'general'`.
- `renderSettings()` now renders a tab strip at the top of the panel and switches the body content based on the active tab.
- Each tab is its own `<div>` of content: General has the setup-wizard-derived business fields; Categories has the cat-default-sort + show-account-numbers controls + Review Later badge toggle; Other has the display-only accounting method + fiscal year + business type + "Run setup wizard again".

## F8.7 — Settings → General has all setup-wizard business fields (D49 expanded)

**Why:** Round 7 had General with just `business_name + EIN + currency`. Patrick: General should have *everything* we did in the setup wizard.

**Change:** General section now includes:
- Your name (legal name)
- Business name
- Trade name (optional)
- What does your business do? (max 280 chars)
- NAICS picker (with `Look up NAICS →` button → same NAICS modal as the wizard)
- EIN
- Address (4 fields: street, street2, city, state, zip)
- Accounting method (dropdown; Cash default; Accrual disabled "coming later")
- Fiscal year starts
- Business started on (date)
- Currency
- Business type

All editable from settings. The Other tab was slimmed to just `Accounting method display-only · Fiscal year display-only · Business type display-only · Run setup wizard again action`.

## F8.8 — Numerical by code sort label + greyed out when Codes are off

**Why:** "Alphabetical by code" is incorrect — numbers sort numerically. And if account numbers are off, sorting by code makes no sense.

**Change:**
- Label: "Alphabetical by code" → **"Numerical by code"**.
- The radio gains `disabled` when `!state.showNumbers`. Disabled label has `opacity: .5` and an inline helper `(requires "Show 4-digit account numbers")`.
- The default sort (round 10) is now Alphabetical by name.

## F8.9 — Search bar focus bug fix

**Why:** Typing in the search box lost focus after the first character. Cause: `oninput="...render()"` rebuilt `#root.innerHTML`, which destroyed the input element and lost focus.

**Fix:** New `window.__renderMgmtTable()` that updates only `#mgmt-table-wrap`'s `<thead><tr>` and `#mgmt-tbody`, plus the helper text. The search input persists across keystrokes. Verified by smoke test — `searchElBefore === searchElAfter` after typing one character.

---

## F9.1 — Categories Management: Transactions → Balance (D50)

**Why:** Income / Expense are flow-based (accumulates over time, doesn't hold a position at any instant). Asset / Liability / Equity are balance-based. Showing a single "Transactions" column conflated them.

**Change:**
- Column header: "Transactions" → "Balance".
- Row cells: Income / Expense rows show a muted `—` (no balance).
- Asset / Liability / Equity rows show the current dollar balance, formatted with thousands separator and a sign-aware minus (e.g. `−$12,500.00` for a credit card balance).
- Same logic applies to both `mgmtRow` (legacy per-tab render) and `mgmtUnifiedRow` (single-page render). The formatter is one line: `(b<0?'−':'') + '$' + Math.abs(b).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')`.

## F9.2 — Sample balances seeded into `state.txnCounts`

**Why:** The Balance cell needs data to actually render. Round 9 seeded: `'1000': 1284.50, '1010': 5300.00, '1100': 42.00, '2000': -318.20, '2100': -12500.00, '3000': -8000.00, '3010': 4200.00, '3020': -50.00`. Income / Expense account codes have no entry → resolve to `—` (matches the flow-based design).

---

## F10 — Default sort flipped to Alphabetical by name

**Why:** After multiple rounds of flipping between "Numerical by code" and "Alphabetical by name", Patrick confirmed the default should be Alphabetical by name.

**Change:** `state.catDefaultSort = 'name'` (was `'code'` after round 8). The Settings → Categories radio for Alphabetical by name is now the checked default. Numerical by code remains selectable when account numbers are on.

## F10b — Default Sort radios are `required`

**Why:** Belt-and-suspenders: the radio group must not allow zero-selected.

**Change:** Added `required` to both radio `<input>` elements in Settings → Categories. The browser refuses form submission if both are unchecked; combined with the `catDefaultSort` default never being unset programmatically, the app can never reach a state where no default sort is selected.

---

## F12 — Mgmt table: Code column moved to leftmost

**Why:** Patrick wants the Code column on the very left when account numbers are enabled.

**Change:**
- The `mgmtUnifiedRow` function already rendered Code first (the row order has been Code | Name | Type | Tax Line Item | Balance | Actions since round 11); only the headers were out of sync.
- Both header strings (one in `renderMgmt`, one in `__renderMgmtTable`) now render Code first when `state.showNumbers`.

---

## F13 — Mgmt column widths: Code shrunk to 60px, Name takes 30%

**Why:** Even at the new "Code first" position, default column distribution was giving Code too much width for its content (4-5 digits). Name was getting squeezed.

**Change:** Explicit `<th>` inline widths:
- **Code**: `width: 60px` (was implicit ~equal-share)
- **Category Name**: `width: 30%` (only when accounting codes are on; otherwise reverts to natural width)
- **Type**: `width: 120px`
- **Tax Line Item**: `auto` (takes leftover)
- **Balance**: `width: 120px`
- **Actions**: `width: 140px`

`table-layout: fixed` makes the first row's widths authoritative. Both header-render blocks were updated identically.

---

## F14 — Pin emoji removed from Review Later rows

**Why:** The `tr.review-later td:first-child::before { content: "📌 " }` rule prefixed every Review Later row with a pin emoji. Patrick found it noise.

**Change:** Set the same rule's `content` to `""` (empty string). Keep the rule (CSS rule kept for future styling hooks; effectively does nothing now).

---

# Summary across all rounds 2–14 (2026-07-08)

| Round | Commit    | Summary                                                               |
|-------|-----------|-----------------------------------------------------------------------|
| 2     | 53621b5  | Merge steps 2/3/5 into "Basic business info"; NAICS modal; sort headers |
| 3     | 3ea703d  | Strip Schedule C from step 2; rename Your Name; fix step 6 row buttons  |
| 4     | 521e609  | Chantelle strip; structural Categories rework; Right-side Hide/Delete    |
| 5     | (bundled in 521e609) | Single-page Categories Mgmt with search + 4 filter chips + Show hidden |
| 6     | 521e609  | Welcome checkbox; IRS Form 1040 first; Tax Line Item column; step 5 = Review Later |
| 7     | 6c70c48  | Edit modal hide-Code + Type picker + Notes; viewport sizing; Settings tabs |
| 8     | 7c8180e  | Step 5 trim; search focus fix; Add modal Type lock; Settings General overhaul |
| 9     | bdc371f  | Categories Mgmt "Transactions" → "Balance"                            |
| 10    | 8da5742  | Default sort flipped to Alphabetical by name                          |
| 11    | 1a9588b  | Default Sort radios `required`                                        |
| 12    | a6f0cd4  | Code column moved to leftmost                                          |
| 13    | 8f0e51f  | Mgmt column widths: Code shrunk to 60px, Name takes 30%               |
| 14    | ec4bbb8  | Pin emoji removed from Review Later rows                               |

Spec decisions locked across rounds 2–14: **D15–D51** in `SETUP_AND_CATEGORIES.md`. (D1–D14 are from prior sessions.)

Smoke test grew from 48 assertions (round 3) → 76 (round 4) → 100 (round 5) → 121 (round 6) → 144 (round 7) → 172 (rounds 8+ final).

---

## Open follow-ups

### Out of this session's scope but flagged for next session

1. **Stale sidebar counts** still hardcoded `Income (4) / Expenses (18) / Other (8)`. The sidebar was collapsed to a single Categories link in round 7 — these text counts aren't visible anywhere now and probably don't matter, but if there's a "Categories expansion" feature where the user expands the Categories sidebar entry, the counts would re-appear. Worth checking whether the round-7 collapse is permanent.

2. **`state.activeTab`** is now dead code — set on `screen='mgmt'` but not read by `mgmtUnifiedRow`. Quick clean-up, no behavior change.

3. **Legacy `catFilter` routing** at the bottom of the script (`if(k==='income') ... else if(...) ...`) — never reached after the sidebar collapse. Safe to delete.

### Not blocking, mentioned earlier in the day

4. **`wireframe-maker` skill proposal** still quarantined. Two SKUs: `wireframe-maker-20260708-c5844a9872` (full) and `wireframe-maker-20260708-26ba8cb400` (slim). Auto-scan failed both with the same generic reason. **Needs Patrick-side un-quarantine** before any apply can succeed. The skill itself was used in *every round today* (single-file convention, vanilla JS state machine, jsdom smoke test harness, Chrome headless screenshots, sibling FEEDBACK docs, commit format, smoke-test-as-validation) — all derived directly from the skill content.

5. **Spend halt + daemon downgrade** flags from the 6+ hour gap yesterday were never reset. Worth a question when Patrick comes back: do we flip them off now that the session is healthy?

---

*Captured by Rusty from Patrick's webchat messages 2026-07-08 11:15 MDT–15:54 MDT. Applied in commits `6c70c48`, `7c8180e`, `bdc371f`, `8da5742`, `1a9588b`, `a6f0cd4`, `8f0e51f`, `ec4bbb8`. Smoke test passing 172/172. Doc lock-in for next session.*
