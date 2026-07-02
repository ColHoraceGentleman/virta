# QA Methodology — Virta Projects

> **How Echo runs QA across all Virta-family projects** (Books, Tasks, future Lorelai, etc.). Co-located with each project at `qa/`. Project-specific behavior lists live in that project's `qa/QA.md`.

This is the discipline. Project docs are the data. Keep them separate so the discipline survives project turnover.

**For the universal engineering policies** (when to run QA, the post-Cinder checklist, hard rules, testing philosophy, scope thresholds): see `~/clawd/projects/process/ENGINEERING.md`. This methodology is the *how* of QA on a project; ENGINEERING.md is the *why* and *when*.

---

## The problem

Echo used to be review-by-reading: she read the code, wrote a verdict. That catches *design-level* bugs — wrong action firing, missing cascade, type confusion. It does **not** catch *runtime* bugs — buttons that don't render, click handlers that aren't wired, modals that don't close, dropdowns z-indexed behind something, behavior that requires a real user flow.

Review-by-reading is also non-deterministic. The set of behaviors Echo tests each phase is whatever she re-reads, which depends on what she happens to glance at. After several phases, that gives the *illusion* of coverage without the *substance*. New phases break old behaviors; nobody catches it until a user does.

This methodology fixes both.

---

## Roles

Three roles, each with a clear job. Nobody does two.

### Cinder (builder) — appends testable behaviors

When Cinder ships a feature or fixes a bug, her report ends with a "Test coverage" section listing every behavior the change introduces or modifies. Format is codified in `qa/templates/CINDER_BRIEF_TEMPLATE.md` — that template is the canonical brief format for every Cinder spawn going forward.

Cinder does not need to *write* the QA doc — she just adds the IDs to her report.

### Rusty (curator) — owns the QA doc

Rusty takes Cinder's report and updates `qa/QA.md` for the project:
- New behavior IDs get a one-line description and expected result.
- Existing behavior IDs get updated to match the new semantics.
- Stale behaviors (removed features, dead code) get struck through with a note.
- A "Change log" entry at the bottom records what was added/removed/changed.

Rusty also owns this `METHODOLOGY.md` and the Echo brief template.

### Echo (executor) — runs the QA doc

Echo reads:
1. `qa/METHODOLOGY.md` — the discipline (you're here).
2. `<project>/qa/QA.md` — the behaviors to verify.
3. Her phase-specific brief — what's new this round.
4. The corresponding Cinder build report — for context.

She then runs **the entire QA doc** as the floor of her verification, plus any new behaviors from the current phase's Cinder report. Reports results against the IDs.

---

## What "run the QA doc" means

Three things, in order:

### 1. Static + code-level checks

For behaviors like VB-DED-04 (Keep Original cascade), the test is *what happens to the database*, which can be verified with `curl` + `sqlite3` against the live service. Echo does this on every run; it's cheap, deterministic, doesn't need a browser.

### 2. Browser-driven interaction (for runtime behaviors)

For behaviors like "the Download button works," Echo spawns a headless browser, navigates to the live URL, exercises the button, and verifies the expected outcome. For each behavior she verifies, she checks:

- **Render**: the UI element exists in the DOM after the relevant state is reached.
- **Interaction**: clicking/selecting/typing/submitting fires the right handler.
- **Effect**: the backend state matches the expected result.
- **Side effects**: no console errors, no unexpected network calls, no other DOM mutations, no other DB writes (cross-cutting concern — see "Cross-cutting" section below).

A behavior that passes all four is verified. A behavior that fails any one is a finding.

**Tool:** Playwright is the default. Reasons below.

### 3. Cross-cutting interaction checks

The most valuable bugs caught by this discipline are *interaction* bugs — a Cinder change breaks a behavior that the doc says is fine, because the change touched an adjacent code path. Echo specifically tests for these by:

- For every new behavior added by Cinder, she tests at least one *old* behavior in the same surface area to catch regressions.
- For every behavior that has a destructive effect (delete, undo, etc.), she tests the *next* action (does the row list rebuild correctly? does the affected UI element re-render?)
- For every multi-step flow, she tests both the happy path *and* at least one error path (e.g., happy-path categorize, then categorize a row with a deleted category to test the error rendering).

---

## Tooling

### Browser automation: Playwright (Node)

**Why Playwright over the alternatives:**
- **vs Puppeteer**: Playwright is a superset (multi-browser, better wait handling, first-class trace viewer).
- **vs Selenium**: Less ceremony, faster, native Node API, no need for a Selenium server.
- **vs low-code tools (testRigor, etc.)**: Debugging is harder with low-code; we're a small team of agents; we don't need non-technical authors.

**What we use it for:**
- Headless navigation to the live URL (`virta.muckdart.com/books` or `localhost:3001/books`).
- Selector discovery (Playwright locators are robust to DOM changes).
- Click, fill, selectOption, hover, drag-drop, keyboard input.
- Network interception (assert no surprise calls).
- Screenshots + console logs as failure artifacts.

### Test inventory + helper

Per project, `qa/runner/` contains:
- `inventory.js` — auto-discovers buttons/links/inputs/forms on a target page. Helper used by Echo.
- `playwright.config.js` — base config (headless, trace on failure, screenshot dir).
- `helpers/` — page-object-style helpers (login, navigation, common flows).
- `runs/<date>/` — timestamped artifacts (screenshots, console logs, network logs).

Echo's briefs will point her at specific inventory files when scope is targeted, or tell her to "discover and exercise all interactive elements on `<route>`" when scope is broad.

### Failure artifacts

When a behavior fails, Echo writes to `qa/runs/<date>/<VB-ID>/`:
- `screenshot.png` — before the action.
- `screenshot-after.png` — after the action.
- `console.log` — full browser console output.
- `network.log` — every request/response (URL, status, body if relevant).
- `command.txt` — the exact Playwright invocation that produced the failure.
- `notes.md` — one paragraph: what was expected, what happened, what's needed to fix it.

This is the artifact Cinder reads. It must be self-contained — no "you had to be there."

---

## Behavior ID convention

`VB-<area>-<NN>`. Areas are stable across a project (e.g., `CAT` for Categorize, `IMP` for Import). Numbers are unique within an area and never re-used. Strike-through an ID rather than re-numbering when a behavior is retired — old IDs in reports remain referenceable.

Cross-project conventions (so future projects can inherit):
- `XCT` for cross-cutting
- `MET` for methodology-level behaviors (test-the-test infrastructure)

---

## What QA is NOT

- **Not a substitute for code review.** Echo still reads the code and writes design-level findings. The browser tests don't replace that — they extend it.
- **Not exhaustive.** We can't test every permutation; we test the *behaviors* that matter, including the documented happy paths and the obvious failure modes. If we wanted exhaustive, we'd need a team of full-time QA.
- **Not gated on CI for now.** Echo runs as part of phase reviews. CI gating (running QA on every push) is a future addition — practical considerations: the agent stack isn't always available, the live service is shared, and we'd need to be careful about DB state pollution.
- **Not user-acceptance testing.** Echo doesn't validate "does the user love it." She validates "does it work as documented."

---

## Post-Cinder checklist (Rusty's gate)

See `~/clawd/projects/process/ENGINEERING.md` §5.8 for the full Rusty gate. Summary: every Cinder delivery triggers Rusty to (1) fold Test coverage into `qa/QA.md`, (2) decide review depth (full/light/none), (3) spawn Wren if warranted, (4) spawn Echo if warranted, (5) backfill multiple phases in one spawn if needed, (6) log the call in the daily note.

## Change log

- 2026-07-01 — Initial draft. Roles (Cinder appends, Rusty curates, Echo executes), Playwright as canonical tool, behavior ID convention, failure-artifact spec.
- 2026-07-01 — Added CINDER_BRIEF_TEMPLATE.md codifying Hard Rules (e.g., STOP on data loss, FK enforcement + DROP TABLE interaction) and requiring Test coverage section in every Cinder report.
- 2026-07-01 — Added "Visual confirmation" requirement to CINDER_BRIEF_TEMPLATE's Verification spec (item #4). For any rendering/UI change, open the affected view in the browser in both light and dark mode. Lesson from the 2026-07 dark-mode-category-colors delivery: smoke tests that only check the code path miss user-visible state when a project-level dark mode toggle (or similar) is the gate.
- 2026-07-02 — Post-Cinder checklist promoted to `~/clawd/projects/process/ENGINEERING.md` §5.8 (universal policy). METHODOLOGY.md now references ENGINEERING.md for the *why/when* and stays focused on the *how* of running QA on a project. Change prompted by Phase D / F1 / E.1 shipping without Wren or Echo between Phase C and today — discipline existed, trigger was missing, gate is now codified universally.
