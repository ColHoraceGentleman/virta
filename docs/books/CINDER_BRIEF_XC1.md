# CINDER BRIEF — XC-1: Categorize.jsx crash + booksApi double-unwrap sweep

**Builder:** Cinder 🔥
**Date:** 2026-07-04
**Scope:** NDC-1 from `ECHO_REPORT_D_F1_E1.md` §2.3 — Categorization page is hard-crashed on first render.
**Goal:** restore the headline keyboard-first categorization workflow.

---

## TL;DR

The `request()` helper in `client/src/books/api.js` auto-unwraps any `data` envelope from the server. `Categorization.jsx` was written assuming the envelope shape — it stores the unwrapped result and then accesses `[0]` / `.data` / `.meta` on it. Same bug class as the pre-fix `Reports.jsx` (D-B1).

Two changes:

1. **Targeted fix for Categorization.jsx** — apply the D-B1 fix pattern: bypass `booksApi` for the affected calls so the component receives the full JSON envelope.
2. **Sweep of remaining `booksApi.X()` call sites** — audit every consumer for the same trap (`store-then-access-deep-shape`).

If sweep finds zero other instances, ship tight. If it finds more, expand the brief as needed.

---

## Step 1 — Read the failure artifact

Open and read in this order:
- `docs/books/qa/runs/2026-07-02/VB-CAT-CRASH/notes.md` — what Echo saw when she hit the crash
- `docs/books/qa/runs/2026-07-02/VB-CAT-CRASH/console.log` — the actual error

These confirm the call site.

## Step 2 — Find every `booksApi.*` call in `Categorization.jsx`

```bash
grep -n "booksApi\." client/src/books/Categorization.jsx
```

You should see ≥4 call sites. Each one has two possible fixes:

- **A. Bypass** — make the booksApi method return full JSON via direct `fetch` (the D-B1 pattern). Use this for endpoints where the server response includes both `data` and other top-level fields the component needs (`meta`, `totals`, `as_of`, etc.).
- **B. Refactor component** — switch to the unwrapped shape (treat the helper's return as the data directly, never access `.data`).

**Decision rule:** if the component needs any non-`data` field, use **A**. If the component only reads `[0]` or the array, use **B**. Prefer **B** for endpoints whose server shape is `{ data: T[] }` only — but **A** is the safe default for the rest.

## Step 3 — Apply the fix(es)

Match the existing D-B1 style. Reference:
- Before: `docs/books/qa/runs/2026-07-02/VB-REP-FULL/` (Reports page after the D-B1 fix shows the right shape)
- The D-B1 fix touched `api.js`'s `arAging()` method. Use the same pattern: declare a method-specific `fetch` override when needed.

Then re-run the build:
```bash
cd client && npm run build
```

## Step 4 — Sweep all other `booksApi.X()` call sites

For every `booksApi.X(...)` consumer in `client/src/books/`, check:

> 1. Does `X` return an envelope `{ data, ... }` on the server?
> 2. Does the consumer access anything besides the array itself (e.g. `.data`, `.meta`, `.totals`, `.as_of`, `.paginated`)?
> 3. If both yes — does the current code handle that correctly?

The audit list (from grep):
```bash
grep -rn "booksApi\." client/src/books/
```

Each file to inspect:
- [ ] `AccountForm.jsx`
- [ ] `Categorization.jsx` (the primary target)
- [ ] `ChartOfAccounts.jsx`
- [ ] `CustomerForm.jsx`
- [ ] `CustomersList.jsx`
- [ ] `Dashboard.jsx` (may not be wired in yet — E.2 spec work)
- [ ] `ImportCSV.jsx`
- [ ] `InvoiceForm.jsx`
- [ ] `InvoiceView.jsx`
- [ ] `InvoicesList.jsx`
- [ ] `MergeAccounts.jsx`
- [ ] `PaymentsIn.jsx`
- [ ] `Reconcile.jsx` (already verified clean by Echo — confirm during sweep)
- [ ] `Reports.jsx` (D-B1 fix already applied — confirm during sweep)

For each file, record in your report:
- File path + line numbers
- Whether it's already correct
- Whether it has the trap (and the fix)

If a consumer is dead code (never reached in the current route list), just note it and move on.

## Step 5 — Smoke tests (REQUIRED — this is the lesson from the BROKEN pre-fix Categorize.jsx)

Per Hard Rule #6 in `~/clawd/projects/process/ENGINEERING.md`: visual confirmation is required for UI changes. Curl-only is **not enough** for this fix.

- [ ] Open `https://virta.muckdart.com/books/categorize` — page should render, NOT crash.
- [ ] Click through the three tabs (Pending / Auto-categorized / Excluded) — confirm each loads its data.
- [ ] Pick an account from the right pane → click → confirm categorization succeeds (the transaction moves from Pending).
- [ ] Browser console must show zero errors and zero unhandled promise rejections.
- [ ] Hotkeys (`j`, `k`, `1`-`9`, `Enter`) confirmed live — per ACCOUNTING-v1 §6.

Use Playwright directly. Save screenshots + console.log to:
`docs/books/qa/runs/2026-07-04/VB-CAT-CRASH-FIX/`

## Step 6 — Backup + safety

Pre-flight backups before any code change (Hard Rule #3):
```bash
cd ~/clawd/projects/task-manager
cp -p client/src/books/Categorization.jsx \
      client/src/books/Categorization.jsx.bak-$(date +%s)
# Save the build before the change too:
cd client && npm run build  # capture what was live
```

Service is running, but client serves from build artifacts — rebuilding picks up changes automatically. Restart only if Vite doesn't HMR-reload.

## Step 7 — Report

Write to `docs/books/CINDER_REPORT_XC1.md`. Must include:

- Number of `booksApi` call sites inspected.
- Per-site verdict (correct / fixed / noted-dead-code).
- For Categorization.jsx specifically: line numbers of the changes, before/after shape of the affected accessor.
- Visual-confirmation artifact reference (the `VB-CAT-CRASH-FIX/` screenshots + console log).
- Any new behaviors surfaced (especially if you find the trap in another component — list behavior IDs you verified).
- Verdict: **SHIP** or **NEEDS-FIX**.

---

## Hard rules (from ENGINEERING.md §4)

1. **Backup before any change.** Step 6 is mandatory.
2. **Visual confirmation required.** Steps 5.1–5.5 are not optional. This is the third "curl-only smoke passed and the UI was broken" lesson in a week.
3. **One discoverable pattern.** Step 4's sweep is the whole point — fix Categorize.jsx once, audit the rest, ship clean.
4. **Don't expand scope.** If the sweep finds a separate bug that's *not* the double-unwrap trap, log it to your report as "side observation" and DO NOT fix it. That's a future brief.

---

## Estimated ETA

30-45 min. The Categorize.jsx fix is small (~10 min including the swap). The sweep is the long pole (varies depending on how many call sites Echo's report left un-audited).

---

## What gets verified by Echo after this lands

(Logged for the post-Cinder Wren/Echo gate.)

- All `VB-CAT-*` behaviors that were blocked (CAT-01, CAT-06) re-tested in the browser.
- Sweep findings: any component you flagged gets a fresh behavior ID (e.g., `VB-CAT-CRASH-V2` for any secondary crash you uncover).
- Hotkeys `j`/`k`/`1-9`/`Enter` confirmed live (per ACCOUNTING-v1 §6).

---

*Brief author: Rusty ⚙️ | From: ECHO_REPORT_D_F1_E1.md §2.3 NDC-1*
