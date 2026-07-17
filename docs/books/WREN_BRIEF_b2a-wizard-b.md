# Wren Review Brief — B2a-wizard-B (wizard Steps 1-2 + NAICS modal)

**Reviewer:** Wren
**Build under review:** B2a-wizard-B — Setup Wizard Steps 1-2 + NAICS modal
**Builder:** Cinder (round 1 hit provider overload; Rusty committed Cinder's on-disk work + wrote the report)
**Date:** 2026-07-13 21:52 MDT
**Commit:** `5de5cef` on `main` (1 ahead of `984c223`)
**Spec source of truth:** `queued/TASK-b2a-wizard-b.md`
**Report:** `CINDER_REPORT_b2a-wizard-b.md`

---

## What was built

6 files (1 modified + 5 new), ~1,032 lines total:

- `SetupWizard.jsx` (291 lines, rewrite) — state machine, localStorage persistence, Welcome-back panel, render dispatcher
- `SetupWizardWelcome.jsx` (35 lines, new) — Step 1
- `SetupWizardBusinessInfo.jsx` (324 lines, new) — Step 2 with NAICS picker
- `SetupWizardNaicsModal.jsx` (267 lines, new) — Step 6A
- `SetupWizardProgress.jsx` (45 lines, new) — progress dots
- `SetupWizardStepPlaceholder.jsx` (70 lines, new) — Steps 3-6 placeholders

Steps 3-6 render "Coming in B2b" placeholders so the 6-step progress dots + step counter are demonstrably real. B2b replaces the placeholders with the actual step components.

---

## What to verify (focused — small build, single feature family)

### A. State machine

- `WIZARD_STORAGE_KEY` is `virta_books:wizard:setup:state` (matches brief).
- `hydrateWizardState()` on mount, validates shape, falls back to defaults on missing keys.
- Debounced save (250ms) on every state change.
- `setupCompletedAt === null` for B2a-wizard-B (lands in B2b).
- `setStep(n)` clamps to [1, 6].
- `revertSetupToDefaults()` clears only B2a fields, preserves B2b fields untouched (correct — B2b fields aren't user-editable in this build).

### B. Step 1 (SetupWizardWelcome)

- Headline: "Let's set up your books."
- Sub-headline infobox: Schedule C explainer.
- Reassurance line: "Most people finish in under 5 minutes."
- CTA "Get started →" → setStep(2).

### C. Step 2 (SetupWizardBusinessInfo)

- Two subheaders ("About you" / "About your business").
- "Your name" required, error rendered under field on save attempt (not on keystroke — matches spec).
- "What does your business do?" textarea maxLength=280, counter when > 200 chars (amber when within 10 of max).
- "Business name" optional.
- "Trade name" optional, helper text.
- "Industry code (NAICS)" — read-only input + "Look up NAICS →" button + clear ✕ when selected.
- "EIN" optional, soft format validation `/^\d{9}$/` or `/^\d{2}-\d{7}$/`, amber warning on bad format, no block.
- Skip ↔ "Revert to Defaults" label flip on dirty.
- Save → setStep(3).

### D. NAICS modal (SetupWizardNaicsModal)

- Search box, autofocus, 200ms debounce.
- Sector filter on left: 20 official 2022 sectors (the SECTORS array) including the "31-33" / "44-45" / "48-49" multi-code spans.
- Filter pipeline: sector first (cheaper), then search on title + code + keywords.
- Selected display at top when code already chosen.
- Esc closes; backdrop click closes.
- Footer: "Cancel" only (no Save — selection closes).

### E. Progress dots (SetupWizardProgress)

- One dot per step, connected by thin bar.
- Done/current/todo states with distinct styling.
- Clickable (with `onDotClick` prop) but no handler wired in this build — wait, the brief says progress dots are visual only. Verify no click-to-jump accidentally fires.

### F. Steps 3-6 placeholder

- All four steps render the same `SetupWizardStepPlaceholder` component.
- "Coming in B2b" pill.
- Step-specific blurb (`STEP_BLURBS` object).
- Back button → previous step.
- Skip button (steps 3-5 only) → next step.
- Save & continue button (steps 3-5) or "Finish setup (in B2b)" (step 6, disabled).

### G. What you do NOT need to review

- Transactions.jsx, Categories.jsx, BooksShell.jsx, Dashboard.jsx, Settings.jsx — untouched.
- B2a-prime server endpoints — already reviewed.
- The uncommitted Settings.jsx diff from B1 round 1 — not Cinder's commit.
- Wireframe HTML, spec, smoke test — untouched.

---

## Output

Write `docs/books/WREN_REPORT_b2a-wizard-b.md` with:
- TL;DR verdict: ✅ SHIP / ⚠️ / ❌
- Findings table (ID | Severity | Description | File:line | Suggested fix)
- Behavior verification table for the 19 IDs from the brief
- Spec drift section
- Out-of-scope findings

Severity definitions unchanged from prior reviews.

## Hard rules

- Don't push, no sub-agent spawns.
- Look at the actual code, not just the report.

## Push completion event

When done, push back to main with TL;DR + finding counts + any remaining concerns.

Begin.