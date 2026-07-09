# FEEDBACK — Virta Books v2 wireframes round 27: Matched with restored to default view

**Author:** Rusty + Patrick Bailey
**Window:** 2026-07-09 13:43 → 13:48 MDT (webchat)
**Baseline:** Round 26 (manual-entry modal redesign, Cinder-built) at commit `e84f780`.
**Status:** Matched with field restored to default view. **Smoke test 255/255 passing.**

---

## What changed

Round 26 collapsed Matched with behind a `+ Add Matched with` link. Patrick flagged at 2026-07-09 13:43 MDT that this is wrong: **Matched with is required for double-entry accounting**. Without it, the system cannot balance the entry. Required fields should always be visible.

Round 27 reverts just the Matched with change. Description and Note remain collapsed behind `+ Add X` links because they are genuinely optional.

> **Round 27 also surfaced deeper layout concerns with the modal** that Patrick wants deferred to Phase 7 (when we revisit the modal as a proper design pass, not a quick fix). Those concerns are documented on the Phase 7 Virta Tasks card (note id `4d4b17f919aa8122a9de48e904594b25`).

### `WIREFRAMES.html`

- **`__openManualEntry()` line ~1099-1105**: removed the `je-matched-link-wrap` div (the `+ Add Matched with` button) and the `style="display:none"` on `je-matched-field`. Matched with now renders in the default view, same as Date / Type / Category / Name / Amount.
- Removed the "remove" link on Matched with (since it's required — can't be removed).
- **`__jeSave()` line ~1180**: removed the call to `__jeToggleField('matched', false)` since Matched with no longer toggles. The function now only collapses Description and Note.

### `tests/wf-smoke.mjs`

- Updated 2 R26 assertions:
  - The `+ Add Matched with` link assertion now reads "link is NOT in the default view (R27: required, always visible)" — passes when the link text is absent.
  - The "Description / Matched with / Notes NOT visible at modal-open" assertion now checks `isHidden(descField) && isVisible(matchedField) && isHidden(noteField)` — Matched with must be visible, Description and Note must be hidden.

**Smoke test result: 255/255 passing.**

### `SETUP_AND_CATEGORIES.md`

- Status header: appended round 27 entry.

### `VIRTA_BOOKS_V2.md`

- Change log: new row for round 27.

### Virta Tasks cards

- **Phase 1: Chart of Accounts foundations** — closeout note posted (id `f3c0e093c28e9661070cfba5bba66e91`) covering all decisions (D51-D71), commits, and what's deferred to Phase 2.
- **Phase 7: Manual journal entries** — concerns note posted (id `4d4b17f919aa8122a9de48e904594b25`) capturing Patrick's feedback about required-field-hidden, layout-space waste, visual design, modal chrome, and validation. Phase 7 stays in Prioritized; will not start until Phase 2 GL architecture ships.

---

## Phase 1 status after round 27

Still design-complete. Functional enough to ship Phase 2 against (the modal does post to the GL via the placeholder `__jeSave`). Layout polish and visual design overhaul are explicitly out of scope for Phase 1 and parked on the Phase 7 card.

## What's next

Phase 2 GL architecture (your call to start): GL filter bar + GL posting rules + audit log click-to-reveal + real `__jeSave` implementation.
