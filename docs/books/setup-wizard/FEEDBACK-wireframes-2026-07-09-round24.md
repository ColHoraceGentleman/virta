# FEEDBACK — Virta Books v2 wireframes round 24: Amount label is always "Amount"

**Author:** Rusty + Patrick Bailey
**Window:** 2026-07-09 12:04 → 12:08 MDT (webchat)
**Baseline:** Round 22+23 (Account→Category, add Name) at commit `06ed31e`.
**Status:** Simplified D64. Amount field label is always "Amount"; type-specific copy lives in the helper text. **Smoke test 239/239 passing.**

---

## What changed

Patrick: *"That is equivalent to 'Amount' so that one is fine."*

He was reading my round 23 spec, which still said the Amount label changed per Type: "Amount of Expense" / "Change in the Asset" / "Change in the Liability" / "Change in Owner's Equity". His point: the per-type labels were decoration — they all mean the same thing (the dollar amount of the change). The type-specific information belongs in the helper copy, not the label.

### `WIREFRAMES.html`

- **`labelsFor()` function**: all five type entries now return `label: 'Amount'`. The `pos` / `neg` helper copy strings are unchanged — those still vary per type.
- **Modal Amount field default label** (line ~1068): `<label id="je-change-label">Amount of Expense</label>` → `<label id="je-change-label">Amount</label>`. The default helper text under the field is the Expense copy, which `render()` overwrites on Type change anyway.

### `tests/wf-smoke.mjs`

- Updated 6 R18 assertions that were checking for type-specific labels:
  - Initial modal: label is "Amount" (was "Amount of Expense")
  - Switching to Liability / Equity / Income / Asset: label is still "Amount"; only the helper copy changes
- Helper-copy assertions unchanged (they were already checking the right thing).

**Smoke test result: 239/239 passing.**

### `SETUP_AND_CATEGORIES.md`

- **D64 revised**: Amount label is always "Amount". Type-specific copy lives in the helper text under the field, with full table of what each type renders.
- Status header: appended "Round 24 applied 2026-07-09 (manual-entry modal: simplified D64 — Amount label is always 'Amount'; type-aware copy lives only in the helper text under the field; 'Change in the Asset' / 'Change in the Liability' / 'Change in Owner's Equity' labels removed)."

### `VIRTA_BOOKS_V2.md`

- Change log: new row for round 24.

---

## Resulting Amount field (D64 final)

The label is always "Amount". The helper text below is type-aware:

| Type | Helper copy under the Amount field |
|---|---|
| Expense (default) | "Positive = You spent this much. Negative = You got a refund (or a negative expense)." |
| Income | "Positive = You earned this much. Negative = You had a reversal." |
| Asset | "Positive = The asset went up. Negative = The asset went down." |
| Liability | "Positive = You paid it down. Negative = You took on more debt." |
| Equity | "Positive = Owner took money out. Negative = Owner put money in." |

The helper copy updates the moment the user picks a different Type.
