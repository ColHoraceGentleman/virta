# Lore Task Brief — Virta Books visual design research

**Queued by:** Rusty
**Queued at:** 2026-07-09 12:31 MDT
**Trigger:** As soon as Lore returns from the manual-entry UX research (her current task)
**Project:** Virta Books v2 design (umbrella: `docs/books/setup-wizard/VIRTA_BOOKS_V2.md`)
**Source of truth:** This brief, not the queueing conversation

---

## Goal

Find concrete design direction for the Virta Books app so it looks modern, feels comfortable for long use, and fits the existing Virta ecosystem. Currently the wireframe uses very basic styling — minimal CSS, system fonts, default blue. Big room to make it warmer / more comfortable.

## Constraints

- **Must fit the Virta ecosystem** — Virta Tasks is the existing design language. Books should feel like the same family of products, not two different apps.
- **Sole-proprietor / non-accountant audience** — not a fintech dashboard, not QB Online's UI.
- **Current (2025/2026)** — should feel current but not trendy. No glassmorphism-for-glassmorphism's-sake. No aggressive gradients.
- **Comfortable for 30+ min sessions** — not a glance-and-leave app.

## What to investigate

### 1. Virta Tasks design audit (the baseline)

Open `~/clawd/projects/task-manager/client/` and look at the existing Virta Tasks UI. Note:
- Color palette (primary, secondary, neutrals, semantic — success/warn/error)
- Type scale (display, headings, body, caption, mono)
- Spacing scale (4/8/12/16/24/32?)
- Component patterns (buttons, cards, inputs, lists, sidebars)
- Density (compact vs. spacious — line-height, padding)
- Iconography style
- Empty states, error states, loading states
- Border / shadow / radius language

Capture screenshots if possible. This is the baseline we are matching.

### 2. Modern accounting-app design

Look at the current (2025/2026) UI of:
- **Wave** (the new design)
- **FreshBooks** (current, not the 2018 version)
- **QuickBooks Solopreneur** (the new tier, if accessible)
- **Xero's Aurora refresh** (current)
- Newer entrants: **Found**, **Keeper**, **Bench's redesigned client portal**

Note sidebar patterns, dashboard card density, typography choices, color palettes, the way data is presented.

### 3. Comfortable-for-long-use patterns

What are the trends for apps people spend 30+ min in?
- Light/dark mode handling
- Font choice (sans for data, mono for amounts?)
- Spacing density
- Focus states
- Empty states
- Source from places like **Linear**, **Notion**, **Mercury**, **Ramp**, modern finance apps.

### 4. Anti-patterns to avoid

What is tired or overdone in 2026?
- Glowy neon gradients
- Dark mode by default
- AI-generated illustrations as filler
- Overly minimal "Apple keynote" aesthetics
- Anything else you notice that's already played out

### 5. What "Virta-feeling" means

The design should feel like it belongs next to Virta Tasks. Concrete spec: when the user tabs between Virta Books and Virta Tasks, it should feel like the same family of products. Same DNA, different domain.

## Output

Write a single research report to `~/clawd/projects/task-manager/docs/books/setup-wizard/research-design-2026-07-09.md` with:

- **Virta Tasks design audit** — colors, type, spacing, component patterns, with screenshots or filenames
- **3-5 design direction options** — each one is a complete visual concept (color palette, type, density, sidebar treatment, button styles) with examples from real apps
- **Per-direction pros/cons** — what it does well, what it sacrifices, how hard it would be to implement in the wireframe
- **Recommendation** — which direction fits best, with rationale, and a 5-10 item punch list of "make it feel this way" changes

Format: scannable, ~1500-2500 words. Use tables for the per-direction comparison. Patrick will read in 10 min.

## Constraints (work)

- Research only. **Do not write code or modify the wireframe.**
- No sub-agents.
- No Virta Tasks board updates.
- ~45-60 min of work is appropriate.
- If you cannot find detailed info on one app, note it and move on.

## When done

Push a completion event with a 2-3 line summary of what you found. Same as the manual-entry research.
