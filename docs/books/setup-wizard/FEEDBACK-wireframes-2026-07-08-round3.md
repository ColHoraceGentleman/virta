# Wireframes Feedback — Round 3 (apply 2026-07-08)

- **Source:** Patrick, 2026-07-08 ~10:12 MDT, webchat (after eyeballing round 2)
- **Scope:** Strip-and-fix pass on the Setup Wizard (4 small items)
- **Status:** Applied in commit `53621b5+1` (this round).
- **Apply to:** Both `SETUP_AND_CATEGORIES.md` AND `WIREFRAMES.html`. Categories Wizard still references Schedule C — that's correct, the rule is "after step 1 where we introduce it." Step 1 keeps its explainer; everything from step 2 onward is just UI.

---

## F3.1 — Step 1: remove "Up next" hint and the two preview bullets

**Why:** The "Up next" hint promised the next screen was Categories, but the button actually advances to Step 2 (Basic business info) of the same wizard. Categories is a separate wizard that comes after Step 6. The hint was misleading.

**Removed:**
- "Up next: set up your categories" line under the Get Started button
- "Pick your accounting method" bullet
- "Fill in your categories — pre-filled from Schedule C" bullet

**Kept:** Schedule C explainer infobox + "Most people finish in under 5 minutes" line + the single "Get started →" CTA.

**Spec note added:** editor's note in §6 Step 1 explaining the rule (no future-screen previews on this screen — they reduce ambiguity only if the destination is the literal next click, which it isn't here).

## F3.2 — Step 2: strip all Schedule C references + rename proprietor field

**Why:** Step 1 already introduced Schedule C. References on step 2+ feel redundant and "tax-form-y" for a screen that's just "tell us about your business."

**Changes:**
- "Your legal name (the business owner)" → **"Your name"** (label simplification)
- Removed: "This is you — the proprietor. Used in invoice headers (Schedule C, top of form)." helper
- Removed: "(Schedule C field A. Max 280 chars.)" from the description placeholder
- Removed: "From Schedule C field B." from the NAICS helper
- NAICS helper now: "Optional — don't know it? Skip and add later."
- Spec: §6 Step 2 "About you" and "About your business" tables updated; "Schedule C top of form", "field A", "field B" all stripped from notes
- Spec §6A: "Why is this on a tax app?" — "NAICS is on Schedule C field B" → "NAICS is a tax-form data point"

**Same pattern applied to Step 5 (Timeline):** "Schedule C field J. Optional." → "Optional."

## F3.3 — Step 6 (Review): pencil icons inline, not right-justified + neutral pill color

**Why:** Right-justified pencils read as separate UI elements rather than part of the field. Inline-after-field reads as "edit this specific value." Also the "v1 default" pill was using `.pill.system` (info-blue), which clashed visually with the rest of the page.

**Changes:**
- Row layout: `<dt>label</dt><dd><span>[value] ✎</span></dd>` (inline-after-field, no flexbox justify-between)
- "v1 default" pill: `.pill.system` → `.pill` (neutral grey background, matches "v1 only" pill on Entity type row and the "Available in a future version" pill on the Accrual radio)
- Same fix applied to the in-edit-pane "Cash" indicator on the Accounting method row

## F3.4 — Step 6: Save & continue button actually routes to Categories

**Why:** The button said "Save & continue to Categories" but the click handler set `state.setupStep=1`, which re-rendered Step 1 of the Setup Wizard. The user could click Save, get bounced back to the Welcome screen, and assume they needed to re-do the wizard. The button text lied.

**Fix:** Click handler now sets `state.screen='cats'; state.catsStep=1`, which dispatches `render()` to the Categories Wizard's Welcome explainer. Smoke-tested that this lands on the Categories Wizard header, not the Company Setup Wizard header.

---

## Open questions (none — all four were clean apply)

## What was changed at the artifact level

- `SETUP_AND_CATEGORIES.md` — 3 surgical edits in §6 (Step 1, Step 2, Step 5), 1 in §6A. No structural changes.
- `WIREFRAMES.html` — 4 surgical edits in `renderSetup()` (Step 1 body, Step 2 body, Step 5 helper, Step 6 row layout + Save handler). 1 minor in `REVIEW_FIELDS` (proprietor label).
- Smoke test (`/tmp/wf-smoke.mjs`, not in repo) — 41 → 48 assertions. 48/48 passing.

---

*Captured by Rusty from Patrick's webchat message, 2026-07-08. Applied in commit 53621b5+1 (next commit).*
