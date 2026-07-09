# FEEDBACK — Virta Books v2 wireframes round 21: modal "Other account" → "Matched with"

**Author:** Rusty + Patrick Bailey
**Window:** 2026-07-09 11:58 → 12:00 MDT (webchat)
**Baseline:** Round 20 (clear all defaults) at commit `be2c05a`.
**Status:** Manual-entry modal picker renamed to "Matched with" for consistency with the GL table column. **Smoke test 238/238 passing.**

---

## What changed

The manual-entry modal had a "Other account" picker. The GL table has a "Matched with" column (locked in D59). The two should use the same name — one concept, one word, visible to the user in two places.

Patrick: *"I think we should continue with the same language that we use in the GL view. For example 'Other Account' should be 'Matched with'."*

### `WIREFRAMES.html`

- **Modal line ~1075**: `<label>Other account</label>` → `<label>Matched with</label>`
- **Helper text**: tightened from "The other side of the entry. Defaults to your default cash account from Setup Wizard." to "The other side of the entry — the account that moved in the opposite direction. Defaults to your default cash account from Setup Wizard." (The "moved in the opposite direction" clause reinforces what "matched with" means — same way the GL column header sits above rows showing the two sides of a balanced entry.)

The `<select id="je-other">` element id stays as `je-other` — that's an internal handle, not a user-facing label. No need to change it.

### `tests/wf-smoke.mjs`

- Updated field-set assertion: `['Date','Type','Account','Description','Other account','Notes']` → `['Date','Type','Account','Description','Matched with','Notes']`.
- Updated R20 comment to use "Matched with" instead of "Other account".

**Smoke test result: 238/238 passing.**

### `SETUP_AND_CATEGORIES.md`

- Status header: appended "Round 21 applied 2026-07-09 (manual-entry modal: 'Other account' picker renamed to 'Matched with' for consistency with the GL table column (D59))."

### `VIRTA_BOOKS_V2.md`

- Change log: new row for round 21.

---

## Open question for Phase 2

This is the first of what may be more label-alignment items between the manual-entry modal and the GL view. The "for example" in Patrick's call suggests he may want to keep going. Worth checking before Phase 2 GL architecture lands. Current candidate labels to align:

- **Date** — same in both. ✓
- **Type** — GL table has a "Type" column; modal has the Type picker (which becomes the entry's Type). Aligned by name. ✓
- **Name** — GL column. Modal has no Name field (Account is enough). OK as-is.
- **Amount** — GL column shows debit/credit amounts. Modal Change field has type-driven label ("Amount of Expense" / "Change in the Asset" / etc.). Intentional divergence — modal uses type-aware copy; GL column is generic.
- **Description** — both. ✓
- **Category** — GL column. Modal uses Account, not Category. The Account picker IS the Category for the entry. Worth aligning the term? Currently the modal says "Account" but the GL column says "Category". This may be the next alignment to make.

Not changing anything else this round. Captured here so the next round of work can pick it up cleanly.
