# CINDER_REPORT_b3a-fixes.md — Categories Wizard B3a NEEDS-FIX round

**Builder:** Cinder (sonnet-5)
**Build under review:** B3a fixes — Wren's NEEDS-FIX round (2 SIGNIFICANT, 1 NIT)
**Date:** 2026-07-14 15:51 MDT
**Wren review:** `WREN_REPORT_b3a.md`
**Spec source of truth:** `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md` §7 Steps 1-3, §10 defaults
**New commits:** `ea7836e` (system-account guard), `1ab7a47` (DEFAULT_EXPENSES/INCOME §10 alignment)

---

## Status: DONE

## Summary

Fixed SIGNIFICANT-1 (system account Hide/Delete guard) + SIGNIFICANT-2 (`DEFAULT_EXPENSES`/`DEFAULT_INCOME` re-aligned with spec §10 verbatim). NIT-1 deferred per Wren's own recommendation (underlying behavior is correct; only the QA harness assertion is weak — future harness cleanup, not this round).

---

## Files touched

### `client/src/books/CategoriesWizardExpensesStep.jsx`
- **+11 / -6 lines** net across two edits.
- `IRS_LINE_OPTIONS`: added `Line 15a`, `Line 15b`, `Line 25a`, `Line 25b` (previously missing). These are needed because the spec-accurate defaults now use those exact lines for Mortgage Interest, Interest, Utilities, and Phone — without this the tax-line popover would show "— None —" for those rows despite a valid seeded value. This is a direct, necessary consequence of the SIGNIFICANT-2 data swap, not scope creep.
- Hide/Delete action cell (~lines 211-249): both buttons now check `acc.system` first. System rows render a disabled `<span>` with `title="Review Later can't be hidden or deleted."` instead of the active button — mirrors the existing rename-guard's visual treatment (muted text + `cursor-not-allowed` + tooltip) rather than inventing a new pattern.

### `client/src/books/CategoriesWizard.jsx`
- **+44 / -34 lines** net across two edits.
- `DEFAULT_EXPENSES`: full 23-row table replaced with the exact §10 transcription (see Spec Compliance table below).
- `DEFAULT_INCOME`: audited against §10's Income table — already an exact match (no code change, comment updated to document the audit).
- `hideAccount` / `deleteAccount` callbacks: both now look up the target account by id across `expenses`+`income` before mutating, and short-circuit (return unchanged state / skip the API call) if `target.system === true`. Applied to both the local `setState` path and the best-effort `server-` prefixed PATCH/DELETE call.

### `client/src/books/CategoriesWizardIncomeStep.jsx`
- **No change.** Audited per the task brief: `DEFAULT_INCOME` has zero rows with `system: true` today, so there's no live system-income-account path to guard. The existing rename-guard pattern (`!acc.system && startEditName(acc)`) is already present for parity if a system income account is ever added later — confirmed by reading the file, not modified.

---

## Behavior verification

| ID | Behavior | Verification |
|---|---|---|
| VB-CATWIZ-STEP2-05 | Hide toggles `is_hidden` | QA harness: re-ran, still passes on a non-system row (`label=Unhide`). Live CDP probe: `expense-hide-disabled-expense-6999` DOM node exists with `title="Review Later can't be hidden or deleted."` — confirmed via `evalValue` returning `true` + exact title string, then visually confirmed via screenshot (greyed-out vs. active rows). |
| VB-CATWIZ-STEP2-07 | Delete confirmed calls DELETE | QA harness: re-ran, still passes (`before=23 after=22` on a non-system row). Live CDP probe: `expense-delete-disabled-expense-6999` exists with the same tooltip; Review Later is not deletable at all, so no confirm-modal path exists for it. |
| VB-CATWIZ-STEP2-10 | Delete disabled w/ tooltip if `transactions_count > 0` | Unaffected by this round's fix — the `hasTx` branch is now nested after the `acc.system` check but preserves identical behavior for non-system rows with transactions. QA harness still passes (unchanged assertion). |
| All other 20 IDs | Data-table swap shouldn't change rendering/sorting/PATCH | Full harness re-run: **23/23 passing**, matching pre-fix count exactly — no regressions. |

Live CDP probe output (verbatim):
```
hideDisabled: true title: Review Later can't be hidden or deleted.
deleteDisabled: true title: Review Later can't be hidden or deleted.
```

---

## Diff vs Wren's report

**SIGNIFICANT-1** — Wren: *"clicking Review Later's Hide button flips its label to 'Unhide' (Hide is not blocked)... clicking Delete → confirming in the modal actually removes the row."*
→ Changed: Both Hide and Delete are now gated on `acc.system`, rendering a disabled span + tooltip instead of an active control, in `CategoriesWizardExpensesStep.jsx`. Also added defensive guards in `CategoriesWizard.jsx`'s `hideAccount`/`deleteAccount` state mutators per Wren's explicit ask ("add a defensive system-guard there too"), so no future code path can bypass the UI guard.

**SIGNIFICANT-2** — Wren: *"21 of 23 default expense rows differ in name and/or Schedule C line from the spec's canonical table."*
→ Changed: `DEFAULT_EXPENSES` replaced wholesale with the verbatim §10 table. All 23 rows now match spec exactly on name, code, and Schedule C line. `DEFAULT_INCOME` audited (already correct, no change).

**NIT-1** — Wren: *"QA harness has two placebo assertions."*
→ Skipped per task instructions (Wren confirmed underlying behavior is correct; harness cleanup deferred to a future round).

---

## Spec compliance — DEFAULT_EXPENSES, before vs after (proof)

| Code | Spec §10 Name | Spec §10 Line | Shipped BEFORE (Wren's review) | Shipped AFTER (this fix) | Match? |
|---|---|---|---|---|---|
| 6000 | Accounting | Line 16b | Accounting / Line 17 | Accounting / Line 16b | ✅ |
| 6010 | Advertising | Line 8 | Advertising / Line 8 | Advertising / Line 8 | ✅ (unchanged, was already correct) |
| 6020 | Car & Truck | Line 9 | Bank Fees / Line 27a *(non-spec row)* | Car & Truck / Line 9 | ✅ |
| 6030 | Commissions | Line 10 | Business Insurance / Line 15 *(non-spec row)* | Commissions / Line 10 | ✅ |
| 6040 | Contract Labor | Line 11 | Car & Truck / Line 9 | Contract Labor / Line 11 | ✅ |
| 6050 | Depletion | Line 12 | Commissions & Fees / Line 10 | Depletion / Line 12 | ✅ (previously missing entirely) |
| 6060 | Depreciation | Line 13 | Contract Labor / Line 11 | Depreciation / Line 13 | ✅ |
| 6070 | Insurance | Line 14 | Depreciation / Line 13 | Insurance / Line 14 | ✅ (previously missing; "Business Insurance" existed at wrong code/line) |
| 6080 | Interest | Line 15b | Dues & Subscriptions / Line 27a *(non-spec row)* | Interest / Line 15b | ✅ (previously missing entirely) |
| 6090 | Legal & Professional | Line 16a | Legal & Professional Services / Line 17 | Legal & Professional / Line 16a | ✅ |
| 6100 | Meals | Line 24b | Licenses & Fees / Line 23 *(non-spec row)* | Meals / Line 24b | ✅ |
| 6110 | Mortgage Interest | Line 15a | Meals (50% deductible) / Line 24b | Mortgage Interest / Line 15a | ✅ (previously missing entirely) |
| 6120 | Office Expense | Line 17 | Office Expenses / Line 18 | Office Expense / Line 17 | ✅ |
| 6130 | Phone | Line 25b | Payroll & Wages / Line 26 | Phone / Line 25b | ✅ (previously missing; folded into "Utilities") |
| 6140 | Rent | Line 19 | Postage & Shipping / Line 27a *(non-spec row)* | Rent / Line 19 | ✅ |
| 6150 | Repairs & Maintenance | Line 20a | Rent or Lease / Line 20b | Repairs & Maintenance / Line 20a | ✅ |
| 6160 | Retirement | Line 18 | Repairs & Maintenance / Line 21 | Retirement / Line 18 | ✅ (previously missing entirely) |
| 6170 | Supplies | Line 20b | Software & Subscriptions / Line 27a *(non-spec row)* | Supplies / Line 20b | ✅ |
| 6180 | Taxes & Licenses | Line 21 | Supplies / Line 22 | Taxes & Licenses / Line 21 | ✅ |
| 6190 | Travel | Line 24a | Taxes & Licenses / Line 23 | Travel / Line 24a | ✅ |
| 6200 | Utilities | Line 25a | Travel / Line 24a | Utilities / Line 25a | ✅ |
| 6210 | Wages | Line 26 | Utilities / Line 25 | Wages / Line 26 | ✅ |
| 6999 | Review Later | _(none)_ | Review Later / null, system | Review Later / null, system | ✅ (unchanged, already correct) |

**Result: 23/23 rows now match spec §10 exactly** on name, code, and Schedule C line. All 5 previously-missing categories (Depletion, Insurance, Interest, Mortgage Interest, Phone — plus Retirement, which Wren didn't call out by name but was also absent) are now present; all 5 non-spec additions (Bank Fees, Dues & Subscriptions, Licenses & Fees, Postage & Shipping, Software & Subscriptions) have been removed.

### DEFAULT_INCOME — audit result (no change needed)

| Code | Spec §10 Name | Spec §10 Line | Shipped | Match? |
|---|---|---|---|---|
| 4000 | Sales | Part I line 1 | Sales / Part I line 1 | ✅ |
| 4010 | Refunds & Returns | Part I line 7 | Refunds & Returns / Part I line 7 | ✅ |
| 4020 | Other Income | Part I line 1 | Other Income / Part I line 1 | ✅ |

Income was already correct in the pre-fix build; no divergence found.

---

## Cross-cutting

- **QA harness re-run:** `node server/scripts/qa-b3a.mjs` → **23/23 passing** (confirmed live, twice — once after each commit's changes).
- **Wireframe smoke re-run:** `node docs/books/setup-wizard/tests/wf-smoke.mjs` → **255/255 passing**.
- **Dark-mode visual check:** Screenshots captured to `demos/2026.07.14-b3a-fixes/`:
  - `step2-expenses-fixed.png` — Step 2 table showing spec §10 names + Schedule C lines (Accounting/16b, Advertising/8, Car & Truck/9, Commissions/10, Contract Labor/11, Depletion/12, Depreciation/13, Insurance/14, Interest/15b, Legal & Professional/16a visible in frame) rendering correctly in dark mode (slate background, light text).
  - `step2-expenses-sorted-fixed.png` — same table, descending sort.
  - `step2-review-later-guard.png` — Review Later row scrolled into view: Hide and Delete both render as greyed-out, disabled spans (visually distinct from the bright active Hide/Delete links on other rows) with the `(System)` label still present next to the name.
- **No regressions:** `git diff --stat` across both new commits touches only `CategoriesWizard.jsx` and `CategoriesWizardExpensesStep.jsx` — no changes to `CategoriesWizardIncomeStep.jsx`, `CategoriesWizardStep1.jsx`, `CategoriesWizardProgress.jsx`, `PlaceholderAddAccountModal.jsx`, `BooksShell.jsx`, `api.js`, the QA harness, Setup Wizard files, `Transactions.jsx`, `Categories.jsx`, `Settings.jsx`, or `Dashboard.jsx`. `Settings.jsx`'s pre-existing uncommitted diff is untouched (confirmed via `git status` before and after).

---

## Judgment calls

1. **`IRS_LINE_OPTIONS` update (picker dropdown list) was not explicitly called out in the task brief but was a direct, necessary consequence of the SIGNIFICANT-2 data swap.** The spec-correct defaults for Mortgage Interest (15a), Interest (15b), Utilities (25a), and Phone (25b) use line values that weren't in the tax-line popover's `<select>` options before this fix. Without updating the options list, the popover would have shown "— None —" as the selected value for those 4 accounts despite them having a valid, spec-correct `irs_line` set on the data row — a visible regression introduced by fixing SIGNIFICANT-2 if left unaddressed. Fixed it as part of the same data-table-swap commit since it's the same root cause (§10 alignment), not a separate scope item.
2. **Disabled Hide/Delete UX treatment**: chose the muted `<span>` + tooltip pattern (matching the existing has-transactions delete-disable pattern already in the file) rather than inventing a new visual style, per the task brief's suggestion to "read the existing rename-guard implementation first to mirror the visual treatment." Used the same tooltip text for both Hide and Delete ("Review Later can't be hidden or deleted.") since spec says both are blocked for the same reason.
3. **Did not touch `CategoriesWizardIncomeStep.jsx`** — verified no system income accounts exist in `DEFAULT_INCOME`, so there's no live path needing the guard. Left as-is per the "DO NOT touch unless system income accounts exist" instruction.

## Out-of-scope findings

- None beyond what Wren already flagged. NIT-1 (QA harness placebo assertions for STEP1-02 and STEP2-10) remains open and deferred, as instructed.
