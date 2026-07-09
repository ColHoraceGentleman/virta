# FEEDBACK — Virta Books v2 wireframes round 25: manual-entry modal layout overhaul

**Author:** Rusty + Patrick Bailey
**Window:** 2026-07-09 12:13 → 12:25 MDT (webchat)
**Baseline:** Round 24 (Amount label is always "Amount") at commit `db2b202`.
**Status:** Bug fixes + layout overhaul. Wireframe + spec + smoke test updated. **Smoke test 239/239 passing.** Lore spawned for UX research in parallel.

---

## What broke and what changed

Patrick flagged three issues with the manual-entry modal:

1. **Category dropdown was empty** — clicking it showed a blank list.
2. **Save button was off the bottom of the screen** — couldn't scroll to it.
3. **Layout "kind of sucks"** — Name was buried below Amount, fields felt cramped.

All three fixed in this round. Lore spawned in parallel to research what QB / Sage / Zoho / Xero / Wave / FreshBooks do — that research will inform a future round.

### Bug fix 1: Category dropdown was empty

Root cause: round 22 restructured the Account row so the static `<label>` was in the template, but the `<select id="je-account">` options were filled by `render(initialType)` via a `setTimeout(()=>..., 0)`. The setTimeout fires *after* the modal opens, so the user sees an empty select for one tick.

Fix: inlined the initial `accountOptionsFor(initialType)` directly in the template. The select is populated at modal-open time. `render()` now only updates the inner options when the user changes Type — no setTimeout needed. Removed the setTimeout call.

### Bug fix 2: Save button was unreachable

Root cause: the modal was 540px wide with no max-height, so on a 768px viewport the form fields pushed the Save button below the fold, and the modal didn't scroll.

Fix: modal CSS now has `max-height: 90vh; display: flex; flex-direction: column;`. The `.body` is `flex: 1 1 auto; overflow-y: auto`. Header and footer are naturally pinned (no overflow). Save button always reachable, form scrolls if too tall.

### Layout: field order, single-column, polish

**New field order** (Patrick: *"We should have the name higher"*):

1. Date (today)
2. Type (Expense / Income / Asset / Liability / Equity, defaults Expense)
3. Category (filtered by Type)
4. **Name** (moved up — was between Amount and Description)
5. Amount (label always "Amount", type-aware helper text)
6. Description (added a one-line helper: "Optional, but useful for finding this entry later.")
7. Matched with (any account, defaults to default cash)
8. Notes (now labeled "Notes *(internal only)*" with helper text "Not shown in the GL table. Only visible when you open transaction details.")

The reading order is now: **when (date) → what kind of change (type) → which account (category) → who (name) → how much (amount) → why (description) → the other side (matched with) → private notes**. Each field leads naturally to the next.

**Layout**: switched from a 2-column CSS grid (160px label + 1fr field) to a single-column flex layout with full-width fields. The 2-column grid was cramped when fields had long helper text. The single-column layout reads more like a natural form.

**Small polish:**
- Description field has a one-line helper explaining why you'd fill it in.
- Notes field is labeled "(internal only)" so it's clear it doesn't show in the GL.
- The big infobox at the top of the modal was reworded to match the new field order: *"Pick the type of account that changed, then the specific category, the amount, and who it's with..."*

### `WIREFRAMES.html`

- **CSS (line ~108)**: `.modal` now has `max-height: 90vh; display: flex; flex-direction: column`. `.modal .body` now has `overflow-y: auto; flex: 1 1 auto`.
- **`__openManualEntry()` rewritten** (line ~1016):
  - Removed `setTimeout(()=>render(initialType), 0)` and the `// initial render` comment.
  - Inlined `${accountOptionsFor(initialType)}` directly in the `<select id="je-account">` element.
  - Switched the layout container from CSS grid (`display: grid; grid-template-columns: 160px 1fr`) to single-column flex (`display: flex; flex-direction: column; gap: 14px`).
  - Reordered fields: Name is now right after Category, before Amount.
  - Removed `id="je-change-label"` from the Amount `<label>` (the label is no longer dynamic — it's always "Amount").
  - Tightened the top-of-modal infobox to match the new field order.
  - Added helper text to Description.
  - Added "(internal only)" suffix to the Notes label and a one-line helper.

### `tests/wf-smoke.mjs`

- Updated 6 R18/R24 assertions that referenced `id="je-change-label"` (now removed) and `id="je-account-row"` (now removed). They check for the new `id="je-account"` and plain `<label>Amount</label>`.
- All other assertions pass without changes.

**Smoke test result: 239/239 passing.**

### `SETUP_AND_CATEGORIES.md`

- Status header: appended round 25 entry with full list of changes.

### `VIRTA_BOOKS_V2.md`

- Change log: round 25 row + round 26 row (Lore research spawned).

---

## What's next (waiting on Lore)

Lore is researching manual-entry UX patterns from QB / Sage / Zoho / Xero / Wave / FreshBooks. When her report lands, we'll pick which patterns to adopt and which to skip. Likely next round: a second layout pass informed by the research, plus any spec changes (e.g., if research suggests we should split "Matched with" into a more discoverable control).
