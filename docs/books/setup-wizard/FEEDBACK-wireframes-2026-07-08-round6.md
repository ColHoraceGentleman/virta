# Wireframes Feedback — Round 6 (applied 2026-07-08)

- **Source:** Patrick, 2026-07-08 ~11:15 + ~11:35 MDT, webchat (during a meeting, part-time)
- **Scope:** Step-1 toggle, Categories wizard step 2 cell layout, step 5 cleanup, Edit modal Notes field, smart "Revert" CTA, combined "Tax Line Item" column
- **Status:** Applied in commit `6caf211+1` (this round).

---

## F6.1 — Welcome: checkbox instead of toggle, IRS Form 1040 first (11:15 MDT)

**Why:** A toggle switch was visually heavy for a single yes/no preference. A checkbox reads as "this is a setting" rather than "this is a piece of equipment." Also: the user might not know what "Schedule C" is when they first see the wizard. Naming IRS Form 1040 first gives them the bigger context, then Schedule C is recognizable as a known sub-piece.

**Changes:**
- Toggle `<div class="switch">` → `<input type="checkbox">` inside a `<label>` row
- Welcome body: "We've pre-seeded them based on the categories on your IRS Form 1040 — specifically the Schedule C section that sole proprietors file. You can rename, remove, or add any of them."
- Infobox below: "Every Schedule C line has a column on the next screens..."

**Spec:** D29 added.

## F6.2 — Step 2 cells: no inline rename, no em-dash, "Category name" + "Tax Line Item" (11:15 MDT)

**Why:** Inline text inputs in the row made accidental edits too easy and broke the visual rhythm. "Descriptor" wasn't clear — it was the IRS descriptor of the line, not user-entered text. "Name" alone was ambiguous; "Category name" makes the relationship clear. The em-dash in the Code column when account numbers were off was a half-measure — better to just hide the column entirely (consistent with Patrick's rule for step 5).

**Changes:**
- Dropped inline `<input type="text">` for name. Editing is now via the Edit modal only.
- Row actions consolidated to one cell: **Edit / Hide / Delete** (no more two separate cells).
- Header "Name" → **"Category name"**.
- Header "Descriptor" + "Tax line" merged → **"Tax Line Item"** (single column). Format: `<badge>Line N</badge> <em>— IRS descriptor</em>`.
- When `showNumbers` is off, the Code `<td>` is simply absent (no em-dash).
- Same merge applied to the Categories Management single-page table and the Edit modal label.

**Spec:** D30, D31, D36 added.

## F6.3 — Step 2 table: max-height 420 → 640, sticky header confirmed global (11:15 MDT)

**Why:** The 420px window was too short to display the seeded list without scrolling on most viewports; bumping to 640 means fewer forced scrolls while still being a "table with internal scroll" rather than a full-page table. Sticky header is already global via `.cat-table th { position: sticky; top: 0 }` from round 4 — z-index bumped to 2 so the toolbar/chips never overlap the header on any list.

**Changes:**
- Steps 2, 3, 4 max-height: `420px` → `640px`.
- `.cat-table th` z-index: `1` → `2`.
- CSS comment in the rule explicitly documents that it's global (wizard 2/3/4/5 + management).

**Spec:** D34 added.

## F6.4 — Step 2 hides "Review Later" row (11:15 MDT)

**Why:** Review Later is a system category that's never editable and not really part of the user's expense choices. Showing it on the same screen as Advertising/Rent just added noise. The user already meets it on step 5 with a proper explainer.

**Changes:**
- `catRowInputs` for step 2 filters out items with `system: true`.
- System row is shown only on step 5 (where it has the full explainer).
- D32 added.

## F6.5 — Step 5: rename + new code, no checkbox, code gated by showNumbers (11:15 + 11:35 MDT)

**Why:** "Review Later" was too casual for a tax-bucket name. "Uncategorized Items Needing Review" makes the purpose explicit and reads as something a non-accountant would understand. Code 6999 was too close to the 6xxx expense range; 9999 makes it visually distinct. The leftover `<input type="checkbox" checked disabled>` was stale from before the per-row toggle/buttons rework. And the code cell was showing even when the user had not asked for account numbers (inconsistent with the rest of the app).

**Changes:**
- Name: **"Review Later"** → **"Uncategorized Items Needing Review"**.
- Code: **6999** → **9999**.
- Row: removed the `<input type="checkbox">` cell. Removed the always-on "Show" actions cell.
- `<code>9999</code>` cell is now `state.showNumbers ? '<td>...</td>' : ''` (consistent with every other table in the app).
- Updated the inline explainer to mention the new name + code.

**Spec:** D32 (also covers the code + name).

## F6.6 — "Skip (use all defaults)" → "Revert to Defaults" when state has changed (11:15 MDT)

**Why:** Once the user has hidden or deleted or renamed a category, "Skip" is no longer accurate — there's nothing to "skip." A "Revert to Defaults" button is the honest label AND does what most users actually want: undo the changes and start clean.

**Changes:**
- New state flags: `state._step2Dirty`, `state._step3Dirty`, `state._step4Dirty` (per-wizard-step).
- New helpers: `markDirty(prefix)`, `revertExpenses()`, `revertIncome()`, `revertOther()`.
- `__toggleHide` and the Edit-modal Save handler both call `markDirty` when state changes.
- The Add-modal Save handler now actually inserts into the right array and calls `markDirty` (was a demo `alert` previously).
- Step CTA: when dirty, button text is **"Revert to Defaults"**; on click, calls the appropriate revert helper. When clean, button text is "Skip (use all defaults)" and advances to the next step.

**Spec:** D33 added.

## F6.7 — Edit modal: Notes / Description field (11:15 MDT)

**Why:** "Tax Description" is the IRS descriptor (read-only, derived from the mapped line). That's not the same thing as a user-written description of *their* category. The Edit modal now has both: a read-only-ish "Tax Line Item" picker (with the softwarn that changing it affects tax exports) plus a free-form "Notes / Description" textarea that's stored on the account and shown in audit logs and Reports drill-down.

**Changes:**
- Edit modal fields: Name + Code + (Type) + Tax Line Item picker + **Notes / Description** (textarea, optional).
- The Notes value is stored on `account.note` (was previously a UI-only field in the wizard; now persistent).
- Same field added to the **Add** modal (since it's the same generic form).
- Wireframe is no longer a demo `alert()` — it actually commits the row into `state.expenses` / `state.income` / `state.other` based on the Type picker, generates a Code, and marks the relevant step dirty.

**Spec:** D35 added.

## F6.8 — Bug fix from round 4: `__toggleDelete` closure

**Why:** In round 4 I shipped a `__toggleDelete` that used `arr.splice(i,1)` in inline `onclick` JS. Inline JS in HTML attributes runs in global scope, where `arr` is undefined. The button was effectively a no-op. Caught while applying round 6.

**Fix:**
- New private `window.__pendingDelete` carries the `{prefix, i}` target across the modal's lifecycle.
- New `window.__confirmDelete()` does the actual splice + markDirty.
- Modal Save button now calls `__commitEdit` (for edit) or `__confirmDelete` (for delete), not inline `arr.splice(...)` strings.

**Spec:** Not a new decision; just a bug fix worth noting in the daily log.

## F6.9 — Sidebar: stale counts (carried over from round 5)

The sidebar still has hard-coded `Income (4) / Expenses (18) / Other (8)` from before the management page rework. Not changed in this round (out of Patrick's feedback), but flagged in the round-6 daily log as a follow-up.

---

## What changed at the artifact level

- `SETUP_AND_CATEGORIES.md` — Round-6 status header marker, D29–D36 added (7 new decisions). §7 step 2 layout block diagram updated to show Edit/Hide/Delete + "Tax Line Item" column. §7 Step 5 entry updated for new name + code. §8.2 Add modal now includes Notes / Description. §8.6 Settings → Categories unchanged.
- `WIREFRAMES.html` — CSS: `.cat-table th` z-index bumped. `catRowInputs` rewired with combined Tax Line Item cell + 1 actions cell. `DEFAULT_EXPENSE` Review Later renamed/recoded. `renderCats()` step 1 checkbox + rephrased intro; step 2/3 table headers use "Category name" + "Tax Line Item"; step 2 max-height 640px; step 5 stripped of checkbox + new name + showNumbers-gated code. New helpers: `markDirty`, `revertExpenses`/`revertIncome`/`revertOther`, `__commitEdit`, `__commitAdd`, `__pendingDelete`, `__confirmDelete`. `__openEdit` rewritten as generic Edit modal with Notes textarea. `__openAdd` Save now real (inserts into state, marks dirty, re-renders). `__toggleDelete` fixed.

## Validation

- Smoke test at `/tmp/wf-smoke.mjs` extended 100 → 121 assertions. **121/121 passing.**
- Disposable screenshots at `/tmp/wf4-snap-*.png` (still valid for round 4 state; round 6 changes are best eyeballed on the live wireframe).

---

*Captured by Rusty from Patrick's webchat messages 2026-07-08 11:15 + 11:35 MDT. Applied in next commit. Context note: session running on anthropic/claude-sonnet-5, 1M context, 37% used, 0 compactions; the "100% context used" UI warning observed at 11:35 appears to be a client-side counter mismatch (denominator 272k doesn't match this session) and does not reflect actual compaction state.*
