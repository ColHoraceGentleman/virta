# FEEDBACK — Virta Books v2 wireframes round 18: Type picker first in manual entry

**Author:** Rusty + Patrick Bailey
**Window:** 2026-07-09 11:30 → 11:45 MDT (webchat)
**Baseline:** Round 17 (default landing = Dashboard) at commit `04e8636`.
**Status:** Type picker added as first field in the manual-entry modal. Wireframe + spec + smoke test updated. **Smoke test 232/232 passing.**

This was the design Patrick originally proposed last night (10:53 MDT) and I talked him out of. He was right; I was wrong. Reverting to the type-picker-first form, with a small refinement: the Account dropdown is filtered to the picked Type, which I missed last night.

---

## Why this round exists

Last night, during the Phase 1 design session, Patrick proposed: pick the type first, then the account, then the amount, with the label adapting per type. I argued against it (and talked him into the simpler Account + Change form), on the grounds that for Liability/Equity "positive = up" flips relative to the user's mental model. Patrick then said: *"We are not presenting debit and credit terminology to the user, we just have to manage that behind the scenes. Let's focus on what will make sense to a lay person. If a liability increases or if revenue goes up, you and I know that is a credit, but the user just needs to know that revenue went up or that they owe more money and you can silently deal with that on the backend."*

That comment was the right call, but the form I built didn't follow through — the Account + Change form makes the user remember which type each account is (or read the type from the dropdown options) to know what "positive" means. The type-picker-first form removes that cognitive load: you pick the type, the form tells you what positive and negative mean in plain English for that type.

This morning, refreshing the memory: *"I thought the behavior was first select a category type, and then the options available and the language would be customized based on whether they chose income, expenses, asset, liability or equity."* That's the type-picker-first form. Applying it now.

---

## What changed

### `WIREFRAMES.html`

**`__openManualEntry()` rewrite (line ~1014):**
- Added a **Type** dropdown as the first user-facing field, with options **Expense / Income / Asset / Liability / Equity**. Default = Expense.
- The **Account** dropdown is now **filtered to the picked Type**. When the user changes Type, the Account list re-renders to show only accounts of that type.
- The **Change** field's label and helper copy are now driven by the picked Type (not the picked Account's type):
  - **Expense** → "Amount of Expense" (positive = "You spent this much", negative = "You got a refund")
  - **Income** → "Amount of Income" (positive = "You earned this much", negative = "You had a reversal")
  - **Asset** → "Change in the Asset" (positive = "The asset went up", negative = "The asset went down")
  - **Liability** → "Change in the Liability" (positive = "You paid it down", negative = "You took on more debt")
  - **Equity** → "Change in Owner's Equity" (positive = "Owner took money out", negative = "Owner put money in")
- The **Other account** picker is unchanged (any account, defaults to the user's default cash account from Setup Wizard).
- The **Sign convention (D63)** is unchanged: positive = the picked Account went up; negative = it went down. The Type-driven label and helper copy make the convention intuitive for each type.

**`accountOptionList()` extension (line 294):**
- Now accepts an optional `{filterType: 'Expense' | 'Income' | ...}` argument. When passed, filters the account list to only that type before rendering. No `filterType` = unfiltered (used by the Other account picker).

### `SETUP_AND_CATEGORIES.md`

- **D62 revised** — manual-entry form now has **Type** as the first field, with the Account dropdown filtered to the picked Type. No more "no type picker" — we have one, and it does real work.
- **D64 revised** — Change field's label and helper copy are now driven by the picked **Type** (not the Account's type), with full table of what each type renders.
- **D63 unchanged** — sign convention is still "positive = the picked Account went up; negative = it went down." The type-driven label and copy make that convention intuitive.
- **Status header** — appended "Round 18 applied 2026-07-09 (manual-entry modal: Type picker is the FIRST field, filters the Account list, and drives the Change label + helper copy per type — D62 + D64 revised; sign convention D63 unchanged)."

### `tests/wf-smoke.mjs`

- **Updated 1 assertion** — `(P1) Manual entry modal has Date, Type, Account, Change, Description, Other account, Notes fields` (D62). The "Change" word was dropped from the field-set check because for Expense the label is "Amount of Expense" and "Change" doesn't appear in the rendered HTML until the user picks Asset/Liability/Equity. (This was actually a bug in the round 15 test — the field name "Change" was an internal/placeholder label, not a user-facing one.)
- **+13 new assertions** (R18):
  - Type picker comes before the Account row in the modal (D62 revised)
  - Type dropdown has 5 options (Expense, Income, Asset, Liability, Equity)
  - Initial Change label is "Amount of Expense" (default Type = Expense)
  - Initial helper copy: "You spent this much" / "You got a refund" (D64 Expense)
  - Switching Type to Liability: label updates to "Change in the Liability", helper copy: "You paid it down" / "You took on more debt"
  - Account list filtered to Liability only when Type = Liability
  - Switching Type to Equity: label "Change in Owner's Equity", helper "Owner took money out" / "Owner put money in"
  - Switching Type to Income: label "Amount of Income", helper "You earned this much" / "You had a reversal"
  - Switching Type to Asset: label "Change in the Asset", helper "The asset went up" / "The asset went down"

**Smoke test result: 232/232 passing.**

### `VIRTA_BOOKS_V2.md`

- Artifact row: smoke test now 232/232 (was 221/221).
- Change log: new row for round 18.

---

## Phase 1 status after round 18

Still design complete, not yet built. The manual-entry form is now in its final form (modulo whatever Phase 2 GL architecture surfaces — e.g. what the actual balanced posting looks like with a 4-field form vs the old 3-field form, the audit row schema, etc.).

## What's next

Phase 2 (GL architecture + audit log + filter bar). Awaiting Patrick's go-ahead.
