# Virta Books v2 — Visual Design Research

**Author:** Lore (Lore research run, 2026-07-09)
**For:** Patrick (decision), Rusty (build)
**Status:** Research only — no wireframe changes proposed.
**Time to read:** ~10 min (scan tables, jump to §6).

---

## TL;DR

Virta Books v2 needs a **distinct visual identity from Virta Tasks** — same DNA, different domain. Tasks is a *dark-mode kanban for focused flow*; Books is a *long-session desk where you stare at numbers, taxes, and IRS line codes for 30+ minutes*. Trying to share the same chrome would hurt both products.

**Recommendation: Direction B — "Settled Library"** (warm parchment dark, sage accent, serif voice for amounts, generous table density). It's the only direction that (a) feels like the same family as Virta Tasks, (b) reads as "books/accounting" not "task board", (c) is comfortable for 30+ min sessions, and (d) is implementable in the wireframe in a small number of decisions.

Five-direction comparison, per-direction pros/cons, and a 10-item punch list are in §5–§7.

---

## 1. Virta Tasks design audit (the baseline)

**Screenshots captured:**
- `virta-tasks-board-current.png` — live Virta Tasks board at `localhost:3001`
- `virta-books-v1-current.png` — live Virta Books dashboard at `localhost:3001/books/dashboard`
- `wireframe-baseline-current.png` — current v2 wireframe (`WIREFRAMES.html`)

**Source files reviewed:**
- `client/src/index.css` (30 lines — minimal global, just scrollbar + body font)
- `client/src/App.jsx` (top-level shell, Tailwind classes)
- `client/src/books/BooksShell.jsx` (Books v1 shell, dark-mode-only)
- `client/src/components/Toolbar.jsx`, `KanbanColumn.jsx`, `TaskCard.jsx`
- `client/src/lib/colors.js` (post-it category palette)

### 1.1 Virta Tasks (dark, production)

| Aspect | Value | Notes |
|---|---|---|
| Background | `slate-900` (#0F172A) | Deep cool dark, not pure black |
| Surface (cards) | `slate-800` (#1E293B) for cards without category | Dark cards read as "the un-colored ones" |
| Column chrome | `slate-800/50` (50% alpha over `slate-900`) | Subtle lifted-feel via opacity, not borders |
| Borders | `slate-700`/`slate-800` hairline | Hairlines, never thick |
| Text | `slate-100` headings, `slate-300/400` body, `slate-500` muted | Tight slate scale |
| Primary accent | `indigo-600` (#4F46E5) | Used for "+ New Task", active filter, project-active pill |
| Wordmark accent | `~` glyph in `#6366f1` (indigo-500) at 22px, then "VIRTA" in 300 weight, 0.28em tracking, all-caps | The brand mark. Identical in Books v1. |
| Wordmark font | system stack | `font-size: 17, font-weight: 300, letterSpacing: 0.28em, text-transform: uppercase` — the brand voice is "spaced caps, light weight, indigo tick mark" |
| Typography | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | System stack. No web font. |
| Body sizes | text-xs (12px) for buttons, text-sm (14px) for nav, text-base for card titles | Lean scale |
| Weights | 200 (logo tick), 300 (wordmark), 400-500 (body), 600 (column headers) | Light overall, deliberate |
| Border radius | `rounded-xl` (12px) for columns, `rounded-lg` (8px) for cards/buttons, `rounded-full` for pills | Soft, consistent |
| Shadows | none on flat surfaces; `shadow-lg` for dropdowns only | Flat-first |
| Category colors | `fef9c3 / fed7aa / fbcfe8 / fecaca / ddd6fe / bfdbfe / bae6fd / 99f6e4 / bbf7d0 / d9f99d` | Pastel post-its with **dark text on all of them**. This is the personality. |
| Priority pill | Raw `#FFFF00` yellow with `#856900` border + dark text | Deliberately ugly-by-2026-standards, keeps it from looking too "consumer-app" |
| Top bar | `border-b border-slate-700 bg-slate-900/80 backdrop-blur sticky top-0 z-30` | Translucent + sticky, classic Linear/Notion pattern |
| Density | Compact — 280px columns, ~8px gutter, ~10px padding inside cards | Optimized for many items visible |
| Sidebar | None — horizontal top bar | Tasks doesn't have a sidebar; the calendar sidebar slides in from the right on demand |
| Iconography | Emoji (📅 ⚙️ 🔍 ☀️) + text labels | No icon font, intentionally low-fi |
| Animations | dnd-kit drag transitions; no gratuitous motion | Restrained |

**Personality summary:** Dark, dense, post-it playful for task categories, indigo for primary action. The category pastels are the joy. It's the dashboard of someone who lives in their work.

### 1.2 Virta Books v1 (production, current)

The Books v1 shell (`BooksShell.jsx`, ~120 lines) is essentially: same dark-mode top bar as Tasks, but with **inline route buttons** instead of project pill. No sidebar. Indigo `#6366f1` `~` mark + "VIRTA BOOKS" wordmark identical to Tasks. Page content varies per route.

Dashboard renders three slate-800 cards ("ACCOUNTS 29 / CUSTOMERS 5 / INVOICES 5"), a Quick Actions card grid, and a "Coming in later phases" bulleted list. Same Tailwind slate scale. **Same DNA, same chrome** — but stripped of the playful category palette, because accounting data doesn't get post-it colors.

**The Books v1 problem it solves:** Show "this is the same Virta family." That's the right instinct.
**The Books v1 problem it creates:** When you switch from a colorful task card to a numeric dashboard, the indigo accent feels disconnected from the domain (numbers, schedules, taxes). And dark mode for 30+ min of staring at transaction rows is genuinely tiring.

### 1.3 Virta Books v2 wireframe (the thing we're improving)

The wireframe (`WIREFRAMES.html`, 1425 lines, single-file SPA) already represents a **conscious pivot** away from the dark-Tasks look:

- Light cream background (`#f7f7f5`)
- Dark sidebar (`#111827`, full-height left rail)
- Sage-green accent (`#2f7d4f`) — replacing indigo for primary actions
- System font, 14px / 1.45
- 7-10px radii
- Sticky table headers, modal dialogs with backdrop blur

So the wireframe has already committed to: **light theme + sidebar + sage**. What's missing is depth, polish, and a typography voice. The rest of this report is about what to add — and what to push back on.

---

## 2. Modern accounting-app design (2025/2026 landscape)

**Source caveat:** I couldn't pull live screenshots of QB Solopreneur, Xero, or Keeper (paywalls/auth). I'm relying on reviews, brand kits, design-system write-ups, and Xero's own blog. Specific hex values are flagged as approximate where I'm reading them second-hand.

| App | Sidebar | Background | Accent | Type | Density | Personality |
|---|---|---|---|---|---|---|
| **Wave** (current redesign) | Left sidebar, white | White / very light gray | Teal/blue-green `#1E8FA8`-ish | System sans | Medium-large, roomy | Friendly SMB. Dashboard cards with big numbers. Streamlined invoicing. "AI-enhanced expense tracking" added 2025. |
| **FreshBooks** (post-2024 rebrand) | Left sidebar, dark navy | White | FreshBooks green `#0075DD` area, sage-leaning | Custom sans | Medium | "Built for owners, and their clients" — softer, friendlier. New logo Oct 2025 emphasizes humanity. |
| **QB Solopreneur** (revamped QBSE) | Left sidebar, white/light | White | Intuit green `#2CA01C` | System sans | Medium-compact | Schedule C filers. Simpler than full QBO. No balance sheet. Tone: "we'll do your taxes for you." |
| **Xero Aurora** (current redesign) | Left sidebar, white | White | Xero blue `#1AB4E9` | Custom sans (XUI system) | Medium | Big 2025 refresh — clean list views, better contacts visibility, "two ways to view transactions" toggle. Iterative, not flashy. |
| **Found** (small biz banking) | Bottom nav on mobile, top tabs on web | White with warm card tints | Warm green `#1B7340`-ish | Friendly sans | Generous | "Sole proprietor first." Sole prop tax auto-set-aside is the headline feature. Tone: warm, not corporate. |
| **Keeper/Double** (bookkeeper→client) | Right panel | White | Muted purple-ish | System sans | Dense | Built for bookkeepers not owners. Review-later workflow visible. (Note: G2 reviews say UI design has been a sore point — useful warning.) |
| **Bench** (client portal) | Top tabs | White | Warm orange-ish | System sans | Generous | Outsourced bookkeeping. The portal is the owner's window into Bench's work — soft, narrative. |

**Cross-app patterns (the signal):**

1. **Sidebar + white background is dominant.** None of the modern accounting apps ship dark-first. Wave/FreshBooks/QB/Xero/Found all default to light.
2. **Accountant-blue is fading.** Xero is the last holdout of pure `#1AB4E9`. Wave is teal, Found is warm green, QB Solopreneur is Intuit green. Blue signals "old accounting software."
3. **One accent, used sparingly.** Most apps use their accent for primary CTAs, active nav state, and 1-2 chart highlights. The rest of the interface is gray-on-white.
4. **Dashboard cards are big-number simple.** "ACCOUNTS 29 / CUSTOMED 5 / INVOICES 5" — Virta Books v1 already does this. Keep it.
5. **Sage / forest greens are the warm exception.** Found, partially Wave. Green says "money without screaming about it." Matches our existing wireframe sage.

---

## 3. Comfortable-for-long-use patterns

Apps people stare at for 30+ min (Linear, Notion, Mercury, Ramp, modern finance). Pulled from design-system write-ups, Linear's redesign essay, Mercury's documented system, and Refero Styles.

| Pattern | Source | Implication for Books |
|---|---|---|
| **Dark-canvas with layered surfaces** | Mercury (`rgb(15,15,20)` → `rgb(25,25,32)` → `rgb(38,38,48)`) | If dark, do *layered* dark — not flat slate-900. Three surface values. |
| **Generous line-height** | Mercury uses 1.625 (vs typical 1.5); Ramp uses 1.6 | 14px body → 1.6 leading is the sweet spot for sustained reading. |
| **Weight calibration beyond 100s** | Mercury's Arcadia has weights at 360/420/480 | Variable fonts (Inter Variable, Geist) let you land on the exact right gray, not just Bold/Regular. |
| **Hairline borders, no shadows** | Ramp design system | Borders > shadows for cards on dark; on light, the reverse often works (soft shadow + no border). |
| **8/12/16/24 rhythm** | Ramp, Linear | Standard. Avoids the "0.5× / 1.5× / 2.5×" trap. |
| **12-16px radius on cards, 6-8px on buttons** | Ramp | Buttons should be tighter than cards. Our wireframe mixes these — good. |
| **Mono numerals for amounts** | Mercury (28px 500-weight for balances); Linear | Financial data deserves its own voice. Tabular-nums + slightly heavier weight + tighter tracking. |
| **Sticky headers on tables** | Notion, Linear, Ramp | Already in wireframe. Don't lose it. |
| **Subtle, intentional motion** | Linear's 2024 redesign essay | "Reduce visual noise, maintain visual alignment." Don't animate the chrome; do animate state changes (e.g., row appearing). |
| **Right-side contextual panels** | Notion sidebar, Linear panels | Useful for "audit log" / "details" — Patrick flagged this for GL. Reserve a slot. |
| **Translucent sticky chrome** | Linear, Notion (`backdrop-blur`) | Already in v1 Books. Keep. |
| **Empty states with intent, not stock illustrations** | 2026 anti-pattern per Creative Boom | Empty state should be a sentence + a button, not a person at a laptop. |

---

## 4. Anti-patterns to avoid (2026)

Sourced from Creative Boom's "10 trends creatives are so over in 2026," Tubik's "UI Design Trends 2026," and UX Collective trends piece.

- **AI-generated illustrations as filler.** Especially the LinkedIn-Marvel-superhero portrait genre. Empty states should not have them.
- **Glassmorphism / liquid glass / "frosted everything."** Apple turbocharged this in 2025; backlash built simultaneously. Don't reach for it.
- **Logos / chrome with gradients.** Golden-hued gradient aesthetic is the AI-generator default; it's instantly "made in Canva 2024."
- **Dark mode by default for productivity tools that aren't creative tools.** Light is the dominant choice for accounting 2026. Dark-first for *brand identity* apps (Mercury) is fine; dark-first for *spreadsheet work* isn't.
- **Lazy minimalism.** "Looks minimal because every element is doing exactly what it needs to" ≠ "looks minimal because I ran out of ideas." The wireframe's current system fonts + default blue is the latter.
- **Bento grids for everything.** Real when you have genuinely different content shapes (Apple product pages). Fake when all your cards are the same shape and you just want a "modern" look. We're not doing bento — we have a sidebar + main column already.
- **4-pointed-star AI logos and "glowing gradients" everywhere.** Anti-pattern.
- **Motion for motion's sake.** Animating the brand guidelines page. Animating the sidebar toggle. If it doesn't explain state, cut it.
- **"Honest" stock photography.** Per Creative Boom survey: "The trend I'm tired of is dishonesty." Don't use aspirational-people-at-laptops imagery.
- **AI first-pass copy** ("Harness the power of..."). The wireframe copy is dry and direct — that's a feature. Keep it.

---

## 5. Five design direction options

Each direction is a complete spec: palette, type, density, sidebar treatment, button style, table voice. All assume the existing wireframe structure (sidebar + main column). I'm calling them A–E.

### Option A — "Same as Virta Tasks" (do nothing visually)

Take the v1 Books shell (dark slate-900 + indigo + horizontal top nav) and apply it to the v2 wireframe. No new design work.

- **Palette:** slate-900 background, slate-800 surfaces, indigo-600 accent (`#4F46E5`), slate-100/300/500 text scale.
- **Type:** system sans (already in Tasks), 14px body, 18px headings.
- **Density:** compact (8px padding inside cards, 280px sidebar).
- **Sidebar:** None — horizontal top nav like v1 Books. Lose the existing wireframe's left sidebar.
- **Buttons:** indigo-600 primary, slate-700/800 secondary.
- **Tables:** dark cards, hairline borders, white text, indigo row-hover.
- **Pros:** Zero implementation cost. Maximum family resemblance. Patrick can ship in 10 minutes.
- **Cons:** It's not an improvement — it's a regression disguised as consistency. Tasks-style dark is for 90-second glances; Books is 30+ min stare-at-numbers. Users will feel the chrome is wrong even if they can't articulate why. Also: the *current* wireframe is already a deliberate departure from this direction. Going back undoes a decision.
- **Cost:** Trivial. Mostly deletions.
- **Verdict:** No. The status quo of v1 Books is exactly why we're doing v2.

### Option B — "Settled Library" ⭐ recommended

Warm parchment light + sage green + serif voice for numbers + generous table density. Reads as "a quiet desk where accounting happens."

- **Palette:**
  - Background: `#F5F1E8` (warm parchment) or `#FAF7F0` (lighter option)
  - Surface: `#FFFFFF` cards
  - Sidebar: `#1C2A23` (deep forest) — darker than Tasks slate, clearly its own family
  - Primary accent: `#3F6B4E` (sage green) — the wireframe already has `#2f7d4f`; lift it slightly warmer
  - Semantic: success `#3F6B4E`, warn `#A66A1A`, danger `#A53A3A`, info `#3A5A8A` (muted, not candy)
  - Lines: `#E5DFD1` (warm hairline) on parchment; `#E2E0D8` (neutral) on white surface
  - Text: `#2A2620` headings, `#4A443C` body, `#7A736A` muted
- **Type:**
  - Body: **Inter Variable** (drop-in replacement for system stack, free, weights 360/420/480 available — Mercury-style calibration)
  - Display / page titles: **Source Serif 4** at 400 weight, slight letter-spacing — the "settled library" voice. Used sparingly (only H1s).
  - Amounts (currency, totals, account balances): **Geist Mono** or **JetBrains Mono** with `font-variant-numeric: tabular-nums`, 14px in rows, 22-28px in summary tiles, 480 weight (not 700 — calmer).
  - Scale: 11 / 12 / 14 / 16 / 20 / 24 / 32 / 40
- **Density:** Generous — 10/12/16/24 rhythm, 14px body with 1.6 leading. Cards have 12-14px internal padding. Tables have 10px row height (was 8px in wireframe — bump it for reading comfort).
- **Sidebar:** Keep existing 232px left rail. Background deep-forest `#1C2A23`. Logo block uses serif "Virta Books" wordmark in cream, with the sage `~` mark. Nav items slate-300 / hover slate-100 / active sage `~`-dot or sage text. **No emojis in nav** — this is the first place to retire them. (Categories screen still has them as decorative.)
- **Buttons:**
  - Primary: `#3F6B4E` background, `#FAF7F0` text, 8px radius, 500 weight, 14px
  - Secondary: white surface with `#3F6B4E` text and border
  - Tertiary (ghost): transparent, sage text on hover
  - Destructive: text + border `#A53A3A`, no fill
- **Tables:**
  - Warm hairline `#E5DFD1` between rows
  - Header row: parchment `#F5F1E8`, 500-weight column labels, sort arrow in sage
  - Body: 14px Inter, 1.6 leading, **tabular-nums mono** on amount columns
  - Row hover: `#FAF7F0` wash
  - "Review Later" rows: cream wash `#FAF3E0` (already in wireframe; lift saturation slightly)
- **Empty states:** Centered, one sentence in `#4A443C`, one sage primary button. No illustrations.
- **Pros:**
  - Clearly same family as Tasks (sage tick mark motif, dark sidebar + light main, indigo→sage primary) but unmistakably its own domain.
  - Comfortable for 30+ min — warm tones, generous line height, no glare.
  - Sage is in the wave of "warm greens" used by Found, partially Wave. Reads current without being trendy.
  - Mono-for-amounts is the single biggest legibility win in financial UIs.
  - The wireframe is 70% of the way there — most of this is refinement, not rewrite.
- **Cons:**
  - Two-font system (Inter + Source Serif) costs ~80KB of webfont. Acceptable.
  - "Warm parchment" can read "old accountant" if not done carefully — that's mitigated by Inter's geometric clarity.
  - Need to source / pick the exact shade of sage. Currently `#2f7d4f` works; could nudge to `#3F6B4E`.
- **Cost:** Medium. Tokenize the palette in `:root`, swap font stack, replace one-off hex values, update table chrome. ~1 session of wireframe work + a font audit.

### Option C — "Modern Indigo Light"

Light theme with Virta Tasks' indigo accent transplanted. Sidebar light, accent indigo, generous density. The "if Linear did accounting" answer.

- **Palette:** white `#FFFFFF`, slate-50 surface, slate-900 text, indigo-600 accent, slate-200 hairlines.
- **Type:** Inter only. 14px body, 20-24px headings, tabular-nums on amounts via Inter's `font-feature-settings`.
- **Density:** Compact-comfortable — 280px sidebar, 8-10px card padding, 14px rows with 1.55 leading.
- **Sidebar:** Light slate-50, slate-900 text, indigo-600 active indicator (left bar 2px).
- **Buttons:** indigo-600 primary (matches Tasks), white secondary, indigo-50 ghost.
- **Tables:** White cards, slate-200 dividers, indigo row-hover wash, indigo sort arrow.
- **Pros:** Strong family resemblance to Tasks (same indigo). Familiar-feeling to Linear/Vercel users. Easy to implement — Tailwind already has every color.
- **Cons:** This is the "B2B SaaS template" look. By 2026, *every* SaaS dashboard is white-with-indigo. It's become the new "default blue" — the thing we have *now*. Doesn't earn its place.
- **Cost:** Low. Mostly Tailwind class swaps.
- **Verdict:** Tempting (lowest-effort "current-looking") but doesn't actually solve the brief's "feels modern but not trendy" requirement.

### Option D — "Deferential Dark"

A more sophisticated version of the v1 Books shell. Dark slate-900 main canvas + sage accent + serif headlines. Reads as "premium fintech" (Mercury-adjacent).

- **Palette:** `#0F172A` main, `#1E293B` surfaces, `#334155` elevated, sage `#3F6B4E` accent, slate text scale.
- **Type:** Inter Variable + Source Serif 4 for page titles. Same calibration approach as Mercury.
- **Density:** Spacious. 14-16px row height. Generous padding.
- **Sidebar:** None — keep top horizontal nav like v1 Books (this is a key differentiation from Tasks).
- **Buttons:** Sage primary. Ghost secondary. Pill-shaped CTAs (Mercury does this).
- **Pros:** Cool. Premium-feel. Differentiated from the white-everything SaaS pack.
- **Cons:** Dark mode for accounting work is the Wave/FreshBooks/QB anti-pattern. The brief explicitly says "not a fintech dashboard." Mercury earned dark-first through cinematography and brand photography; we don't have that lever. Also: re-merges Books and Tasks visually — same dark slate, same indigo→sage accent, same top nav. Where's the differentiation?
- **Cost:** Low. Same as v1 Books with font swaps.
- **Verdict:** No — too close to v1 Books, doesn't earn the warm/comfortable requirement.

### Option E — "Notion-Plain"

Strip chrome to the bone. White pages, slate text, black borders, almost no color except for "destructive" red. Maximally calm.

- **Palette:** `#FFFFFF`, `#FAFAFA` surface, `#1F1F1F` text, `#E5E5E5` borders, accent `#000` for primary.
- **Type:** Inter only, single weight scale 400/500.
- **Density:** Spacious — Notion's actual default.
- **Sidebar:** Plain white with hairline border.
- **Buttons:** Black-on-white primary, white-on-black inverse. Very Linear.
- **Pros:** Most "comfortable for long use" of any direction. Doesn't get tired. Notion-Plain is genuinely current.
- **Cons:** Reads as "tool" not "accounting app." No warmth, no domain character. Also: doesn't say "Virta" — could be any product.
- **Cost:** Low. Very few components needed.
- **Verdict:** Solid as a fallback if Direction B feels too opinionated. Not the choice for a first impression.

---

## 6. Side-by-side comparison

| Dimension | A: Same as Tasks | B: Settled Library ⭐ | C: Modern Indigo Light | D: Deferential Dark | E: Notion-Plain |
|---|---|---|---|---|---|
| Family resemblance to Tasks | High (chromatically identical) | High (motif: tick mark, dark sidebar, sage accent) | High (indigo accent) | Very high (dark + accent only) | Medium (chrome only) |
| Reads as accounting/books | No — reads as tasks | **Yes** | No — reads as B2B SaaS | Maybe — reads as fintech | No — reads as tool |
| Comfortable for 30+ min | Poor (dark + dense) | **High** | High (light, roomy) | Medium | High |
| Current (2026, not 2022) | No — that's v1 | **Yes** | Tired (default SaaS look) | Yes, if executed carefully | Yes |
| Warmth / human | Low | **High** | Low | Medium | Low |
| Implementation cost | Trivial | Medium (~1 session) | Low | Low | Low |
| Differentiates Books from Tasks | No (kills v2's reason to exist) | **Yes** | No (indigo = Tasks) | No (dark slate = Tasks) | Medium |
| Risk | None | Medium (serif + sage combo could feel "old accountant" if not careful) | Low | Medium (going against 2026 accounting trend) | Low |

**Headline:** Direction B is the only option that scores "high" on both "same family as Tasks" and "feels like its own domain." That's the trade-off the brief asks for.

---

## 7. Recommendation + punch list

**Go with Direction B — "Settled Library."**

### Why

1. **It honors the v2 wireframe's existing commitments** (sidebar, sage, light). The wireframe isn't wrong about the direction — it just hasn't been finished.
2. **It creates the family resemblance the brief asks for** without making Books a clone of Tasks. The shared motifs are the `~` tick mark, the dark-sidebar-over-light-main pattern, and the indie-SMB-friendly accent palette. The differences (warmth, parchment, serif voice for numbers, mono for amounts) are earned by the domain.
3. **It is the only direction where Virta Books has a real identity.** Without B, C, D, or E, Books is "Tasks but for numbers." With B, Books is "the place where accounting happens calmly."
4. **It is implementable.** The tokenization, font swap, and chrome refinements are wireframe-scoped. No new components required.

### Punch list (10 items, in order)

1. **Lock the palette in `:root`.** Background `#F5F1E8`, surface `#FFFFFF`, sidebar `#1C2A23`, accent `#3F6B4E`, hairline `#E5DFD1`, semantic (success/warn/danger/info) warm-toned, text scale 3 values.
2. **Add Inter Variable as the body font** (free, drop-in). Replace the system stack in `body` and component classes.
3. **Add Source Serif 4** for page H1s only. Used on the title row at the top of each screen. Nothing else.
4. **Add Geist Mono** for all numeric / currency columns. Apply `font-variant-numeric: tabular-nums` and `font-weight: 480` on amounts. Sizes: 14px in table rows, 22-28px in summary tiles.
5. **Refine the sidebar.** Replace the existing emoji-prefixed nav items with text-only labels (Dashboard / Invoices / Transactions / Categories / Setup / Settings). Keep the `~`-tick + "VIRTA BOOKS" wordmark, but switch the wordmark to **Source Serif 4 weight 400** in cream `#F5F1E8`. Active item: sage `#3F6B4E` 2px left bar + cream text.
6. **Bump table density for comfort.** Row padding 8→10px, leading 1.45→1.6, font-size 13→14px on body rows. Header row uses parchment wash and 500 weight.
7. **Replace the existing sage `#2f7d4f`** with `#3F6B4E` throughout. Same role, slightly warmer + lighter. Adjust `--accent-soft` to `#E5EFE7` to match.
8. **Empty states.** One sentence + one button. No emoji illustration. No stock photo. Centered, muted text color, sage button.
9. **Modal dialogs.** Existing `box-shadow: 0 20px 60px rgba(15,23,42,.25)` is fine but heavy — soften to `0 8px 32px rgba(60,50,30,.12)` to match the warm palette.
10. **Pick the one "Review Later" tint** (`#FAF3E0`) and apply it consistently to: review-later table rows, soft-warn chips, "needs attention" indicators. Don't introduce a second warm tint — the warmth comes from restraint.

### What the punch list does NOT do (out of scope for v2)

- Adds no new components, screens, or interactions.
- Doesn't change the wireframe's structure (sidebar + main, wizard flow, table layouts).
- Doesn't add new colors — sage stays sage.
- Doesn't introduce dark mode (the wireframe is light-only, by intent).
- Doesn't change copy, microcopy, or labels.

### Decision points for Patrick

- **P1:** Settled Library vs. one of the others. B is my recommendation; if you want lower-effort, C or E are the runners-up.
- **P2:** If B, do you want Source Serif 4 (slightly literary, "accountant's ledger") or stay sans-only (more contemporary)? My recommendation is serif H1s.
- **P3:** Sage shift — keep `#2f7d4f` (the existing wireframe value) or move to `#3F6B4E` (slightly warmer)? Either works; I'd nudge warmer.

---

## Appendix — Sources I trusted vs. didn't

**Trusted (primary docs / design essays):**
- Linear's "How we redesigned the Linear UI" — first-hand redesign rationale
- Xero blog post on Aurora redesign — first-hand
- Mercury design analysis (Blake Crosley) — third-party but detailed enough to be a system spec
- Creative Boom "10 trends creatives are so over in 2026" — survey-backed
- Tubik's "UI Design Trends 2026" — well-sourced trend essay
- Live screenshots of `localhost:3001` for Virta Tasks and Books — primary

**Less trusted (paywalled, second-hand, or review-only):**
- QB Solopreneur screenshots (no live access; based on PCMag / Intuit product page)
- Keeper UI (based on G2 / Capterra reviews noting UI complaints)
- Xero hex values (from brand color kits, may be slightly stale)
- Wave hex values (from review screenshots, may not match current build exactly)

**Not investigated (out of brief scope):**
- Bench client portal (current redesign — couldn't authenticate)
- Mobile responsiveness of any of the above
- Accessibility audits (a separate workstream)

---

**End of report.** Ready for the next Lore task.