# FEEDBACK — Virta Books v2 wireframes round 20: clear all manual-entry defaults

**Author:** Rusty + Patrick Bailey
**Window:** 2026-07-09 11:54 → 11:57 MDT (webchat)
**Baseline:** Round 19 (Description placeholder) at commit `a3d27c2`.
**Status:** Cleared all stale defaults in the manual-entry modal. Type defaults to Expense; Date defaults to today; everything else is blank. **Smoke test 238/238 passing.**

---

## What changed

The manual-entry modal had three stale pre-filled values: Change (`250.00`), Date (`2026-07-11`, a hardcoded literal from when the modal was first written), and Description (`Owner draw adjustment`, fixed in round 19). Two remained.

Patrick's call: *"Yes, sorry, clear the amount. We should NOT pre fill any of the fields (except for type which defaults to 'Expense')."* Then after I cleared the Date too: *"Sorry, Date field should default to the current date."* Final rule: **Type = Expense (default), Date = today (computed at modal open), everything else blank.**

### `WIREFRAMES.html`

- **Modal Date field (line ~1055)**: `value="2026-07-11"` → `value="${new Date().toISOString().slice(0,10)}"`. Defaults to today at modal-open time.
- **Modal Change field (line ~1067)**: `value="250.00"` removed. Placeholder kept.
- (Round 19 already removed the Description `value="Owner draw adjustment"`.)

The Other account picker has no `value=` — it shows the first account in the list by default, which is fine (it's a dropdown, not a text field). The user can change it.

### `tests/wf-smoke.mjs`

- **+5 new assertions** (R20):
  - Change field has placeholder, no `value=`
  - Date field defaults to today (`value="YYYY-MM-DD"` regex) — not the stale `2026-07-11` literal
  - Modal HTML has no `value="250.00"` or `value="2026-07-11"`
  - Type dropdown has the Expense option marked `selected=""` (the one allowed default)

**Smoke test result: 238/238 passing.**

### `SETUP_AND_CATEGORIES.md`

- Status header: appended "Round 20 applied 2026-07-09 (manual-entry: clear stale defaults across Change, Date; Type defaults to Expense, Date defaults to today at modal-open time, Change and Description are blank placeholders)."

### `VIRTA_BOOKS_V2.md`

- Artifact row: smoke test now 238/238.
- Change log: new row for round 20.

---

## Resulting behavior when the user clicks "New entry"

| Field | Pre-fill | Notes |
|---|---|---|
| Date | Today (computed) | `<input type="date" value="2026-07-09">` on the day the modal is opened |
| Type | Expense | `<option value="Expense" selected>Expense</option>` |
| Account | (empty) | First account of the picked Type is shown by default; user picks |
| Change | (empty) | placeholder="0.00" |
| Description | (empty) | placeholder="e.g. Office supplies from Amazon, customer refund, paid credit card" |
| Other account | (empty) | First account in the list shown; user picks |
| Notes | (empty) | placeholder="Optional internal note" |
