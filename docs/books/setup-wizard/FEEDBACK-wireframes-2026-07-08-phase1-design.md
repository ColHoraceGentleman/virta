# FEEDBACK — Virta Books v2 Phase 1 design (2026-07-08)

**Author:** Rusty + Patrick Bailey  
**Window:** 2026-07-08 17:55 MDT → 2026-07-08 23:05 MDT (webchat)  
**Baseline:** Wireframes v0.14 from rounds 1–14 (same day, 09:30–15:59 MDT).  
**Status:** Phase 1 design complete. Wireframe + spec updated. Smoke test **191/191 passing**. Not yet built for real.

This document captures everything we decided and built during this session so a future session (or another agent) can pick up cleanly.

---

## What we set out to do

Phase 1 = **Chart of Accounts foundations**. Lock the schema-level decisions that Phase 2 (GL architecture) and Phase 13 (Reports) will build on, with a non-accountant simplicity-first principle.

We did not start React build work. We extended the wireframe + spec to formalize decisions that were implicit or missing.

---

## Decisions locked (chronological)

### Simplicity principle (the most important call of the session)

> Every UI choice is evaluated against: *would a non-accountant understand this without an explanation?* If yes, keep. If no, simplify, defer, or remove. Accounting correctness lives at the schema/GL layer; the user sees plain English.

This principle quietly overrode several "obvious" accounting ideas we considered and rejected. Documented as **D51**.

### Other Phase 1 decisions (D52–D58)

| # | Decision |
|---|---|
| D52 | No subtypes. Schedule C line is the implicit categorization. |
| D53 | No COGS in v2. Schema reserves the 5xxx range but seeds no COGS accounts. v3 candidate. |
| D54 | Account type is immutable after creation. |
| D55 | Status flags are `is_hidden` + `is_system` only. Drop `is_active`. |
| D56 | No explicit year-end close UI. Net P&L auto-flows into Equity (Retained Earnings) when reports run. |
| D57 | Internal code ranges (1xxx Assets … 9xxx System). Codes never shown to user by default; toggle in Settings. |
| D58 | Add/Edit modal exposes only Name, Code (toggle-gated), Tax Line Item (Schedule C), Note, and Type. Normal balance / closing behavior / code-range logic are schema-only. |

Added formal spec section **§10A "Chart of Accounts — formal schema"** that documents the behind-the-scenes logic so Phase 2 has a foundation.

### Decisions re-confirmed or finalized (D59–D67)

| # | Decision |
|---|---|
| D59 | GL columns: Date, Type, Name, Amount, Description, Category, Matched with, Status. **No Balance** in the all-up GL — Balance reserved for future filtered balance-sheet-account views. |
| D60 | Review Later shows System label only; no Edit/Hide/Delete/Merge actions. Normal category rows show Edit/Hide/Delete only. Merge moved into Edit modal as **Merge and Delete…** with explainer text. |
| D61 | (Original manual-entry form. Superseded by D62-D66.) |
| D62 | v2 manual-entry form: **Account + Change + Other account**. No type picker, no debit/credit picker, no drafts. Other account defaults to user's default cash account from Setup Wizard, can be overridden. |
| D63 | Sign convention: **positive = picked Account went up; negative = it went down.** System silently translates to debit/credit per each account's normal balance. User never sees debit/credit language. Other account row receives opposite sign with same magnitude. |
| D64 | Change field label adapts to picked Account's type: Expense/Income → "Amount", Asset/Liability → "Change in balance", Equity → "Change". Label read from account's type — no separate type picker. |
| D65 | Single **Save** button (no Save draft / Post entry split). On save, entry posts to GL immediately, visible everywhere, included in all balance/total calculations. Reconciliation status starts as empty. |
| D66 | Every manual entry writes an audit row per the locked v2 audit-log spec. Edits and deletes also audited. |
| D67 | Categories Management filter chip and active page heading say **Income** (not "Revenue"). All category-related copy uses "Income." |

---

## Items explicitly deferred

| Item | Why | Resolved at |
|---|---|---|
| Reconciliation status semantics (empty/in-progress/reconciled) | Schema-only placeholders in GL for now | Phase 9 |
| GL filter bar (date range, category, name) | Patrick wants date range + category + name filters for MVP | Phase 2 (or earlier in design phase) |
| Final Balance column design (for filtered views) | Reserved per D59 | When Phase 2/9 add filtered balance-sheet-account views |
| "Matched with" → better plain-English name | Patrick: "let's stick with Matched With for now" | Open — pick better later if found |

---

## Items I tried and rejected (for the record)

These are things I proposed that Patrick redirected away from. Capturing so future sessions don't re-propose them:

- **Subtypes** (COGS / Operating / Other Expense) — rejected by D52; Schedule C line is enough.
- **Separate `is_active` flag** — rejected by D55; conflates with `is_hidden`.
- **Type picker in manual-entry modal** — rejected; the picked account's type drives the label automatically (D64).
- **Explicit Debit/Credit fields anywhere** — rejected; hidden behind the scenes per D63.
- **Save draft / Post entry split** — rejected by D65; one Save button.
- **Balance column in all-up GL** — rejected by D59; reserved for filtered views only.
- **From / To framing for manual entry** — rejected; replaced with Account + Other account per D62.
- **"Revenue" label anywhere in Categories** — replaced by "Income" per D67.
- **Hard-coded revenue/expense/sidebar stale counts in wireframe** — left as a low-priority cleanup item.

---

## Wireframe + spec changes made

### `SETUP_AND_CATEGORIES.md`

- Added 8 new decisions (D51–D58) locking Phase 1's chart-of-accounts schema choices.
- Added new spec section **§10A "Chart of Accounts — formal schema"** documenting behind-the-scenes logic.
- Re-confirmed/revised D59 (GL columns + Balance reserved), D60 (Review Later system-only), D61 (manual entry, superseded).
- Added D62–D67 locking the manual-entry form (Account + Change + Other account, sign convention, type-aware label, no drafts, audit, Income filter).

### `WIREFRAMES.html`

- **General Ledger** added as a top-level sidebar item, same level as Dashboard / Invoices / Categories.
- GL page renders the locked columns (Date, Type, Name, Amount, Description, Category, Matched with, Status).
- Sample balanced entries (debits = credits) demonstrate the GL.
- Summary cards above the table.
- **New entry** button opens the manual-entry modal.
- Modal fields: Account, Change (label adapts per account's type), Date, Description, Other account, Notes. Single Save button. No drafts.
- `accountOptionList()` now emits `data-type` so the Change label can adapt to the picked Account's type.
- Categories Management: filter chip changed from "Revenue" to "Income". All category-related copy uses "Income".
- Review Later row shows System label only — no Edit/Hide/Delete/Merge actions on the row.
- Normal category rows show Edit/Hide/Delete only. Merge moved into Edit modal as **Merge and Delete…** with explainer.
- All account-type rows in Categories use the same plain-text styling (no pill styling for BS accounts).
- Removed dead `mgmtRow()` function (left over from earlier round, referenced a "Disable" concept that conflicted with D55's single-flag model).

### `tests/wf-smoke.mjs` (moved into repo from `/tmp/wf-smoke.mjs`)

- **191/191 passing** after this session.
- 7 assertions for Phase 1 design cleanup (no subtype, no COGS, no year-end-close, etc.).
- 12 assertions for the new manual-entry form (D62–D66).

---

## v3 candidates carried forward

Already in a separate `[Virta Books v3 candidates]` card in Virta Tasks (Rusty project, Backlog, position 26):

- Sales tax (per-line rates, jurisdiction handling, tax remittance reports)
- Multi-user / permissions (owner + accountant roles)
- Recurring invoices

---

## What still needs to happen before Phase 1 is truly "done"

This session got Phase 1 to **design complete**. Real build work is gated on Patrick explicitly saying "start build." Until then, Phase 1 design is the deliverable.

Before build:
- Write Phase 1 feedback doc in this same format (see top of this file) ✓
- Move Phase 1 card from Backlog → Prioritized in Virta Tasks (TODO this session)
- Commit all spec/wireframe/smoke-test changes (TODO this session)
- Bump `VIRTA_BOOKS_V2.md` Phase 1 status to "design complete" + update artifact counts (TODO this session)

After Patrick's go-ahead:
- Build per `~/clawd/projects/process/ENGINEERING.md` §5.9 (build → demo → play → decide).
- Spawn Echo (or Patrick's choice) for the build execution.

---

## Open question for the next session

**Are there GL filters we want at this stage of design (date range, category, name)?**

Patrick said during the session: "For MVP, we need date range, category, and name filters" — but this didn't make it into the wireframe. We can either:

1. Add them to the wireframe now (Phase 1 design cleanup, ~10 min).
2. Add them during Phase 2 design when we do GL architecture.
3. Add them at build time.

My default would be (1) — they're user-visible filters, design should lock them in. Decide next session.