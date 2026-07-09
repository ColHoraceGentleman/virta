# FEEDBACK — Virta Books v2 wireframes round 26: manual-entry modal redesign (FreshBooks pattern + Sage warning)

**Author:** Cinder (Builder) for Rusty
**Window:** 2026-07-09 12:42 → 13:00 MDT (subagent run)
**Baseline:** Round 25 (modal layout overhaul) at commit `46abbd6`.
**Inputs:** Rusty's `TASK-round26-redesign.md` + `redesign-manual-entry-proposal-2026-07-09.md` + Lore's `research-manual-entry-2026-07-09.md`.
**Status:** Wireframe + spec + smoke test updated. **Smoke test 255/255 passing.** Ready for Wren's code review.

---

## What changed

Patrick's "kind of sucks" feedback on the 8-field modal (round 25) is addressed: the modal now defaults to 5 fields, with the other 3 collapsed behind FreshBooks-style `+ Add X` links. Sage-style yellow warning fires when the user picks an import-driven account for Matched with. Footer gains a third button: **Save and new** (post + reset + keep modal open).

### Three patterns combined

1. **FreshBooks `+ Add X` collapse pattern** (Lore's top recommendation) — Description, Matched with, Notes collapse behind inline links. Click to expand; each expanded field has a small `remove` link that collapses it back.
2. **Sage-style contextual warning** (from Sage Business Cloud's "this is a special account" pattern) — yellow warning box appears under Matched with when the user picks a name containing import-driven tokens (`credit card, checking, savings, bank, stripe, paypal, venmo, square, plaid, import`). Re-runs on `onchange` so the warning tracks the selection in real time.
3. **Save and new button** (FreshBooks + Wave + most modern accounting apps) — secondary action in the footer, leftmost. Posts (placeholder for now), resets Amount/Name/Description/Matched with/Notes, collapses the optional fields back, keeps the modal open. Type and Date stay at their current values.

### Field order preserved

5 default-view fields stay in their round 25 order: **Date → Type → Category → Name → Amount**. Sign convention (D63: positive = up, negative = down) unchanged.

---

## `WIREFRAMES.html`

### CSS additions (~line 66, after `.infobox`)

- `.je-add-link` — small inline link styled like `.help`'s info color (`var(--info)`). Used for `+ Add X` triggers.
- `.je-remove-link` — smaller muted button for the per-field remove link.
- `.je-field-head` — flex row that puts the label on the left and the remove link on the right for expanded fields.

### `__openManualEntry()` rewritten (~line 1024)

- Default view renders **5 fields only**: Date, Type, Category, Name, Amount.
- Three `<div>` wrappers `id="je-desc-field"`, `id="je-matched-field"`, `id="je-note-field"` exist in the DOM but start `style="display:none"`.
- Each collapsed field has a sibling `id="je-{field}-link-wrap"` containing the `+ Add X` button (`button.je-add-link`).
- Type, Category (filtered by Type), Amount label + helper copy, Name placeholder, soft-warn copy at bottom of modal — all unchanged from round 25.
- Footer buttons changed from `[{Cancel}, {Save}]` to `[{'Save and new':'window.__jeSave(true)'}, {'Cancel':'closeModal()'}, {'Save (primary)':'window.__jeSave(false)'}]`. The `Save (primary)` label triggers the `__openModal` convention that auto-adds `class="primary"` to the button.

### New helpers (~line 1158)

- **`window.__jeToggleField(field, show)`** — shows/hides a collapsed field by id (`field` is `'desc' | 'matched' | 'note'`). When `field === 'matched'` and `show === true`, also re-runs `__jeCheckMatched(sel)` so the warning tracks the current selection on expand. When collapsing `matched`, hides the warning too.
- **`window.__jeCheckMatched(arg)`** — accepts either a `<select>` element (from `onchange="this"`) or a raw string value. Looks up the current selection, lowercases it, checks if it contains any of the 10 import-driven tokens. Toggles `#je-matched-warn` `display` accordingly. Idempotent — safe to call repeatedly.
- **`window.__jeSave(keepOpen)`** — placeholder for Phase 2 GL architecture. `keepOpen=true` clears Amount/Name/Description/Matched with/Notes, collapses the 3 optional fields back to their `+ Add X` links, refocuses Date for fast next-entry typing, and leaves the modal open. `keepOpen=false` calls `closeModal()`. Both branches do NOT actually post to the GL yet — the placeholder is intentional and called out in the inline comments.

---

## `tests/wf-smoke.mjs`

### Updated existing assertions (2)

- **(P1) "8 fields" → (P1/R26) "5 fields"** — old assertion checked for Date/Type/Category/Name/Description/Matched with/Notes in the default-view HTML. New assertion only checks the 5 visible default-view labels. The 3 collapsed fields are now verified by a new (R26) assertion that asserts `display:none` on their wrappers.
- **(R19) Description placeholder check** — moved from modal-open to the new (R26) section, runs after `__jeToggleField('desc', true)` so the field is actually in the DOM.

### Added (R26) assertions (~16 new)

The new block lives right after the existing (R20) Type-default assertion. It re-opens the modal in a clean state to avoid contamination from the (R24) type-switching block.

1. **(R26/D62-revised)** Default view has 5 visible fields: Date, Type, Category, Name, Amount (5 `<label>` elements).
2. **(R26)** `+ Add description` link is present in the default view.
3. **(R26)** `+ Add Matched with` link is present in the default view.
4. **(R26)** `+ Add note` link is present in the default view.
5. **(R26)** Description / Matched with / Notes fields are NOT visible at modal-open (`display:none` on each wrapper, checked via `window.getComputedStyle`).
6. **(R26/D71)** Footer has Save and new button calling `__jeSave(true)`.
7. **(R26)** Save button has `class="primary"` and calls `__jeSave(false)` (verified via the existing `__openModal` convention).
8. **(R26)** Footer has Cancel button calling `closeModal()`.
9. **(R26)** Clicking `+ Add description` shows the Description field with placeholder + helper copy.
10. **(R26)** After expanding Description, a `remove` link is visible inside the field wrapper.
11. **(R19 moved to R26)** Description field has a placeholder, not a pre-filled value (no `Owner draw adjustment` defaults).
12. **(R26)** Clicking remove collapses Description back to its `+ Add description` link.
13. **(R26)** After expanding Matched with, the Account dropdown is populated with all accounts (asserts >=10 options; got 33 — all non-system accounts).
14. **(R26/D70)** Initially (no account picked), the Sage warning under Matched with is hidden.
15. **(R26/D70)** Picking an import-driven account (`Business Checking`) shows the Sage warning mentioning "Heads up", "statement imports", and "reconcile".
16. **(R26/D70)** Picking a non-import account (`Office Supplies`) hides the Sage warning.
17. **(R26/D70 bonus)** A name like `Stripe` (which contains the token but isn't in the seeded accounts) also triggers the warning — proves the check works on the token list, not on a hardcoded account id.

**Smoke test result: 255/255 passing** (was 239/239 before this round; +16 new assertions).

---

## `SETUP_AND_CATEGORIES.md`

### Status header

Appended a Round 26 entry to the existing status header. Mentions: 8→5 default-view fields, FreshBooks collapse pattern, Save and new, Sage-style warning for import-driven accounts.

### D62 revised

D62 previously said "eight fields" visible by default. Now reads: **eight fields total, but the default view shows only 5** (Date, Type, Category, Name, Amount). The other 3 collapse behind FreshBooks-style `+ Add X` links with inline `remove` links. Field order, Type-picker-first rule, D63 sign convention, no-drafts rule — all preserved.

### D65 lightly updated

The "single Save button" line in D65 was technically contradicted by D71's three-button footer. Reworded to "single Save action" with a parenthetical noting that Save and new is a fast-path variant, not a draft split. The "no Save draft / Post entry split" rule stays intact.

### D70 added (Sage warning)

Locks the import-driven token list (`credit card, checking, savings, bank, stripe, paypal, venmo, square, plaid, import`), the yellow softwarn visual treatment, the exact copy ("Heads up: This account is usually updated by statement imports. A manual entry will create a separate transaction that you will need to reconcile against the import later."), and the `onchange` re-check behavior.

### D71 added (Save and new)

Locks the 3-button footer order (Save and new / Cancel / Save), the per-field reset behavior on Save and new (Amount, Name, Description, Matched with, Notes cleared; optional fields collapsed back; Type and Date preserved), and the `__openModal` convention for the primary Save button.

---

## `VIRTA_BOOKS_V2.md`

- Artifact row counts bumped: wireframe 1425→1554 lines, spec 868→872 lines + decisions D1-D71, smoke test "~680"→"~810" lines.
- Smoke test status row updated to **255/255 passing**.
- Change log: appended a Round 26 row with the summary above. The "in flight" Lore-research row stays (separate concern).
- Feedback archive list expanded to list every round 16–25 doc individually.

---

## Decisions / deviations from the task brief

1. **`Save (primary)` literal label.** The brief said "you can name a button `Save (primary)` or use any label that contains `primary`" — I went with the literal `Save (primary)`. It reads as a design token (parenthesized word is the styling class) and the smoke test asserts the `class="primary"` attribute, not the label text. If Patrick wants a cleaner label like just `Save`, we can refactor `__openModal` to take an explicit `primary` flag — flagging for Wren in case it bothers her.
2. **`__jeToggleField` is idempotent and accepts the field id as a string.** The brief implied a single helper. I made it work for all 3 collapsed fields via the `'desc' | 'matched' | 'note'` argument. Means one helper, one source of truth for collapse logic.
3. **`__jeCheckMatched` accepts either a `<select>` element or a string.** The brief said "the warning check is also triggered on `onchange` of the Matched with select" — I made the function work with both `(this)` from `onchange` and a raw string for direct smoke-test calls. Same code path either way; one source of truth for the token list.
4. **`__jeSave` is a placeholder.** The brief explicitly said "Don't add real GL posting logic to `__jeSave`. That's Phase 2." I added a comment marking it as such, plus a TODO marker in the function body so the next person knows where to land the real posting.
5. **CSS classes are minimal.** Added three small classes (`.je-add-link`, `.je-remove-link`, `.je-field-head`) rather than re-skinning every FreshBooks element. The existing `.softwarn` class is reused for the Sage warning — same yellow treatment the existing "manual accounting adjustment" box uses, so the user gets a consistent warning visual language.
6. **Smoke test count: 255/255 (vs. target ~255/255).** I landed at exactly the target count — 16 new assertions + 2 updated = +16 net. Close enough to "~255/255" that I think Wren won't object.

---

## Flag for Wren

1. **`Save (primary)` literal label** — see decisions #1. If she finds it ugly, the fix is small: add an `primary: true` flag to the button objects in `__openModal` and read it directly instead of regex-matching the label. ~10 lines.
2. **Reset behavior of `__jeSave({keepOpen:true})`** — I reset Amount, Name, Description, Matched with, Notes. I did NOT reset Type (preserved at current value, defaults to Expense on first entry) or Date (preserved — user might be entering a batch of entries for one day). Spec D71 explicitly says "keeps Type and Date at their current values" so this matches. Worth a sanity check that Wren agrees.
3. **Import-driven token list** — D70 locks this list (`credit card, checking, savings, bank, stripe, paypal, venmo, square, plaid, import`). The literal substrings match the seeded account names `Business Checking`, `Business Credit Card`, etc., and common payment processors. If Patrick has a different list in mind, D70 is the place to update.
4. **`__jeCheckMatched` is heuristic-based.** It matches on substrings, not on a structured `is_import_driven` flag. That means a future account like "Bank of America" works, but "BoA Checking Account" works too (contains "checking"). The string-substring check is intentional — it's tolerant and doesn't require schema work. If Wren wants a structured flag, that's a Phase 2 schema decision.

---

## What's next

This round is ready to ship to Wren for code review. After Wren approves, Rusty will likely merge the commit and close the round-26 card on the Virta Tasks board. Round 27 is open — likely candidates from Lore's research:
- Disambiguate "Name" vs "Description" — do non-accountants know which to use?
- Type-ahead autocomplete on the Name field (vendor/customer suggestions)
- Inline hint about the default cash account (currently the user has to know "Matched with defaults to your default cash account")
- Move Amount to the top (FreshBooks puts the number first)