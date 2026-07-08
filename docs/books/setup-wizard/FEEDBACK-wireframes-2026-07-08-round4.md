# Wireframes Feedback — Round 4 (applied 2026-07-08)

- **Source:** Patrick, 2026-07-08 ~10:35 MDT (main batch), 10:42 MDT (show-account-numbers on step 1), 10:45 MDT (default off + accountant framing), webchat
- **Scope:** Strip Chantelle specifics + structural Categories wizard rework + generic Add modal
- **Status:** Applied in commit `53621b5+2` (this round).

---

## F4.1 — Strip Chantelle-specific suggestion text

**Why:** Placeholders and example copy from one user's setup made the wireframe feel user-specific instead of product-generic.

**Removed:**
- Setup Wizard step 2 placeholder `Chantelle Bailey` (proprietor)
- Setup Wizard step 2 placeholder `Chantelle Bailey Design` (business name)
- Setup Wizard step 2 placeholder `Quilting Supplies` (Add modal name)
- Spec SQL column comment examples mentioning "Chantelle Bailey" / "Chantelle Bailey Design"

**Replaced with:** generic placeholders (`Your name`, `Your business name`, `Category name`).

**Verified:** zero occurrences of "Chantelle" anywhere in the rendered wireframe (smoke test assertion).

## F4.2 — Categories wizard step 2 (expenses): full table rework

**Why:** Old model was "checkbox on left to include, can uncheck to skip." New model: include by default, with explicit Hide / Delete on the right. Cleaner mental model — the user opts items OUT, not IN.

**Changes:**

- Removed: left-side checkbox column.
- Added: **Hide** button per row on the right. Toggles `is_hidden`; row goes opacity-45 with strikethrough, hides a "Show" revert button. Existing default behavior ("all pre-seeded items included") preserved.
- Added: **Delete** button per row on the right. Confirmation modal: "Permanently exclude `<name>` from your setup?" — on confirm, removes the row from wizard state for this session. Reversible by exiting + relaunching.
- Header row is **sticky** (`position: sticky; top: 0; z-index: 1`) — table scrolls independently inside a `max-height: 420px; overflow: auto` container.
- Each column header is clickable to sort. Helper `sortHeader()` renders `Name ↑` / `Code ↕` etc. Default sort = Name asc for expenses; income has special "no sort until user clicks" (`sortIncome.key = 'none'`).
- Top of step: a single **"+ Add expense category"** button (not "Add custom expense category"). Removed the old per-table tipAdd row at the bottom.

## F4.3 — Categories wizard step 3 (income): Sales first, Other Income last

**Why:** Default alphabetical sort put Other Income before Sales, which felt wrong — Sales is the primary inflow and Other Income is a catch-all.

**Changes:**
- `DEFAULT_INCOME` reordered: `Sales` (4000), `Refunds & Returns` (4010), `Other Income` (4020).
- Spec §10 income table re-titled "intentional order — exception to D16" with rationale.
- Sort state seeded at `sortIncome.key = 'none'` so the table preserves insertion order until the user clicks a column header (then it sorts).

## F4.4 — Categories wizard step 4 (other accounts): single Add button

**Why:** Three "Add custom Cash & bank account" / "Add custom Credit & loans account" / "Add custom Equity account" buttons were redundant — the Type field in the modal already covers which type it is.

**Changes:**
- Single top-of-step "**+ Add account**" button (replaces the three per-subheader buttons).
- The same button opens the generic Add modal with Type picker pre-set to `Asset`.

## F4.5 — Add modal: generic across all uses

**Why:** The Add modal was called from wizard steps AND from the management screen. Old version was expense-specific ("Schedule C line" required, name + line only). New version is a generic "create account" form usable from anywhere in the app.

**Modal title:** "Add account" (was "Add custom category").

**Fields (in order):**

1. **Type** — dropdown of Expense / Income / Asset / Liability / Equity. Default = the calling context's type (expense step → Expense; income step → Income; other step → Asset; management → Expense).
2. **Name** — free text, required.
3. **Code** — 4-digit numeric, auto-suggested but overrideable.
4. **Tax Line Item (Schedule C of IRS Form 1040)** — picker, visible only when Type is Expense or Income. Picker options change based on Type (Expense → Part II lines; Income → Part I lines; others → hidden).
5. **Note** — free text, optional, shown in audit logs + Reports drill-down.

**Spec §8.2 expanded:** "Add account modal (generic, used everywhere)" with full field table, validation rules, and Save behavior (persists vs pushes-to-wizard-state depending on caller).

**Removed from copy:** "Add custom" phrasing wherever it appeared (5 occurrences in the wireframe, 4 button labels).

## F4.6 — Show account numbers toggle moved to step 1 (Patrick, 10:42 MDT)

**Why:** Showing or hiding the Code column on every expenses/income/other table is a wizard-wide preference. Putting it on each step meant the user makes the same decision 3 times. One decision on step 1 cascades through the rest.

**Wireframe:** Step 1 Categories (Welcome) now has a "Show 4-digit account numbers" panel with a toggle switch. Steps 2, 3, 4 removed their per-step toolbars; they consume `state.showNumbers` directly.

**Spec:** §7 Step 1 (Welcome explainer) gains a "Display preference" subsection. D21 wording updated.

## F4.7 — Default off + accountant framing (Patrick, 10:45 MDT)

**Why:** Defaulting the toggle to ON presumes the user wants codes. Most non-accountant users find codes noise. Frame the choice with reasoning so opt-in is intentional.

**Wireframe:** `state.showNumbers: false` by default. Helper text: "Some accountants and business owners like to track their accounts with account numbers. Turn on to show codes like 6000 Advertising next to each category. You can change this anytime in Settings."

**Spec:** §7 Step 1 default flipped to OFF with same helper copy. Inline note references the daily log timestamp.

---

## What applying this means for the artifacts (delivered)

- `SETUP_AND_CATEGORIES.md` — Status header updated, D21/D22/D23/D24 added (4 new decisions), §7 Step 1 rewritten with Display preference panel, §7 Step 2 layout block rewritten with new layout, §7 Step 3 reordered, §7 Step 4 unified to single Add button, §8.2 rewritten as generic Add Account modal, §10 income table re-titled "intentional order", §13 gained CW-008 through CW-020 + SW-010 (13 new behavior IDs). SQL column comments cleaned.
- `WIREFRAMES.html` — New CSS classes (`.cat-table th.sortable`, `.wiz-toolbar`, `.hide-btn`, `.delete-btn`, `.add-btn`, `tr.is-hidden`, `.cat-table th` sticky positioning). State extended with `is_hidden`, `is_deleted`, `note`, and per-table sort state. New helpers: `__toggleHide`, `__toggleDelete`, `__sortBy`, `__buildLineOpts`, `sortedList`, `sortHeader`. `catRowInputs` rebuilt with no checkbox column + system-pinned-first sort + Hide/Delete cell. `__openAdd` rewritten as generic modal. Cats step 1 (Welcome) gets the toggle panel. Cats step 2/3/4 each get the new toolbar + sticky table layout. Default income order updated.

## Validation

- Headless smoke test at `/tmp/wf-smoke.mjs` extended from 48 → **76 assertions**. **76/76 passing**.
- Visual screenshots at `/tmp/wf4-snap-*.png` (cats-step1-toggle, cats-step2-hidedelete, cats-step4-single-add, add-modal). Disposable, not committed.

---

*Captured by Rusty from Patrick's webchat messages 2026-07-08 10:35–10:45 MDT. Applied in next commit after this document is staged. Sub-question at 10:48 ("Cinder/Echo/Wren or yourself") confirmed: solo, this round. See daily log for rationale.*
