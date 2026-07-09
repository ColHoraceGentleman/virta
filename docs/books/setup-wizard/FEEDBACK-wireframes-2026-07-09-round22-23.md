# FEEDBACK — Virta Books v2 wireframes round 22+23: Account→Category, add Name

**Author:** Rusty + Patrick Bailey
**Window:** 2026-07-09 12:00 → 12:05 MDT (webchat)
**Baseline:** Round 21 ("Other account" → "Matched with") at commit `1906b4c`.
**Status:** Continued label-alignment between the manual-entry modal and the GL view. Account → Category (R22). Added Name (R23). **Smoke test 239/239 passing.**

---

## R22: "Account" → "Category"

Patrick: *"Yes, you should use the same titles as in the GL view."*

The GL table has a "Category" column. The manual-entry modal's "Account" picker is the same concept. Renamed for consistency.

### `WIREFRAMES.html`

- **Modal line ~1042** (in the `render()` function) and **line ~1064** (in the template): `<label>Account</label>` → `<label>Category</label>`.
- **Static structure restored**: the `<label>Category</label>` is now in the template (always present in the modal HTML); `render()` only fills in the inner `<select>` options and the help text. Fixes a race condition where the smoke test could read the modal before the setTimeout fired and miss the label.

### `tests/wf-smoke.mjs`

- Field-set assertion updated: `['Date','Type','Account',...]` → `['Date','Type','Category',...]`.

**Smoke test result: 238/238 passing.**

---

## R23: add Name; clarify "Change" is not a field; Notes is GL-internal

Patrick: *"The modal needs the name also. Don't know what you mean by 'Change' I don't see that in the modal. Notes is okay if it is not on the GL, that is something you would have to open up the transaction details to see."*

Two things here:

1. **Name field added** to the modal. The GL has a "Name" column (vendor / customer), so the modal needs to capture it.
2. **"Change" is not a field name** — it appears in the type-aware Amount label for Asset/Liability/Equity (e.g., "Change in the Asset"). For Expense/Income the label is "Amount of Expense" / "Amount of Income" with no "Change" word. So "Change" is part of the label copy, not a separate input. R23 makes this explicit in the spec.
3. **Notes is not in the GL** — it's a per-transaction detail field, only visible when the user opens transaction details. Confirmed and documented.

### `WIREFRAMES.html`

- **Modal new field** (between the Amount field and Description): **Name** with placeholder `"e.g. Amazon, Acme Corp, John Smith"` and helper copy `"Who this is with — vendor for expenses, customer for income. Optional."`. New input id `je-name`.

### `tests/wf-smoke.mjs`

- Field-set assertion updated to include `Name`.
- **+1 new assertion** (R23): Name field has a placeholder, no pre-filled value, and helper copy mentions both "vendor" and "customer".

**Smoke test result: 239/239 passing.**

### `SETUP_AND_CATEGORIES.md`

- **D62 revised** — full field list: `Date + Type + Category + Amount (label adapts per Type per D64) + Name + Description + Matched with + Notes`. Documented Name as vendor/customer, Notes as internal-only.
- **D64 revised** — clarified that "Change" is part of the Amount label for Asset/Liability/Equity, not a separate field.
- Status header: appended rounds 22 and 23.

### `VIRTA_BOOKS_V2.md`

- Change log: new rows for rounds 22 and 23.

---

## Resulting manual-entry modal field set

| Field | Source | Notes |
|---|---|---|
| Date | GL column "Date" | Defaults to today |
| Type | GL column "Type" | Defaults to Expense |
| Category | GL column "Category" | Picker filtered by Type |
| Amount | GL column "Amount" | Label adapts per Type per D64 ("Amount of Expense" / "Change in the Asset" / etc.) |
| Name | GL column "Name" | Vendor for expenses, customer for income. Optional. |
| Description | GL column "Description" | Optional |
| Matched with | GL column "Matched with" | Required (Other account picker, defaults to user's default cash) |
| Notes | — | Internal-only; only visible when user opens transaction details. Not in GL. |
