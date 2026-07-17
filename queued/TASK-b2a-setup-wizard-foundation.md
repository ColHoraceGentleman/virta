# TASK — B2a: Setup Wizard Foundation (Steps 1-2 + schema + NAICS + Sidebar/Dashboard integration)

**Status:** DRAFT — awaiting B1 completion
**Phase:** v2 Setup Wizard (split: B2a = foundation, B2b = Steps 3-6)
**Author:** Rusty (per Patrick's "build everything in the wireframes" call 2026-07-13 10:39 MDT)
**Date:** 2026-07-13 11:42 MDT
**Branch:** `main` (after B1 lands and pushes)

---

## Goal

Land the **first impression** of the v2 build (§5.10 user-flow rule: the wizard is what the user sees on day one, so it's what we build first). This is the **first half** of the Setup Wizard:

1. **Schema** — `businesses` table + `settings` table + accounts table constraint (`irs_line` required unless `is_system = 1`).
2. **Step 1 — Welcome** — full-screen explainer with Schedule C copy.
3. **Step 2 — Basic business info** (merged: Owner + Business identity + Tax IDs) with subheaders "About you" / "About your business".
4. **6A — NAICS lookup modal** — offline JSON-backed search-and-select picker.
5. **Sidebar/Dashboard integration** — Setup Wizard reachable from sidebar; Dashboard CTA to launch wizard if not completed; "Review Later" outstanding count badge plumbing (the badge itself lights up after B3 lands; for B2a, the wiring + UI shell exist but show 0).

The remaining Setup Wizard steps (3 Contact, 4 Accounting method, 5 Timeline, 6 Review & create + edit-on-review) ship in **B2b**. The Categories Wizard pair is **B3**.

This is a **medium build** (one new screen family, schema migration, modal, sidebar/Dashboard hooks). Per §5.11 cadence: demo within one cycle of Cinder reporting done.

---

## Background — read these files first

- `docs/books/setup-wizard/VIRTA_BOOKS_V2.md` — umbrella doc.
- `docs/books/setup-wizard/SETUP_AND_CATEGORIES.md` §4.1, §4.2, §4.3 (schema), §5.1 (Setup Wizard state machine), §5.3 (wizard persistence), §6 Step 1, §6 Step 2, §6A NAICS lookup.
- `docs/books/setup-wizard/WIREFRAMES.html` `renderSetup()` (line 313) for Steps 1-2 + `state.setup` object + the sticky-CTA pattern.
- `client/src/books/BooksShell.jsx` — the v2 5-link sidebar. The Setup Wizard link is currently in this nav but **gets removed in B2a per Patrick's 2026-07-13 14:01 MDT call** (wizard is a once-and-done flow, not a sidebar destination). See §6.1.
- `client/src/books/SetupWizard.jsx` — current stub. 856 bytes. Read it before writing.
- `client/src/books/Dashboard.jsx` — current stub. 873 bytes. Read it before writing.
- `client/src/books/api.js` — API client. Add methods as needed.
- `~/clawd/projects/process/ENGINEERING.md` §5.9, §5.10, §5.11.

---

## Part 1 — Schema migrations

### 1.1 `businesses` (NEW)

Per §4.1, exact schema:

```sql
CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  proprietor_name TEXT,
  business_name TEXT,
  trade_name TEXT,
  business_description TEXT,
  naics_code TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal TEXT,
  country TEXT DEFAULT 'US',
  ein TEXT,
  accounting_method TEXT NOT NULL DEFAULT 'cash',
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  business_started_on TEXT,
  business_type TEXT NOT NULL DEFAULT 'sole_proprietor',
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

Migration script location: `server/scripts/migrations/2026-07-13-b2a-businesses.sql` (follow whatever migration convention exists — check `server/scripts/` and `server/db.js` for the pattern).

Seed one row (id = `default_business`) so the rest of the app has a business to reference. **Or do not seed and let the wizard create the first row** — your call. Either is acceptable; the requirement is "after this migration, the app runs and the wizard can be launched." If you seed, the seed row has empty fields and the dashboard CTA is "Finish setup" not "Start setup."

### 1.2 `settings` (NEW)

Per §4.3:

```sql
CREATE TABLE settings (
  business_id TEXT NOT NULL REFERENCES businesses(id),
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (business_id, key)
);
```

Seed keys (when a business row exists):
- `show_account_numbers` = `'false'` (per Patrick's 2026-07-08 10:45 MDT feedback — opt-in, default off)
- `currency_display` = `'USD'`

### 1.3 `accounts` constraint

Per §4.2: `irs_line` becomes mandatory at insert time. Add a CHECK constraint:

```sql
ALTER TABLE accounts ADD CONSTRAINT irs_line_required
  CHECK (name != 'Review Later' OR irs_line IS NOT NULL);
```

If `name = 'Review Later'` is the only system account exempt, the constraint reads as: any non-Review-Later account must have an `irs_line`. Existing seeded accounts should already have `irs_line` populated (they were seeded with the default chart); if any are NULL, **one-time data migration** populates them with `'(unspecified)'` as a fallback and surfaces a warning in the categories list ("This account is missing its IRS line — fix in Settings"). Document any accounts that needed this fallback in `CINDER_REPORT_b2a.md` so Wren knows to verify.

### 1.4 Backups

Before any migration:
```bash
cp data/tasks.db data/tasks.db.backup-b2a-$(date +%s)
```
And `trash` the old backups only after Wren signoff (don't delete them yourself).

---

## Part 2 — Wizard state machine + persistence

### 2.1 State shape

Per §5.3. Setup wizard state lives in `localStorage` under `virta_books:wizard:setup:state`. Shape:

```js
{
  setupStep: 1,                    // current step (1-6)
  setup: {
    proprietor_name: '',
    business_name: '',
    trade_name: '',
    business_description: '',
    naics_code: '',
    naics_title: '',               // for display only, not persisted to server
    ein: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal: '',
    accounting_method: 'cash',
    fiscal_year_start_month: 1,
    business_started_on: '',
  },
  setupDirty: false,               // any field touched since step entry?
  setupCompletedAt: null,          // ISO timestamp; null = not completed
}
```

### 2.2 Persistence behavior

- On every state change, debounce-write to `localStorage` (250ms).
- On mount of the wizard page, hydrate from `localStorage`. If `setupCompletedAt` is set and the user is back at step 1, render "Welcome back — your setup is complete. [Restart] [Continue to Books]" instead of the welcome screen.
- Server-side final write: at the end of Step 6 (B2b), POST `/api/v1/books/businesses` with the full payload. Set `setupCompletedAt` on success. **B2a does not POST — that's B2b.**
- For B2a, the wizard supports Steps 1-2 with full persistence to `localStorage`. Steps 3-6 are placeholders that route to a "Coming in B2b" notice.

### 2.3 Skip behavior

Per §5.1 / §6:
- Step 1: no skip (intro).
- Step 2: skippable. Skip = all fields blank. "Skip" button label changes to "Revert to Defaults" if any field is dirty.

### 2.4 Wizard navigation UI

Use the existing wireframe chrome: progress dots + back/skip/save buttons + sticky CTA at the bottom. Match the BooksShell's dark-mode aesthetic — do NOT copy the wireframe's light-mode CSS literally; port the layout to Tailwind classes consistent with `BooksShell.jsx`.

---

## Part 3 — Step 1: Welcome

Per §6 Step 1. Full-screen modal-style page.

- **Headline:** "Let's set up your books."
- **Sub-headline:** "We'll ask for the same basic info that's on the Schedule C of your IRS Form 1040 — the tax form sole proprietors file. This makes year-end tax filing much easier."
- **Reassurance line:** "Most people finish in under 5 minutes. You can change anything later."
- **CTA:** "Get started →" (primary button). Click → `setupStep = 2`.

No preview bullets. No "Up next" hint. Keep focused.

The wireframe shows this as a centered card on the page. In our app, render as a centered card on `/books/setup` with the dark-theme background.

---

## Part 4 — Step 2: Basic business info (merged)

Per §6 Step 2. Two subheaders:

### 4.1 "About you" subheader

| Field | Type | Notes |
|---|---|---|
| Your name | text | Required to advance. Used in invoice header. |
| What does your business do? | textarea | Max 280 chars. Counter shown when > 200. |

### 4.2 "About your business" subheader

| Field | Type | Notes |
|---|---|---|
| Business name | text | Placeholder: "My Business Name" |
| Trade name | text | Optional. Helper: "Distinct from your business name, if you use one." |
| Industry code (NAICS) | NAICS picker | See Part 5. Optional. |
| EIN | text | Optional. Format hint shown as "00-0000000". Soft validation only — accept anything that looks like 9 digits, allow format-with-or-without-dashes. |

### 4.3 Field-level validation

- "Your name" required (visible validation error under the field on Save attempt).
- "Business name" not required (placeholder serves as default).
- "EIN" — soft format check. If non-empty and doesn't match `/^\d{2}-?\d{7}$/`, show inline warning "EIN format is XX-XXXXXXX" but don't block Save.
- Character counter on the description textarea: show "X/280" when X > 200, plain textarea when X ≤ 200.

### 4.4 Save & continue

Save wizard state to `localStorage`, then `setupStep = 3`. **For B2a, step 3 is a placeholder** — render a "Coming in B2b" card with a Back button. Do not implement Step 3 yet.

### 4.5 Skip

Clears all Step 2 fields in `state.setup`, advances to step 3. Label: "Skip (use all defaults)" until any field is touched, then "Revert to Defaults".

---

## Part 5 — NAICS lookup modal (§6A)

### 5.1 Bundled data

Cinder's job: download the full 2022 NAICS list and convert it to the shape the picker expects.

**Source:** the same `naics.csv` I downloaded to verify size — `https://raw.githubusercontent.com/BenDoyle/NAICS/master/naics.csv` (or equivalent mirror; verify license is permissive before committing). 2076 lines, 100KB. Full list bundled.

**Target file:** `client/src/assets/naics-2022.json`. Shape:

```json
[
  { "code": "111110", "title": "Soybean Farming", "sector": "11", "keywords": ["soybean", "farming", "agriculture"] },
  ...
]
```

The `keywords` array is the union of: the title's lowercased tokens, the `notes` field if present, and any additional index terms Cinder generates from the sector description. **Keep it simple** — just lowercase the title words and add any notes. No need to enrich with synonyms.

**Bundle size budget:** <200KB on disk (the CSV is 100KB; JSON with keywords will be ~150KB). Acceptable for offline use.

**Loader:** static `import` at build time, not a runtime fetch. The full list lives in client memory. Memory cost at runtime: ~150KB heap. Negligible.

### 5.2 Modal UX

Per §6A:
- Triggered by clicking the "Industry code (NAICS)" field in Step 2.
- Modal chrome: same as the Add Account modal from B1 (sticky footer, max-height 90vh, dark theme).
- **Search box** at top, autofocus. Type to filter by keyword (case-insensitive substring on title + keywords). 200ms debounce. Show "No matches" when zero results.
- **Sector filter** on the left side: 2-digit NAICS sectors. Default "All". Selecting a sector narrows results to that sector.
- **Result list** below search, scrollable. Each row shows 6-digit code + official title. Hover state; click → code is written to the field, modal closes.
- **Selected code display** at top of modal: when a code is already selected, show "Selected: 111110 Soybean Farming" with an "X" to clear.
- **Footer:** single "Cancel" button (no Save — selection closes the modal).

### 5.3 Sector list

The 2-digit NAICS sectors (20 of them). Hardcode in the modal component. From the CSV `level=2` rows:
11, 21, 22, 23, 31-33 (Manufacturing), 42, 44-45 (Retail), 48-49 (Transportation), 51, 52, 53, 54, 55, 56, 61, 62, 71, 72, 81, 92.

Display labels match official NAICS titles.

### 5.4 Validation

Selected NAICS code is stored as `naics_code` (6-digit string). No format check on save — just store whatever the user picked.

---

## Part 6 — Sidebar + Dashboard integration (the B7 merge)

### 6.1 Sidebar — Setup Wizard is NOT a permanent nav item

Per Patrick's call 2026-07-13 14:01 MDT: the Setup Wizard is a once-and-done flow, not a destination. It does **not** belong in the sidebar permanently.

**For B2a:**
- Remove the "🧙 Setup Wizard" link from `BooksShell.jsx` sidebar.
- The wizard is reachable via:
  - The first-run welcome card CTA ("Set up your books →") — State A in §6.2.
  - The Dashboard's "Continue setup →" CTA — State B in §6.3.
  - Settings → General → "Restart setup wizard" button (added in B5).
- `BooksShell.jsx` shows the standard 4-link nav: Dashboard, Categories, Transactions, Settings. Setup Wizard is gone from sidebar chrome.

**Long-term:** Patrick flagged that the Settings → "Restart wizard" affordance is also temporary. Once the full Books surface is built (B8+), this option goes away entirely. Track this as a v3 cleanup task. For now, keep it.

**Sidebar pill logic** (from the prior brief): N/A. The Setup Wizard isn't in the sidebar, so there's no pill.

### 6.2 First-run experience (per Patrick's call 2026-07-13 13:59 MDT)

Per Patrick's call: **if Virta Books has never been opened before, the user should land on a clean welcome page** that says something like "Welcome to Virta Books, click here to set up your books." No sidebar chrome, no Dashboard with status indicators — just a single centered welcome card.

This applies to the **landing page** (default route when navigating to `/books` for the first time). Three states:

**State A: First-run, never opened (`/api/v1/books/businesses/current` returns 404):**
- Full-page centered welcome card.
- Headline: "Welcome to Virta Books."
- Body: "Let's set up your books so you can start tracking your business."
- Primary CTA: "Set up your books →" → navigates to `/books/setup`.
- **No sidebar in this state.** The sidebar (Setup Wizard, Categories, Transactions, Settings, Dashboard) hides until setup is at least started. Reason: the wizard is the only valid action; showing nav links to other empty surfaces is confusing.
- Once the user clicks "Set up your books →" and starts the wizard, the sidebar appears for the rest of the session (and persists across sessions via setupCompletedAt).

**State B: Setup in progress (business exists, setupCompletedAt === null):**
- Standard sidebar appears (the user is mid-flow).
- Landing redirects to `/books/setup` (the wizard) instead of `/books` dashboard — clicking through nav can still reach Dashboard, but default landing is the wizard.
- If user has resume state in localStorage, the Setup Wizard Step 1 shows the "Resume setup" prompt (per B2b's resume pattern; if B2b hasn't landed yet, just resume at the saved step silently).

**State C: Setup complete (`setupCompletedAt !== null`):**
- Standard sidebar visible.
- Default landing is `/books` Dashboard with the existing "Welcome back" content.

**Implementation:**
- The Dashboard component (`Dashboard.jsx`) detects state from `GET /businesses/current`:
  - 404 → render the State A welcome card; do NOT render the sidebar in this case (sidebar visibility is controlled by BooksShell based on the same state).
  - 200 with `setupCompletedAt === null` → render the State B landing (redirect to wizard or show "Continue setup").
  - 200 with `setupCompletedAt !== null` → render the State C "Welcome back" content (existing behavior).
- BooksShell (`BooksShell.jsx`) fetches `GET /businesses/current` on mount. If 404, hide the sidebar nav and just render the welcome card. If 200, show the sidebar.
- The `/books` route renders Dashboard. The Dashboard component handles State A inline (full-page welcome), or redirects to `/books/setup` for State B.
- Don't break the existing `/books/transactions` etc. routes — sidebar visibility only affects the chrome around them.

**Why this matters:** the first-run experience is the user's first impression of Virta Books. If they land on a Dashboard with "⚠ Not started" status indicators and a small "Start setup →" button, it feels like a half-built app. A clean welcome card with one obvious action feels like a real product.

### 6.3 Dashboard (continued — when sidebar is visible)

When the sidebar IS visible (States B and C), the Dashboard renders conditional content based on setup state:

**If `setupCompletedAt === null`** (setup not done, mid-flow):
- Headline: "Welcome back, [proprietor_name or 'there']."
- Body: "Pick up your setup where you left off."
- Primary CTA: "Continue setup →" → navigates to `/books/setup`.

**If `setupCompletedAt !== null`** (setup done):
- Headline: "Welcome back, [business_name or 'there']."
- Body: "Your books are ready. What's next?"
- Three cards (placeholder for now, full content is Phase 11):
  - "Recent transactions" — empty state with link to Transactions.
  - "Categories to review" — empty state with link to Categories.
  - "Action needed" — empty state with link to Reconcile (Phase 9).

**Both states (B and C):**
- A small status bar at the top: "Setup [✓ Done / ⚠ Not started] · Categories [✓ Done / ⚠ Not started]" — Categories status lights up after B3 lands; for B2a show "⚠ Not started" always.

### 6.3 API endpoint

Create `GET /api/v1/books/businesses/current`:
- Returns `{ data: business }` if a business exists.
- Returns 404 with `{ error: 'No business configured', code: 'NOT_FOUND' }` if not.
- Implementation: simple lookup by id = `'default_business'` (or the seed convention you chose in Part 1).

This endpoint is also used by the Categories Management page in B1 to know whether to show a "Setup required" banner — but **B1 doesn't add that banner yet**. B2a just provides the endpoint.

---

## Part 7 — Files to touch / create

### Server

- `server/scripts/migrations/2026-07-13-b2a-businesses.sql` (or whatever the migration convention is) — schema + seed + accounts CHECK constraint.
- `server/routes/books/businesses.js` (new) — `GET /businesses/current`, `POST /businesses`, `PATCH /businesses/:id`.
- `server/routes/books/settings.js` (new) — `GET /settings`, `PUT /settings/:key` (key/value store).
- `server/services/businessService.js` (new) — business + settings CRUD with validation. Reuse the `booksApi` envelope (`{ data }` / `{ error, code }`).
- `server/index.js` — mount the new routers at `/api/v1/books/businesses` and `/api/v1/books/settings`.

### Client

- `client/src/books/SetupWizard.jsx` — full rewrite. Steps 1-2 with all the field validation, subheaders, sticky CTAs, progress dots, skip/revert behavior, wizard state machine.
- `client/src/books/Dashboard.jsx` — full rewrite. Conditional content based on setup state.
- `client/src/books/BooksShell.jsx` — small edit: add the "incomplete" pill logic + a `GET /businesses/current` call on mount.
- `client/src/books/SetupWizardNaicsModal.jsx` (new) — the NAICS picker modal.
- `client/src/assets/naics-2022.json` (new) — bundled NAICS list.
- `client/src/assets/naics-build.mjs` (new) — the script that converts the CSV to JSON. Document in a comment at the top of the file.
- `client/src/books/api.js` — add `getCurrentBusiness`, `getSettings`, `updateSetting`, `updateBusiness`.

### Don't break

- B1's Transactions page polish + Categories CRUD. Don't change `Transactions.jsx` or `Categories.jsx`.
- The wireframe smoke test (`docs/books/setup-wizard/tests/wf-smoke.mjs`) — must remain 255/255.
- Existing REST endpoints on `/api/v1/books/accounts` and `/api/v1/books/journal/entries`.
- Existing tables (`tasks`, `subtasks`, `events`, `categories`, `notes`, `projects`, `columns`, `calendar`, `gmail`, `attachments`) — schema migration only adds new tables + adds a CHECK constraint to `accounts`. Don't touch anything else.

---

## Build behaviors (Test coverage)

| Behavior ID | Name | Verifies |
|---|---|---|
| VB-SCHEMA-BIZ-01 | `businesses` table exists with all 17 columns per §4.1 | ✓ |
| VB-SCHEMA-SET-01 | `settings` table exists with composite PK (business_id, key) per §4.3 | ✓ |
| VB-SCHEMA-ACC-01 | `accounts` CHECK constraint prevents insert with NULL irs_line unless `name='Review Later'` | ✓ |
| VB-SCHEMA-IRS-01 | Existing accounts with NULL irs_line get `'unspecified'` fallback in one-time migration | ✓ |
| VB-WIZ-PERSIST-01 | Wizard state persists to localStorage on every change (debounced 250ms) | ✓ |
| VB-WIZ-PERSIST-02 | Wizard state hydrates from localStorage on mount | ✓ |
| VB-WIZ-STEP1-01 | Step 1 renders the Welcome headline + Schedule C sub-headline + CTA | ✓ |
| VB-WIZ-STEP1-02 | Step 1 CTA advances to step 2 | ✓ |
| VB-WIZ-STEP2-01 | Step 2 renders "About you" + "About your business" subheaders | ✓ |
| VB-WIZ-STEP2-02 | "Your name" required to advance; error message under field on attempt | ✓ |
| VB-WIZ-STEP2-03 | "EIN" soft-validates format; warning shown on bad input but doesn't block save | ✓ |
| VB-WIZ-STEP2-04 | Description textarea shows character counter when > 200 chars | ✓ |
| VB-WIZ-STEP2-05 | Skip button label changes to "Revert to Defaults" after any field touched | ✓ |
| VB-NAICS-MODAL-01 | NAICS modal opens from "Industry code (NAICS)" field click | ✓ |
| VB-NAICS-MODAL-02 | Search filters results by keyword (case-insensitive) | ✓ |
| VB-NAICS-MODAL-03 | Sector filter narrows results | ✓ |
| VB-NAICS-MODAL-04 | Clicking a result writes the code to the field and closes the modal | ✓ |
| VB-NAICS-MODAL-05 | Bundled JSON contains all 6-digit codes from 2022 NAICS list | ✓ |
| VB-API-BIZ-01 | `GET /businesses/current` returns the seeded business row | ✓ |
| VB-API-BIZ-02 | `GET /businesses/current` returns 404 when no business exists | ✓ |
| VB-API-SET-01 | `GET /settings` returns all settings for current business | ✓ |
| VB-API-SET-02 | `PUT /settings/:key` upserts a single setting | ✓ |
| VB-DASH-01 | Dashboard shows "Start setup →" CTA when setup not completed | ✓ |
| VB-DASH-02 | Dashboard shows "Welcome back" content when setup completed | ✓ |
| VB-SIDE-01 | Sidebar shows incomplete-state pill when setup not done | ✓ |

Add these IDs to your **Test coverage** section in `CINDER_REPORT_b2a.md`. Rusty folds into `docs/books/qa/QA.md` after Wren review.

---

## Definition of done

- [ ] All three schema migrations run cleanly (businesses, settings, accounts CHECK).
- [ ] Backup of `data/tasks.db` taken before migration, path noted in the report.
- [ ] NAICS JSON bundled with full 2022 list, loader works.
- [ ] Setup Wizard renders Steps 1 + 2 with all field validation.
- [ ] NAICS modal works end-to-end (search, filter, select).
- [ ] Sidebar pill logic works (state fetched from API).
- [ ] Dashboard conditional content works.
- [ ] `GET /businesses/current` + `GET /settings` + `PUT /settings/:key` endpoints live.
- [ ] All 26 behavior IDs in your Test coverage section.
- [ ] Demo recorded: `demos/2026.07.13-b2a-setup-wizard-foundation.mp4`. Walk through: wizard Step 1 → Step 2 → fill form → NAICS modal → Dashboard before/after.
- [ ] Committed in logical chunks (not one giant commit).
- [ ] Wren can review; Echo can run the behavior matrix.
- [ ] Light + dark mode visual check.

## Out of scope (deferred to B2b / B3+)

- Setup Wizard Steps 3-6 (Contact, Accounting method, Timeline, Review & create, edit-on-review)
- Categories Wizard (B3)
- The `POST /businesses` final write (B2b — at end of Step 6)
- "Review Later" badge actually showing a count (B3 — needs Categories Wizard to create Review Later)
- The actual Dashboard "Recent transactions" / "Categories to review" / "Action needed" cards (Phase 11 / B8+)
- Multi-business support (v3)
- Accrual accounting method exposure (v3)
- International address fields beyond `country = 'US'` (v3)

## When done

Push a completion event with:
- 2-3 line summary
- Commit hash(es) — local only
- Demo path
- Anything to flag for Wren (especially: NAICS bundling size, accounts migration fallout)
- Anything in the spec that turned out to be ambiguous

## Hard rules

- `trash` > `rm`. Backup the DB before any migration.
- No edits to B1's Transactions.jsx or Categories.jsx.
- No edits to the wireframe HTML, spec, or smoke test.
- No pushing to origin.
- No spawning sub-agents.
- Visual check in dark mode before declaring done.