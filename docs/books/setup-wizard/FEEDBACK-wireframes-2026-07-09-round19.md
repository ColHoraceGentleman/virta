# FEEDBACK — Virta Books v2 wireframes round 19: manual-entry Description uses a placeholder

**Author:** Rusty + Patrick Bailey
**Window:** 2026-07-09 11:52 → 11:55 MDT (webchat)
**Baseline:** Round 18 (Type picker first) at commits `653b185` + `6e0c32e` + `fbb6e77`.
**Status:** Description field switched from a pre-filled default value to a placeholder. **Smoke test 234/234 passing.**

---

## What changed

The manual-entry modal had `<input id="je-desc" placeholder="What happened?" value="Owner draw adjustment">`. The `value="Owner draw adjustment"` was a stale leftover from the original D61 form mockup — meant to show what a filled-in field looks like, but it was loading every time the user opened the modal and pre-populating the field with example data. Confusing.

Patrick: *"The default text in the description says 'Owner draw adjustment' - I think it should just say something like 'enter a description' or something in greyed out sample text."*

Fixed: removed the `value=` attribute, kept the `placeholder=`, and made the placeholder more concrete with examples.

### `WIREFRAMES.html`

- **Modal Description field (line ~1072)**: `value="Owner draw adjustment"` removed. `placeholder=` kept, expanded to `"e.g. Office supplies from Amazon, customer refund, paid credit card"` so the user has concrete examples to model from.

### `tests/wf-smoke.mjs`

- **+2 new assertions** (R19):
  - Description field uses a `placeholder="…"` and has no `value=` (no pre-filled defaults)
  - Modal HTML does not contain the literal string "Owner draw adjustment"
  - Placeholder gives at least one concrete example ("Office supplies" or "refund")

**Smoke test result: 234/234 passing.**

### `SETUP_AND_CATEGORIES.md`

- Status header: appended "Round 19 applied 2026-07-09 (manual-entry Description field uses a placeholder, not a pre-filled 'Owner draw adjustment' default value)."

### `VIRTA_BOOKS_V2.md`

- Change log: new row for round 19.

---

## Related (flagged, not changed)

The **Change** field still has `value="250.00"` (line ~1067). Patrick didn't flag this one — it may be intentional as a "you're likely entering a number, here's a starting point" pattern, or it may be the same leftover-defaults problem. I left it alone to avoid scope creep. If you want it cleared, that's a one-line edit.

The **Date** field still has `value="2026-07-11"` (today's date). That one is *intentional* — opening the modal should default to today's date, not leave the field blank. Not changed.
