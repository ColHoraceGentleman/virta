# Wireframes Feedback — Setup Wizard + Categories (Round 1)

- **Source:** Patrick, 2026-07-08 ~09:30 MDT, webchat
- **Scope:** Setup Wizard (8-step) + Categories Wizard (6-step) wireframes (WIREFRAMES.html)
- **Status:** Captured. Not yet applied to spec or wireframe.
- **Apply to:** Both `SETUP_AND_CATEGORIES.md` (text decisions) AND `WIREFRAMES.html` (visual + flow).

---

## Theme 1 — Fewer clicks

**F1.1 — Combine Setup Wizard steps 2, 3, and 5 (Owner + Business identity + Tax IDs) into one "Basic business info" step.**

- Current: 8 steps total (Welcome → Owner → Business identity → Contact → Tax IDs → Accounting method → Timeline → Review & create).
- Proposed: 6 steps. New flow:
  1. Welcome
  2. **Basic business info** (merged: proprietor name, business name, trade name, description, NAICS, EIN) — single screen, fields grouped under "About you" and "About your business" subheaders
  3. Contact (address)
  4. Accounting method
  5. Timeline (FY start, business start date)
  6. Review & create

- Net: 2 fewer screens. Fields fit on one screen if we keep the address out and the fiscal-year stuff out.

---

## Theme 2 — More inline explanations (not too many)

**F2.1 — Step 1 (Welcome): make it explicit that we're collecting info from IRS Schedule C.**

- Add a one-liner like: *"We'll ask for the same basic info that's on the Schedule C of your Form 1040 — the tax form sole proprietors file. This makes year-end tax filing much easier."*
- Keep the existing "most people take ~5 minutes" and "you can change anything later" copy — Patrick liked those.

**F2.2 — Proprietor name → rename label or add helper.**

- Change label to something like **"Your legal name (the business owner)"** or add a helper line below it: *"This is you — the proprietor / business owner."*
- Apply same pattern to any other "proprietor" jargon in the wizard.

**F2.3 — NAICS code: add a lookup wizard.**

- Replace plain numeric input with a search-and-select field.
- Click → modal/sheet with search by keyword ("quilting," "photography," "consulting") + filter by 2-digit sector.
- Source: Census Bureau NAICS search API or local JSON dump.
- "Don't know your code? Skip for now — you can add this anytime."

**F2.4 — Fiscal year start: add helper copy.**

- Default: Jan 1.
- Helper: *"Most small businesses use the calendar year (Jan 1 – Dec 31). If you track your finances on a different cycle, change it here."*

**F2.5 — Soften or rephrase Step 1's two preview bullets.**

Current bullets on the Welcome screen:
- "Accounting method (Cash only in v1)"
- "Pre-seeded categories based on Schedule C Part II"

Issue: these preview details the user hasn't seen yet. Suggest:
- "Accounting method — pick cash or accrual"
- "Your categories — pre-filled from the IRS Schedule C, customize anytime"

Also: **the "Save and continue to Categories" button needs an explicit "Next up: …Categories" preview**, e.g. a small "Up next: Set up your categories (pre-filled from Schedule C)" line below the button. Patrick asked where it goes — answer: Categories Wizard → Welcome screen.

---

## Theme 3 — Mistakes at review

**F3.1 — Review & create screen: edit icon next to every field.**

- This is the screen where mistakes are most visible.
- Each row = pencil icon → expand inline (or click → opens that step's content in a side modal) → save → returns to review.
- Apply same edit affordance to the timeline step's review row.

---

## Theme 4 — Categories Wizard

**F4.1 — "Other accounts" step: split by account type with subheaders.**

- Currently the wireframe lumps Checking / Credit Card / Loans / Owner's Equity in one table.
- Add subheaders inside the step:
  - **Cash & bank accounts** (Checking, Savings, Money Market, Petty Cash)
  - **Credit & loans** (Credit Card, Line of Credit, Loan Payable)
  - **Property & equipment** (Vehicles, Equipment, Real Estate — even if pre-seeded is empty for v1)
  - **Equity** (Owner's Equity, Owner's Draw, Owner's Contribution)

**F4.2 — Default alphabetical sort with numbering that matches sort order.**

- Categories tables: default sort = alphabetical by name; account numbers assigned in alphabetic order (e.g. 6010 Advertising, 6020 Car & truck, …).
- Keep "drag to reorder" or "manual numbering override" as a later power-user feature — out of v1.
- This also makes the printed/numbered list feel natural instead of arbitrary.

---

## Open questions for Patrick

1. **Should "Basic business info" (step 2) just be a single column or split into two columns** (about you / about your business)? Default proposal: two columns on desktop, stacked on mobile.
2. **NAICS lookup source preference** — Census Bureau live API vs an offline JSON snapshot? Proposing offline snapshot for v1 (no network deps, no rate limit, faster).
3. **Edit-on-review pattern** — inline expansion vs jump-back-to-step? Inline is smoother, jump-back matches the wizard's mental model. Default proposal: inline expand-in-place for single fields, jump-back for big sections.

---

## What applying this means for artifacts

If approved:

1. **Spec update** (`SETUP_AND_CATEGORIES.md`):
   - §2: change "7 steps" → "5 steps" for the company wizard (Welcome is implicit + the 5 above).
   - §3: add a new locked decision row for the merge + alphabetical numbering.
   - §6 (wizard copy): update each step's copy per F2.x.
   - Add NAICS lookup behavior to the relevant section.
   - Add the other-accounts-subheaders behavior.

2. **Wireframe update** (`WIREFRAMES.html`):
   - Remove steps 2 and 5; absorb their fields into step 3.
   - Add the explanation copy from Theme 2.
   - Add pencil/edit icons on the review screen.
   - Restructure the "Other accounts" step with subheaders.
   - Re-sort categories alphabetically by default; re-number accounts to match.

Both updates are mechanical once the spec is locked. Estimated size: ~30 minutes of focused work.

---

*Captured by Rusty from Patrick's webchat message, 2026-07-08. Awaiting go-ahead to apply.*
