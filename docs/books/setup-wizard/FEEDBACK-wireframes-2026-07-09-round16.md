# FEEDBACK — Virta Books v2 wireframes round 16: GL → Transactions rename

**Author:** Rusty + Patrick Bailey
**Window:** 2026-07-09 11:06 → 11:10 MDT (webchat)
**Baseline:** Phase 1 cleanup complete (round 15) at commit `23b2469`.
**Status:** Rename applied. Wireframe + spec updated. **Smoke test 218/218 passing.**

This is a one-line change but a real one. Captured for the record.

---

## What we changed

The sidebar had two top-level entries that pointed to the same underlying functionality:

- **💸 Transactions** (line 162) — pre-existed, but had no backing page (clicking it would fall through to `renderSettings()`)
- **📒 General Ledger** (line 163) — the actual page, added in Phase 1 with the D59 columns + D62 manual-entry modal

Patrick's call: collapse to one. The user-facing name should be **Transactions**. Internally the page is still the General Ledger (D59 columns, D62 modal, D63 sign convention, D67 audit row) — only the nav label and page title change.

Why "Transactions" and not "General Ledger": consistent with the rest of the world (banks, QuickBooks, Xero all use "Transactions"), and "General Ledger" is accountant-speak that a non-accountant has no reason to know. The D51 simplicity principle wins.

---

## What changed

### `WIREFRAMES.html`

- **Sidebar (line 162–163)**: removed `<a data-screen="ledger">📒 General Ledger</a>`. The existing `<a data-screen="transactions">💸 Transactions</a>` stays.
- **Router (line ~1407)**: added `if(s==='transactions') return renderLedger(); /* round 16: GL merged into Transactions nav */`. Now clicking the Transactions nav routes to the actual ledger page instead of falling through to Settings.
- **Page title (line ~1276)**: `topbar('General Ledger',['Books','General Ledger'])` → `topbar('Transactions',['Books','Transactions'])`. The breadcrumbs reflect the new name.

### `SETUP_AND_CATEGORIES.md`

- **D68 added** — documents the rename: the underlying table is the General Ledger (D59 columns), but the user-facing nav label is "Transactions." Internal naming (`renderLedger()`, `data-screen="transactions"`) keeps "ledger" for code clarity.
- **Status header** — appended "Round 16 applied 2026-07-09 (sidebar GL renamed to **Transactions** to match user expectation; GL functionality unchanged)."

### `tests/wf-smoke.mjs`

- **Renamed** the existing assertion: `(P1) Sidebar includes General Ledger link` → `(P1) Sidebar includes Transactions link (was General Ledger; merged in round 16)`. New check asserts the sidebar has `data-screen="transactions"` and the `💸 Transactions` label.
- **+2 new assertions** (R16):
  - Sidebar no longer has a separate `data-screen="ledger"` or `General Ledger` text
  - `data-screen="transactions"` routes to `renderLedger()`

**Smoke test result: 218/218 passing.**

### `VIRTA_BOOKS_V2.md`

- Artifact row: smoke test now 218/218 (was 216/216).
- Change log: new row for round 16.

---

## Phase 1 status after round 16

Unchanged from round 15. Design complete, not yet built.

## What's next

Phase 2 (GL architecture + audit log + filter bar). Awaiting Patrick's go-ahead.
