# Virta Books — Setup Wizard & Categories Management Spec

**Owner:** Rusty
**Status:** Decisions locked 2026-07-07. **Round 2 applied 2026-07-08** (merged Owner + Business identity + Tax IDs into one step, alphabetical account numbering, NAICS lookup modal, edit-on-review pattern, asset/liability/equity subheaders, Welcome-screen Schedule C explainer). **Round 3 applied 2026-07-08** (stripped step 1, renamed Your Name, fixed step 6 UX). **Round 4 applied 2026-07-08** (Chantelle-specific placeholders removed; Categories wizard step 2 got Hide/Delete + sticky header + sortable columns + "show account numbers" wizard prompt; step 3 reordered (Sales first, Other Income last); step 4 unified to single Add Account button; Add modal got Type picker + Note field + relabeled "Tax Line Item (Schedule C of IRS Form 1040)"). **Round 5 applied 2026-07-08** (single-page Categories Management with search + 4 filter chips + Show hidden + new Settings → Categories subsection). **Round 6 applied 2026-07-08** (welcome uses checkbox not toggle; IRS Form 1040 introduced before Schedule C; step 2 cells got Edit + Hide + Delete with no inline rename + Category Name + Tax Description + Review Later moved fully off step 2 to step 5; "Skip" button became "Revert to Defaults" when state has changed; edit modal got a generic Notes field; Delete closure bug fixed; step 2 window taller; sticky-header rule confirmed global for in-wizard and management lists). **Round 15 applied 2026-07-09** (Phase 1 cleanup: spec dedupe of D29–D32/D43–D49, wireframe dead-code removal of `state.activeTab` + legacy `catFilter='revenue'/'ale'` router, smoke test updated for the D62 New-entry modal). **Round 16 applied 2026-07-09** (sidebar GL renamed to **Transactions** to match user expectation; GL functionality unchanged).
**Replaces:** Section 1 (Chart of Accounts) of `ACCOUNTING-v1.md` — keeps the rest of v1 intact.

---

## 1. Goals

A first-run experience that takes a non-accountant from "I just opened Books for the first time" to "I have a working, IRS-aligned chart of categories" in under five minutes, with a clear path back to edit anything they skipped.

Three rules drive everything below:

1. **Plain-English UI where possible, but Schedule C is the cross-reference.** Categories are called "Categories" in the UI; the database, code, and wire protocol use `accounts`. The Schedule C line number is a visible column on the categories list, not a hover or tooltip.
2. **Every category (except "Review Later") maps to a single Schedule C line.** Income categories map to Part I line 1. Expense categories map to a specific Part II line (lines 8–27). User picks the line freely, with one-line descriptors in the picker for context.
3. **Every wizard step is skippable except the two final review steps.** Default values are pre-filled. Skipping a step = accepting the default. "Review Later" is auto-created and is the only account that has no Schedule C mapping.

---

## 2. Scope

### In v1 (this spec)

- Company Setup Wizard — **6 screens** (Welcome + 5 form steps). Step 2 "Basic business info" merges what were steps 2/3/5 (Owner + Business identity + Tax IDs) into a single screen with "About you" and "About your business" subheaders.
- Categories Wizard — 6 steps (welcome, expense categories, income categories, asset/liability/equity, Review Later, review). The asset/liability/equity step renders with three subheaders (Cash & bank / Credit & loans / Equity).
- Categories management screen (post-wizard) — rename, add, delete-with-reassignment, merge
- **Default alphabetical sort** on all category tables (expenses, income, other). Account codes assigned in alphabetical order at seed time.
- **NAICS lookup modal** — search-by-keyword autocomplete, backed by an offline JSON snapshot bundled with the app (no network deps, no rate limits in v1).
- **Edit-on-review** — every row on the Review & create screen has a pencil icon that expands inline.
- Account numbering toggle in Settings (4-digit, on by default)
- Sidebar badge for "Review Later" outstanding count

### Out of v1 (backlog)

- Bulk triage screen for Review Later items
- Multi-entity support (schema field added, UI not exposed — see §11)
- Accrual accounting method (UI greyed out)
- Inventory / COGS accounts
- Strict validation on which Schedule C line an account can map to (currently permissive)
- Account sub-hierarchies / parent_id (schema field exists but is unused in UI)

---

## 3. Decisions locked

Decisions from the 2026-07-07 planning session, locked in:

| # | Decision |
|---|---|
| D1 | Cash-only for v1. Accrual shown in UI greyed-out with tooltip "Available in a future version." Default = Cash if step skipped. |
| D2 | UI uses "Categories" not "Chart of Accounts." Internal code/wire/DB stays `accounts` / `chart_of_accounts`. |
| D3 | Keep "Income" and "Expenses" labels (no dumbed-down renames). |
| D4 | Schedule C line number shown as a column on the categories list, not a hover/tooltip. |
| D5 | Every wizard step is skippable except the two review steps. |
| D6 | Pre-seeded categories based on Schedule C Part II; user can uncheck before continuing. Skipping = accept all defaults. |
| D7 | All steps default-filled. Skipping accepts the default. |
| D8 | User can create, name, rename any category freely. The only required field is the Schedule C line mapping. |
| D9 | "Review Later" is a normal account (Interpretation 1). Shows in expense totals. Has a sidebar badge count. No dedicated review screen in v1. |
| D10 | Schedule C line mapping is permissive — user can map any custom account to any line. Picker shows one-line descriptors for context. |
| D11 | Account renaming & Schedule C remapping both flow correctly through historical transactions (transactions are tied to the account, not the line/name). |
| D12 | Per-project rule from session: 6xxx for expense accounts. 4-digit numbers. Account numbering toggle in settings. |
| D13 | `business_type` enum exists in schema, only `sole_proprietor` exposed in v1. Other values reserved for v2. |
| D14 | EIN field optional. Skipping leaves it blank. |
| D15 | Setup Wizard step 2 "Basic business info" merges Owner + Business identity + Tax IDs into one screen. Two subheaders on desktop ("About you" / "About your business"), stacked on mobile. |
| D16 | Categories default sort = alphabetical by name (across the full list, not within subgroups). Account codes assigned in alphabetical order at seed time. No manual reorder UI in v1. |
| D17 | NAICS lookup is backed by an offline JSON snapshot (`server/src/books/data/naics-2022.json`). Search by keyword + filter by 2-digit sector. No live Census API call in v1. |
| D18 | Edit-on-review pattern: clicking a row's pencil opens an inline expand-in-place editor. Cancel = revert. Save = persist to wizard state and re-render the review row. |
| D19 | Welcome screen explains Schedule C ("we'll ask for the same basic info that's on IRS Form 1040 Schedule C, the tax form sole proprietors file") and previews the next wizard ("Up next: pre-fill your categories from Schedule C"). |
| D20 | Categories Wizard step 4 "Other accounts" renders with three subheaders: **Cash & bank accounts** / **Credit & loans** / **Equity**. Each subheader has its own table + "Add custom" button. (Property & equipment is a reserved subheader for v2 — schema includes it; not in v1 seed.) |
| D21 | Categories wizard step 2 (expense) and step 3 (income) tables render with **Hide** and **Delete** buttons on the right (no left-side checkboxes; "include by default" is the model). Header row is sticky. Each column header is clickable to sort; default alphabetical by name, ascending. The "Show account numbers" toggle is offered once on **Categories Wizard Step 1 (Welcome)**, not repeated per step — the choice cascades through all subsequent wizard screens. |
| D22 | Categories Wizard step 4 has a single top-of-step "Add account" button that opens the generic Add modal with a Type picker. No per-subheader Add buttons. |
| D23 | Default Income ordering: **Sales → Refunds & Returns → Other Income** (not alphabetical). Codes: 4000/4010/4020. Sales at 4000 because it's the primary inflow. "Other Income" last because it's the catch-all for refund/adjustment edge cases. |
| D24 | Add Account modal is generic — used by both wizard and management screens. Fields: **Type** (Expense / Asset / Liability / Equity / Income) + Name + Code + **Tax Line Item (Schedule C of IRS Form 1040)** + **Note**. Type picker changes which Schedule C line options are shown (expense → expense lines, income → income lines, others → no line). |
| D25 | Categories Management page is **single-page** (not tabbed). Above the table: search bar + 4 filter chips (**Show All / Expenses / Income / Assets-Liabilities-Equity**) + **Show hidden** toggle. Search matches name + code + descriptor (case-insensitive substring). Default chip = "Show All". Filter state persists in URL/query string (e.g. `?filter=expenses&q=rent`) so the user can bookmark or share. |
| D26 | "Show hidden" toggle on Categories Management: when **off** (default), hidden categories are filtered out of the view entirely. When **on**, hidden rows are included in the table and rendered with the same strikethrough/opacity-45 styling used in the wizard. Toggle state persists per session (no URL param). |
| D27 | **Settings → Categories** section is its own subsection of global settings. Controls: **Default sort** (radio: "Alphabetical by name" / "Alphabetical by code", default = by name) + **Show account numbers** (toggle, default OFF per D21 cascade). Selecting a new default sort updates the Categories Management table immediately and writes to `settings.category_default_sort` for persistence. |
| D28 | Categories Management table headers are clickable for sort (same pattern as wizard: `↑`/`↓`/`↕` indicators). Active sort overrides the Settings default until the user navigates away. |
| D29 | Wizard step 1 "Show 4-digit account numbers" preference uses a **checkbox** (not a toggle switch or radio) — clearer mental model. Same default (OFF) and behavior as D21. |
| D30 | Categories wizard rows show **no inline rename**. Editing a row's name happens only via the existing **Edit** modal (same one used in Categories Management). Each row therefore offers three actions: **Edit / Hide / Delete**, all in one cell. |
| D31 | Categories table column "Descriptor" is renamed to **"Tax Description"**. The cell shows the IRS descriptor of the mapped line (e.g. "Bookkeeper, accountant fees"). Not editable in the row — determined by the tax classification. For free-form user notes, use the new **Notes / Description** field in the Edit modal (separate from Tax Description). |
| D32 | "Review Later" system category does **not** appear in the Categories wizard step 2 (expense) table. It is created on step 5 with name **"Uncategorized Items Needing Review"** and code **9999**, with a brief explainer. Removing it from step 2 keeps the user-facing expense choices focused on real categories. |
| D33 | Wizard step-CTA "Skip (use all defaults)" becomes **"Revert to Defaults"** when the user has changed anything on that step (hide / delete / rename / add). Clicking restores the default seed for the current step's account list. Label reverts to "Skip (use all defaults)" when no changes are present. |
| D34 | Sticky header on categories tables is global: any list using `.cat-table` class (wizard steps 2/3/4/5 + management screen) gets `position: sticky; top: 0; z-index: 2` on its `<th>` cells. |
| D35 | Edit Account modal is generic (used in both wizard and management). Fields: **Name** + **Code** + **Tax Line Item (Schedule C of IRS Form 1040)** + **Type** + **Notes** (free text, separate from Tax Description). The Notes field is user-purpose text only. |
| D37 | Edit modal: Code field is visible **only when `show_account_numbers` is on** (same rule as the tables). When off, the Code field is hidden entirely — not just blank. |
| D38 | Edit modal: Type picker (Expense / Income / Asset / Liability / Equity) is always visible. **Locked** in wizard context to the calling step's type (step 2 → Expense; step 3 → Income; step 4 → the row's existing Asset/Liability/Equity). **Free** in Categories Management. Type selects which lines appear in the Tax Line Item dropdown (Expense → Part II; Income → Part I; Asset/Liability/Equity → empty/hidden). |
| D39 | Edit modal **Notes** field placeholder: "What is this category used for?" (e.g. "Dues paid to local trade association"). It is **not** stored for or surfaced in audit logs or Reports drill-downs — those rely on the tax line. |
| D40 | Categories wizard step 2/3/4 CTAs (Back / Skip-or-Revert / Save & continue) live **inside** the scrollable table container, sticky-bottom. No double scroll: the user scrolls the table; the buttons are always visible. Applies to steps 2, 3, 4 (not 5, which has no table). |
| D41 | All categories tables use `table-layout: fixed` with explicit `<colgroup>` per column: `code` ~80px when shown, `actions` ~140px, `name` and `tax_line` flexible (proportional). Editing a row's name no longer shifts the widths of other columns. |
| D42 | Sidebar: **single top-level "Categories" link** (not a "Categories" section with a child link, and not Income/Expenses/Other as separate sub-links). The click routes to the Categories Management page with `catFilter='all'` (Show All) as the default. The Review Later badge remains on the single Categories entry. |
| D43 | Step 5 (Review Later) shows the category with **name "Review Later"**. Description reads: "Review Later is a default expense bucket for when you can't confidently categorize a transaction. Once you have discovered the correct category, you can come back and move items to the right category any time." Row layout: name + description + status; no em-dashes anywhere in the row. |
| D44 | Step 6 (Final review) counts use `state.expenses/income/other.length` directly (no filtering on `e.on`, which is a round-2 leftover field). When the user hasn't changed anything, all counts show the default totals. |
| D45 | Sidebar Review Later badge is a **small circular number** in the corner (icon-style badge with `border-radius: 50%`, ~18px diameter, no fill). Distinct from the full-width "Expense accounts" pill in the management screen. |
| D46 | Add Account modal: Code field visible **only when `show_account_numbers` is on** — same rule as the Edit modal (D37). When account numbers are off, the Code field is removed entirely from the Add form. |
| D47 | Add Account modal: Type picker is **always free** (no wizard locking). User explicitly picks Expense / Income / Asset / Liability / Equity. Pushed rows land in the right array based on Type. |
| D48 | Wizard step 2/3/4 scroll window height is **viewport-relative**: `max-height: calc(100vh - 320px)` so the window fills available vertical space without forcing small viewports to scroll the outer page. |
| D49 | Settings page segmented by **top-of-page tabs** with three sections: **General** (business name, EIN, currency — all editable from settings), **Categories** (default sort, show account numbers), **Other** (everything else that was previously on the bare page: accounting method, fiscal year start, business type, run setup wizard again, etc.). Tabs persist via `state.settingsTab` (`'general' \| 'categories' \| 'other'`). |
| D50 | Categories Management table (single-page, outside the wizard): **"Transactions" column → "Balance"**. For **flow-based accounts** (Income, Expense) the cell shows **—** (they don't hold a balance, they accumulate). For **balance-based accounts** (Asset, Liability, Equity) the cell shows the current dollar balance, formatted with thousands separator and sign-aware minus (`−$1,234.56`). |
| D51 | v2 design principle (Patrick 2026-07-08 17:56 MDT): **non-accountant simplicity**. Every UI choice is evaluated through "would a non-accountant understand this without an explanation?" If yes, keep; if no, simplify, defer, or remove. Accounting correctness happens behind the scenes; the user sees plain English. |
| D52 | v2 has **no subtypes**. Schedule C line is the implicit categorization — reports group by Schedule C section (Part I / Part II / Part III). No new "subtype" field on accounts. |
| D53 | v2 has **no COGS accounts seeded**, and the accounts schema has **no COGS-specific column**. COGS is **out of v2 entirely** (it's a v3 candidate). The Schedule C Part III lines exist in the tax-line picker as informational only — picking one does NOT auto-create a COGS-flagged account. |
| D54 | Account type is **immutable after creation**. Once an account is created with type Expense, it stays Expense. To re-classify, the user creates a new account with the new type and reassigns transactions. The Edit modal does not offer a type-change option. |
| D55 | v2 account status uses **two flags only**: `is_hidden` (user-facing: hides the row from the default Categories Management view; toggle via Show hidden) and `is_system` (internal: locks system accounts like Review Later from edit/delete). The earlier proposed `is_active` is **dropped** — it would have meant nearly the same thing as `is_hidden` to a non-accountant user, and one flag is simpler than two. |
| D56 | **No explicit year-end close in v2.** Net income/loss automatically flows into Equity (Retained Earnings) when reports run — the user never sees a "close fiscal year" button. Accounting is correct; the UI is invisible. |
| D57 | v2 chart-of-accounts code ranges (locked, internal — not exposed in UI by default): **1xxx** Assets, **2xxx** Liabilities, **3xxx** Equity, **4xxx** Income (4000 Sales, 4010 Refunds & Returns, 4020 Other Income per D23), **5xxx** Reserved (future COGS), **6xxx** Expenses (alphabetical per D16, 6999 = Review Later per D32), **9xxx** System (9999 = Review Later per D32). 5xxx range exists for forward-compatibility only — no v2 accounts use it. |
| D58 | v2 wizard Add/Edit modal exposes **only the user-relevant fields**: Name + Code (if `show_account_numbers` is on, per D37/D46) + Tax Line Item (Schedule C of IRS Form 1040) + Note. Type is **always visible** (per D38/D47) but locked to the caller's context in the wizard. Normal balance, closing behavior, and code-range logic are **schema-only** — not surfaced in any UI text. |
| D59 | General Ledger table columns (Patrick 2026-07-08): Date, Type, Name (vendor/customer), Amount, Description, Category, **Matched with** (plain-English label for the other side of the balanced entry), and reconciliation status. The main all-up General Ledger does **not** show Balance. Balance is reserved for future filtered views: when viewing a balance-sheet account's ledger from the Chart of Accounts, or when the GL is filtered to a balance-sheet account. In those filtered views, Balance is a number-only as-of-this-transaction account balance. Category / Matched with show `Code-Category` only when account numbers are enabled (e.g., `6010-Wages`); otherwise just the category name. Reconciliation status has three placeholder states for now: empty, In progress, Reconciled. Final reconciliation semantics wait for Phase 9. |
| D60 | System categories (currently **Review Later**) do not show Edit, Delete, Hide, or **Merge and Delete** row actions. Their action cell shows **System** only. **Merge and Delete** is no longer a row-level action; it lives inside the Edit category modal for normal categories. The explainer must say that transactions move to the destination category, then the source category is deleted. |
| D61 | **New manual entry** opens a manual journal entry modal, but the UI avoids debit/credit language. Fields: Date, Name (optional), Amount, Description, Category, **Matched with**, and Notes. Helper copy explains that Virta creates the balanced ledger entry behind the scenes. Footer actions: Cancel, Save draft, Post entry. *(Superseded by D62-D66 below for v2: the form fields, sign convention, label rule, save behavior, and audit policy are all re-locked there.)* |
| D62 | v2 manual-entry form (button text: **New entry**) has three fields: **Account** + **Change** + **Other account**. **No type picker, no debit/credit picker, no drafts.** The Account picker lets the user choose any account; the Other account picker lets the user choose any account (defaults to the user's default cash account from Setup Wizard, can be overridden). Date, Description, and Notes are also captured (from D61). |
| D63 | Sign convention in the manual-entry form is consistent across all account types: **positive = the picked Account went up; negative = the picked Account went down.** The system silently translates the sign into the correct debit/credit based on each account's normal balance (Asset/Expense normal debit → positive means debit; Liability/Equity/Income normal credit → positive means credit). User never sees debit/credit language. The Other account row receives the opposite sign with the same magnitude. |
| D64 | The Change field's label varies subtly based on the picked Account's type, to guide the lay user toward the right sign: **Expense** → "Amount"; **Income** → "Amount"; **Asset** → "Change in balance"; **Liability** → "Change in balance"; **Equity** → "Change". The label is read from the Account's type — no separate type picker needed. |
| D65 | Manual-entry form has a single **Save** button (no Save draft / Post entry split per D61). On save, the entry posts to the GL immediately, becomes visible everywhere (reports, dashboard), and is included in all balance/total calculations from that moment. Reconciliation status starts as empty (finalized when Phase 9 lands). |
| D66 | Every manual entry writes an audit row (per the locked v2 audit-log spec): `event: created`, with the full posting detail in the before/after field (before = nothing, after = the new balanced GL row). Edits and deletes on manual entries are also audited. |
| D67 | v2 Categories Management filter chip and active page heading say **Income** (not "Revenue"). All other category-related copy uses "Income." |
| D68 | v2 sidebar shows the General Ledger as a single top-level **Transactions** link. The underlying table is the General Ledger (D59 columns), but the user-facing nav label is "Transactions" — simpler than "General Ledger" for non-accountants, and consistent with the rest of the world (banks, QuickBooks, Xero). Internally (`renderLedger()`, `data-screen="transactions"`), the page is still the GL; only the user-visible name changed. |

---

## 4. Data model

### 4.1 `businesses` (NEW table — replaces the implicit single-tenant assumption)

```sql
CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  proprietor_name TEXT,                          -- legal name of the sole proprietor
  business_name TEXT,                            -- trade name shown on invoices
  trade_name TEXT,                               -- optional, distinct from business_name
  business_description TEXT,                     -- Schedule C field A
  naics_code TEXT,                               -- Schedule C field B, optional
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal TEXT,
  country TEXT DEFAULT 'US',
  ein TEXT,                                      -- optional
  accounting_method TEXT NOT NULL DEFAULT 'cash',  -- 'cash' | 'accrual' (accrual not exposed in v1)
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1, -- 1 = January
  business_started_on TEXT,                      -- ISO date, Schedule C field J
  business_type TEXT NOT NULL DEFAULT 'sole_proprietor',  -- only one exposed in v1
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 4.2 `accounts` (updated)

The existing `accounts` table stays. Two changes:

1. `irs_line` becomes mandatory at insert time (was nullable in v1 spec for edge cases). Enforced at the wizard + categories-management UI layer. Old rows with NULL are grandfathered with a one-time migration: if NULL, populate from a default heuristic or surface a "this account needs a line" warning on the categories list.
2. New optional column: `short_id` (TEXT) — used as a stable alternative to `code` for the account-number toggle. When account numbering is toggled off in settings, the UI hides `code` and shows `name` only. `code` stays present in the DB regardless.
3. New columns per Phase 1 design (2026-07-08, see §10A): `is_hidden` (BOOLEAN DEFAULT 0, user-facing), `is_system` (BOOLEAN DEFAULT 0, internal, locks Review Later from delete/type-change). `type` is immutable after insert (enforced at application layer — no UI path to change it, per D54). No `is_active`, no `subtype`, no COGS-specific column (per D52/D53/D55).

```sql
-- Existing schema, with the constraint added:
ALTER TABLE accounts ADD CONSTRAINT irs_line_required
  CHECK (name != 'Review Later' OR irs_line IS NOT NULL);
```

(Or equivalent enforcement in the application layer — flag during review.)

### 4.3 `settings` (NEW table — per-business user preferences)

```sql
CREATE TABLE settings (
  business_id TEXT NOT NULL REFERENCES businesses(id),
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (business_id, key)
);
-- Seeded keys:
--   'show_account_numbers'  → 'true' | 'false'   (default 'true')
--   'currency_display'      → 'USD'
```

---

## 5. Wizard state machine

Both wizards (Setup and Categories) are linear step machines backed by a single JSON state blob stored in `localStorage` (so a refresh doesn't lose progress) and saved to `businesses` / `accounts` on completion.

### 5.1 Setup Wizard

**6 screens total** (Welcome + 5 form steps).

| Step | Name | Skippable? | Default if skipped |
|---|---|---|---|
| 1 | Welcome | — (intro screen) | n/a |
| 2 | Basic business info (Owner + Business identity + Tax IDs merged) | Yes | empty |
| 3 | Contact (address) | Yes | empty |
| 4 | Accounting method | Yes (skip = Cash) | Cash |
| 5 | Timeline (FY start + business start date) | Yes | FY=Jan, start=undefined |
| 6 | Review & create | No | — |

Final step submits the `businesses` row, then chains to the Categories Wizard (auto-launches).

### 5.2 Categories Wizard

| Step | Name | Skippable? | Default if skipped |
|---|---|---|---|
| 1 | Welcome explainer | — | n/a |
| 2 | Expense categories (pre-seeded list, toggle on/off) | Yes | all on |
| 3 | Income categories (pre-seeded list) | Yes | all on |
| 4 | Asset / Liability / Equity accounts | Yes | all on |
| 5 | Review Later | No (auto-created) | always created |
| 6 | Final review | No | — |

Final step writes to `accounts`. Dashboard becomes available.

### 5.3 Wizard persistence

- All wizard state held in `localStorage` under key `virta_books:wizard:{wizard_name}:state`.
- Each step has a "Save & continue" + "Skip" + "Back" trio.
- Browser refresh recovers from `localStorage` and resumes at last step.
- Server-side, the setup wizard writes one `businesses` row at completion. The categories wizard writes many `accounts` rows at completion.
- Mid-wizard close: state preserved for 30 days, then cleared.

---

## 6. Setup Wizard — step-by-step

### Step 1: Welcome

Full-screen modal-style page. Headline: "Let's set up your books." Sub-headline explains Schedule C plainly: **"We'll ask for the same basic info that's on the Schedule C of your IRS Form 1040 — the tax form sole proprietors file. This makes year-end tax filing much easier."** Below: **"Most people finish in under 5 minutes. You can change anything later."**

Single CTA: "Get started."

(No preview bullets and no "Up next" hint on this screen — keep it focused on the Schedule C explainer and the time/length reassurance. Future-screen previews belong only when they reduce ambiguity, not add it.)

### Step 2: Basic business info (merged)

This step replaces the old Steps 2 (Owner), 3 (Business identity), and 5 (Tax IDs). Two subheaders on desktop (stacked on mobile):

**About you**

| Field | Type | Notes |
|---|---|---|
| Your name | text | The legal name on your tax return. Used in invoice header. |
| What does your business do? | textarea | Max 280 chars. |

**About your business**

| Field | Type | Notes |
|---|---|---|
| Business name | text | Trade name. Default placeholder: "My Business Name" |
| Trade name | text | Optional. Distinct from `business_name`. |
| Industry code (NAICS) | NAICS picker | See §6A. Search-by-keyword modal backed by offline JSON. |
| EIN | text | Optional. Format hint: "00-0000000". Skipping = blank. |

Skip behavior: all fields blank.

### Step 3: Contact

| Field | Type | Notes |
|---|---|---|
| Street address | text | |
| Street address 2 | text | optional |
| City | text | |
| State | text | dropdown, US states |
| ZIP | text | |

### Step 4: Accounting method

| Field | Type | Notes |
|---|---|---|
| Accounting method | radio | Cash (selected), Accrual (greyed out with tooltip "Available in a future version") |

Helper text: "Most sole proprietorships use cash accounting — recording money when it actually moves. You can change this later in Settings, but it affects how every transaction is recorded."

Skip behavior: defaults to Cash.

### Step 5: Timeline

| Field | Type | Notes |
|---|---|---|
| Fiscal year starts | dropdown (month) | Default January. Helper text: "Most small businesses use the calendar year (Jan 1 – Dec 31). If you track your finances on a different cycle, change it here." |
| When did your business start? | date | Optional. |

### Step 6: Review & create

Two-column review of everything entered. **Every row has a pencil icon on the right side.** Clicking the pencil expands the row inline; the field editors render in place, with "Save" + "Cancel" buttons. Save persists to wizard state and re-renders the row.

Skipped items show as "—" (italic, muted) — also editable.

Two CTAs at bottom:

- "Back" (returns to step 5)
- "Save & continue to Categories →" (writes `businesses` row, launches Categories Wizard)

### 6A. NAICS lookup (used in step 2)

The Industry code (NAICS) field in step 2 is a search-and-select picker, not a plain text input. Click the field → modal opens with:

- **Search box** at top (autofocus). Type to filter by keyword (e.g. "quilting", "photography", "consulting"). Matches against official NAICS titles + index terms.
- **Sector filter** on the left (2-digit NAICS sectors, e.g. 31–33 Manufacturing, 44–45 Retail, 54 Professional Services).
- **Result list** below search. Each row: 6-digit code + official title. Click a row → code is written to the field, modal closes.

Backing data: a bundled offline JSON snapshot at `server/src/books/data/naics-2022.json` (Census Bureau 2022 NAICS release). Schema: `[{ code, title, sector, keywords: string[] }, ...]` for all ~1,000 6-digit codes. Total file size ~120KB gzipped, no network round-trip. Out of v1: live Census API or "I don't know — skip" bulk assign.

"Why is this on a tax app?" — NAICS is a tax-form data point. It's not validated at submit time, just stored. If the user doesn't know it, the field stays empty (already optional).

---

## 7. Categories Wizard — step-by-step

### Step 1: Welcome explainer

Headline: "Set up your categories." Body explains that categories = "the buckets your money gets sorted into" and that they're pre-seeded based on Schedule C. "You can rename, remove, or add any of them."

**Display preference** (lives on this screen, not repeated per step):

```
Show 4-digit account numbers   ◯ on/off      (default: OFF)

[helper text] Some accountants and business owners like to track their accounts with account numbers. We'll show codes like 6000 Advertising next to each category when this is on. You can change this anytime in Settings → Categories.
```

This single toggle cascades through every subsequent categories screen in the wizard (steps 2, 3, 4) and writes to `settings.show_account_numbers` immediately. No per-step repetition. (Reverse decision note: this used to be per-step; moved to Step 1 to centralize the preference. See daily note 2026-07-08 ~10:42 MDT.)

CTA: "Next."

### Step 2: Expense categories

**Layout:**

```
[ + Add expense category                ]   ← top button (above table)

┌───────────────────────────────────────────────────────────────┐
│ Name ↑  │ Code │ Tax line │ Descriptor  │         │          │ ← sticky header
├─────────┼──────┼──────────┼─────────────┼─────────┼──────────┤
│ Account │ 6000 │ Line 16b │ Bookkeeper… │ Hide    │ Delete   │
│ Advert. │ 6010 │ Line 8   │ Ads, mktg…  │ Hide    │ Delete   │
│ …       │ …    │ …        │ …           │ …       │ …        │
└───────────────────────────────────────────────────────────────┘
```

**Behavior:**

- All pre-seeded expenses are included by default (no left-side checkboxes). To exclude, click **Hide**. To remove from this session entirely, click **Delete** (confirmation modal).
- Each column header is clickable to sort. Default sort: Name, ascending (alphabetical). Active column shows ↑ or ↓; other columns show ↕.
- Header row is sticky during vertical scroll.
- "Show account numbers" toggle was set on **Step 1 (Welcome)** and cascades here — no per-step toggle on this screen. Default: OFF (per Patrick's 2026-07-08 10:45 MDT feedback — frame as opt-in, not opt-out).
- Row-level Name editable inline by clicking the name cell.
- Row-level Tax line: badge-style display, click to open a popover with the IRS descriptor + ability to change.
- "+ Add expense category" button is at the top of the step (single button, not "Add custom expense category"). Click → opens the generic Add Account modal (§8.2) pre-set to Type = Expense.

**Skip behavior:** skipping = all defaults included (i.e. user adds nothing, hides nothing, deletes nothing). To skip cleanly with no interaction, click "Skip (use all defaults)".

### Step 3: Income categories

Same layout as step 2 (Hide/Delete on the right, sticky header, sortable columns). Account-numbers toggle was set on Step 1. Single "+ Add income category" button at the top.

**Default ordering (intentional, not alphabetical — exception to D16):**

- **#1 — 4000 Sales** (mapped to Part I line 1 — the primary inflow)
- **#2 — 4010 Refunds & Returns** (mapped to Part I line 7)
- **#3 — 4020 Other Income** (mapped to Part I line 1, secondary)

Rationale: Sales is the user-facing main account and gets the lowest number. Other Income is a catch-all and is last. Spec §13 locks this — CW-007 exception for the income list (alphabetical default applies only to expenses + other).

### Step 4: Asset / Liability / Equity (with subheaders)

**Layout:**

```
[ + Add account                         ]   ← single button at top, opens generic Add modal with Type picker

Cash & bank accounts (3)
  ┌──────────┬──────┬───────┬─────────┬──────┐
  │ Name ↑   │ Code │ Type  │         │      │   ← sticky header
  ├──────────┼──────┼───────┼─────────┼──────┤
  │ Checking │ 1010 │ Asset │ Hide    │ Del  │
  │ Savings  │ 1020 │ Asset │ Hide    │ Del  │
  │ …        │ …    │ …     │ …       │ …    │
  └──────────┴──────┴───────┴─────────┴──────┘

Credit & loans (2)
  ┌──────────┬──────┬──────────┬─────────┬──────┐
  │ Name ↑   │ Code │ Type     │         │      │
  ...

Equity (3)
  ┌──────────┬──────┬───────┬─────────┬──────┐
  │ Name ↑   │ Code │ Type  │         │      │
  ...
```

**Behavior:**

- One "Add account" button for the whole step (no per-subheader Add buttons). Click → opens generic Add Account modal (§8.2) with Type picker pre-focused.
- Each subheader has its own table — accounts don't get mixed across types.
- Hide/Delete + sticky header + sortable columns — same patterns as steps 2 and 3. Account-numbers toggle was set on Step 1.
- All defaults pre-included. Skip = accept all defaults.

### Step 5: Review Later

Auto-creates a single expense account:
- Number: 6999
- Name: "Review Later" (system category; user cannot rename/delete/merge)
- Type: Expense
- Schedule C line: **none** (the only account with no mapping)
- Sidebar badge will show pending count once transactions exist

Brief explainer on the screen: "Anything the auto-categorizer isn't sure about goes here. You can move items to the right category any time."

CTA: "Next."

### Step 6: Final review

Three collapsible sections (Income / Expenses / Other) with summary counts and names. Two CTAs:

- "Back"
- "Finish setup →"

Finish writes all `accounts` rows and routes to the dashboard.

---

## 8. Categories Management — post-wizard

Once the wizard is complete, the user can manage categories from a permanent screen: **Settings → Categories** (or sidebar link).

### 8.1 List view (single-page)

A **single page**, not tabbed. Top of the page has a toolbar with controls; below that is one unified table containing all categories that pass the current filters.

**Toolbar layout:**

```
[ 🔍 Search categories...                          ]   ← text input, debounced 150ms
( ) Show All  ( ) Expenses  ( ) Income  ( ) A/L/E   ← filter chips; default = Show All
                                                                 [Show hidden]   ← toggle; default off

(typography legend above the table for clarity)
```

**Behavior:**

- **Search bar** — case-insensitive substring match across Name, Code, and Descriptor (Schedule C line description). Empty = match all.
- **Filter chips** — 4 mutually exclusive values. Default = `Show All`. Selecting a chip filters the table to rows with that `account_type`:
  - `Show All` → every type visible
  - `Expenses` → Expense accounts only
  - `Income` → Income accounts only
  - `Assets/Liabilities/Equity` → Asset + Liability + Equity accounts
- **Show hidden toggle** — default OFF. When OFF, hidden rows are completely filtered out. When ON, hidden rows appear in the table with the same strikethrough + opacity-45 styling used in the wizard (so the user can re-decide).
- Filter state + search query + show-hidden state are reflected in the URL: `?filter=expenses&q=rent&hidden=1`. Bookmarking, sharing, and back-button all preserve state.

**Unified table** — one table for everything that matches the filters. Schema:

| Name ↑↓ | Code ↑↓ | Type | Tax line | Transactions | ⋯ |

- **Sortable headers** — `↑` / `↓` / `↕` indicators. Default sort = the value from Settings → Categories (per D27). Until the user clicks a header, the table follows that default. First click on a header takes over with ascending, second click toggles descending, click on a different header resets to ascending.
- **Type column** — for income rows: "Income"; for expense rows: "Expense"; for other: "Asset" / "Liability" / "Equity" (the row's actual type, not a grouping). All four use the same plain-text styling — no pill/badge styling for Balance Sheet types, which would only make sense to accountants (non-accountant simplification per D51).
- Tax line — badge (Line 8 / Line 16b / Part I line 1 / etc.) for income + expense; "—" for asset/liability/equity.
- Transactions column — count of journal entries referencing this account. Click → navigates to Reports → Transactions filtered to that account.
- ⋯ menu:
  - Edit (rename, change code, change Schedule C line)
  - Hide / Show (toggles `is_hidden`; reversible)
  - Delete (blocked if transactions reference — see §8.3)
  - Merge and Delete… (inside Edit modal; pick destination account — see §8.4)

### 8.2 Add account modal (generic, used everywhere)

The Add Account modal is generic — used by both the wizards (steps 2, 3, and 4) and the management screen. Fields:

| Field | Type | Required? | Notes |
|---|---|---|---|
| Type | dropdown | Yes | Expense / Asset / Liability / Equity / Income. Default in wizard: the step's type. Default in management: Expense. |
| Name | text | Yes | |
| Code | text | Yes (auto-suggested) | Auto-incremented from the highest existing code in the same type group. User can override. |
| Tax Line Item (Schedule C of IRS Form 1040) | picker | Yes if Type = Expense or Income; noop otherwise | Picker shows IRS line numbers + descriptors. For Expense: ~20 lines from Part II. For Income: 2 lines from Part I. For Asset/Liability/Equity: not applicable, picker hidden or disabled. |
| Note | text | No | Free-form. Used in audit logs and Reports → Transactions drill-down. |

**Buttons:** Cancel / Save. Save persists to `accounts` if in management; pushes into wizard state if in a wizard. In wizards, the new account is pre-selected (included by default) so the user finishes setup with their addition included.

**Validation:**
- Type must be selected
- Name required
- Code must be a 4-digit number; warn (not block) if not in the conventional range for the type (6xxx for expense, 4xxx for income, 1xxx for asset, 2xxx for liability, 3xxx for equity).

### 8.3 Delete flow

If `transactions.account_id` references the account → modal:
> "**[N] transactions** are categorized to this account. Move them to another account first, then delete."
> [Pick destination account] [Cancel]

Once reassigned (or if no transactions), delete confirms and runs.

### 8.4 Merge and Delete flow

Pick source + destination. Same `account_type` required. Modal:
> "All transactions on **[source]** will be moved to the destination category, then **[source]** will be deleted. Same account type required. This can't be undone."
> [Merge and Delete] [Cancel]

Single SQL transaction: re-points journal lines + transactions, deletes source.

### 8.5 Schedule C remap

If user edits a category's Schedule C line on a category with existing transactions:
- Inline confirmation: "Changing the Schedule C line affects how this category's transactions appear on tax exports. Continue?"
- Yes → line updated, all historical transactions rerouted in any aggregate view (they live on the account, not the line)

### 8.6 Categories Settings (subsection of global Settings)

A dedicated subsection in the global Settings screen, reached via the sidebar link "Settings → Categories" or via the "Manage categories" entry point on the dashboard.

**Controls:**

```
Categories                                    [Open categories page →]
Default categories page behavior.

Default sort
  ( ) Alphabetical by name          (default — what D16 establishes)
  ( ) Alphabetical by code

Show 4-digit account numbers
  [○ ◯]
  Some accountants and business owners like to track their accounts with account numbers.
```

**Field-level behavior:**

- **Default sort** — radio. Two values: "Alphabetical by name" (default, writes to `settings.category_default_sort = 'name'`) or "Alphabetical by code" (writes `='code'`). Selection immediately re-sorts the Categories Management table if the user has it open in another tab. Persists across sessions.
- **Show account numbers** — toggle (default OFF, per D21). Same setting as the wizard's Step 1 toggle — the value is shared via `settings.show_account_numbers`. Toggling here updates the wizard view in the same session.
- **[Open categories page →]** button — navigates to the Categories Management screen (§8.1).

### 8.7 Rename flow

Same as v1 spec: rename is cosmetic, no confirmation needed. Transactions stay.

---

## 9. Sidebar + Dashboard integration

### Sidebar

Once setup is complete, the sidebar shows:

```
🏠 Dashboard
🧾 Invoices
💸 Transactions
📁 Categories          ← rename target (no longer "Chart of Accounts")
   • Income (4)
   • Expenses (18)      ← "Review Later · 3" badge if > 0
   • Other (7)
⚙️ Settings
```

### Dashboard

Post-setup, the dashboard shows:
- Income KPIs (YTD revenue, accounts receivable, etc.)
- Expense KPIs (YTD expenses, top 5 categories)
- Review Later count as a prominent clickable tile

### Settings → Categories

Single page hosts the management UI per §8.

---

## 10. Default seeded categories

**Sort order = alphabetical by name, ascending.** Codes assigned in alphabetical order. Review Later is system, pinned to top of expense list (and skipped in the alphabetical numbering — it gets 6999, the catch-all at the end of the 6xxx range).

### Expenses (23 default, alphabetical)

| # | Code | Name | Schedule C line | Descriptor |
|---|---|---|---|---|
| 1 | 6000 | Accounting | Line 16b | Bookkeeper, accountant fees |
| 2 | 6010 | Advertising | Line 8 | Ads, marketing, promotions |
| 3 | 6020 | Car & Truck | Line 9 | Car and truck expenses for business |
| 4 | 6030 | Commissions | Line 10 | Commissions paid to non-employees |
| 5 | 6040 | Contract Labor | Line 11 | Payments to independent contractors |
| 6 | 6050 | Depletion | Line 12 | Depletion of natural resources (rare) |
| 7 | 6060 | Depreciation | Line 13 | Depreciation of business assets |
| 8 | 6070 | Insurance | Line 14 | Business liability, vehicle, etc. |
| 9 | 6080 | Interest | Line 15b | Other business interest |
| 10 | 6090 | Legal & Professional | Line 16a | Lawyer, consultant fees |
| 11 | 6100 | Meals | Line 24b | Business meals (50% deductible) |
| 12 | 6110 | Mortgage Interest | Line 15a | Mortgage on business property |
| 13 | 6120 | Office Expense | Line 17 | Office supplies, small equipment |
| 14 | 6130 | Phone | Line 25b | Business phone / mobile |
| 15 | 6140 | Rent | Line 19 | Rent or lease on business property |
| 16 | 6150 | Repairs & Maintenance | Line 20a | Repairs to business property/equipment |
| 17 | 6160 | Retirement | Line 18 | Pension / profit-sharing / SEP-IRA |
| 18 | 6170 | Supplies | Line 20b | Materials and supplies |
| 19 | 6180 | Taxes & Licenses | Line 21 | Business taxes, licenses, permits |
| 20 | 6190 | Travel | Line 24a | Business travel away from home |
| 21 | 6200 | Utilities | Line 25a | Electric, water, gas for business |
| 22 | 6210 | Wages | Line 26 | Wages to employees |
| 23 | 6999 | Review Later | _(none)_ | System bucket for low-confidence categorization (pinned to top) |

(23 entries, including Review Later. "Car & Truck" replaces the old "Vehicle" name to match the IRS descriptor exactly. Some Schedule C lines — 22, 23 non-deductible meals, 27a catchall, 28 COGS, 29 utilities bundled, 30 home office — are intentionally *not* pre-seeded. Users can add them via the "Add custom" path if needed.)

### Income (3 default, intentional order — exception to D16)

| Code | Name | Schedule C line |
|---|---|---|
| 4000 | Sales | Part I line 1 |
| 4010 | Refunds & Returns | Part I line 7 |
| 4020 | Other Income | Part I line 1 |

### Assets / Liabilities / Equity (8 default, alphabetical within each subheader)

**Cash & bank accounts**

| Code | Name | Type |
|---|---|---|
| 1010 | Business Checking | Asset |
| 1020 | Business Savings | Asset |
| 1100 | Cash on Hand | Asset |

**Credit & loans**

| Code | Name | Type |
|---|---|---|
| 2000 | Business Credit Card | Liability |
| 2100 | Loans Payable | Liability |

**Equity**

| Code | Name | Type |
|---|---|---|
| 3000 | Owner Contributions | Equity |
| 3010 | Owner Draws | Equity |
| 3020 | Owner's Equity | Equity |

(Code space 1000–1099 reserved for "Property & equipment" subheader in v2; 8 accounts total in v1 across 3 subheaders.)

---

## 10A. Chart of Accounts — formal schema

This section captures the accounting logic that runs **behind the UI** so Phase 2 (GL architecture) and Phase 13 (Reports) have a stable foundation. The user never sees most of this — it's documented here so we don't reinvent it during build.

### 10A.1 Account types, normal balances, and closing behavior (D52, D56)

| Type | Normal balance | Closes to | UI label |
|---|---|---|---|
| **Asset** | Debit | Never (permanent) | "Asset" |
| **Liability** | Credit | Never (permanent) | "Liability" |
| **Equity** | Credit | Never (permanent) | "Equity" |
| **Income** | Credit | Auto-flows into Equity (Retained Earnings) when reports run (D56) | "Income" |
| **Expense** | Debit | Auto-flows into Equity (Retained Earnings) when reports run (D56) | "Expense" |

**No explicit year-end close in v2 (D56).** The user does not see a "Close fiscal year" button anywhere. Net P&L flows into Equity automatically when reports run — accounting is correct, the ceremony is invisible.

### 10A.2 No subtypes (D52)

Schedule C line is the implicit categorization. Reports group by Schedule C section (Part I for Income, Part II for Expenses, Part III reserved for future COGS). No new "subtype" field on accounts.

### 10A.3 No COGS in v2 (D53)

- No COGS accounts are seeded.
- The accounts schema has no COGS-specific column.
- Schedule C Part III lines exist in the tax-line picker as **informational only** — picking one does NOT auto-create a COGS-flagged account. The wizard's UI treats it the same as any other Expense category.
- COGS is a **v3 candidate** (parked in the Virta Books v3 candidates card).

### 10A.4 Code ranges (D57, internal)

Codes are **never shown to the user by default**. They are stored in the DB and surface only when `settings.show_account_numbers` is on (default OFF per D27).

| Range | Type | Notes |
|---|---|---|
| 1xxx | Assets | 1000–1099 Cash & bank, 1100–1199 A/R, 1200–1299 Other current, 1300+ Property/equipment |
| 2xxx | Liabilities | 2000–2099 Credit cards, 2100+ Loans, 2200+ Bills payable |
| 3xxx | Equity | 3000 Owner's equity, 3100 Draws, 3200 Retained earnings |
| 4xxx | Income | 4000 Sales, 4010 Refunds & Returns, 4020 Other Income (per D23) |
| 5xxx | (Reserved) | Future COGS — no v2 accounts use this range |
| 6xxx | Expenses | Alphabetical per D16 (6000 Accounting, 6010 Advertising, …) |
| 9xxx | System | 9999 = Review Later (per D32) |

The wizard assigns codes automatically when seeding defaults (alphabetical per D16). User-created custom accounts get the next available code in the appropriate range.

### 10A.5 Status flags (D55)

Two flags only:

- **`is_hidden`** (boolean, default false) — **user-facing**. Hides the row from the default Categories Management view. Toggle via "Hide" button in wizard + Edit modal; toggle globally via "Show hidden" chip in Categories Management. Replaces the older `is_active` flag — one flag is simpler than two for a non-accountant user.
- **`is_system`** (boolean, default false) — **internal**. Set to true for system accounts like Review Later (9999). When true, the account cannot be deleted or have its type changed. The Edit modal shows these rows but disables destructive actions.

### 10A.6 Type immutability (D54)

Once an account is created with a type, the type cannot be changed via UI. The Edit modal does not offer a type-change option. To re-classify, the user creates a new account with the new type and reassigns transactions manually. This keeps the GL postings clean (a historical Expense transaction can never silently become an Income transaction because the account got renamed).

### 10A.7 Modal field surface (D58)

The Add Account / Edit Account modal exposes **only**:

- Name (always)
- Code (only when `settings.show_account_numbers` is on — per D37/D46)
- Tax Line Item (Schedule C of IRS Form 1040) (always; picker filters by current Type)
- Type (always visible, locked to caller's context in wizard per D38, free in management per D47)
- Note (always; free-form text per D39)

**Not exposed in any UI text:** normal balance, closing behavior, code-range logic, COGS classification.

### 10A.8 Design principle recap (D51)

Every UI choice in Phase 1+ is evaluated against the non-accountant simplicity principle: **would a non-accountant understand this without an explanation?** If yes, keep; if no, simplify, defer, or remove. Accounting correctness is preserved at the schema/GL layer; the user sees plain English.

---

## 11. Multi-entity / future-proofing

`businesses.business_type` enum exists with these values:
- `sole_proprietor` (default, only one exposed in v1)
- `single_member_llc` (reserved)
- `s_corp` (reserved)
- `c_corp` (reserved)
- `partnership` (reserved)

UI shows only "Sole Proprietor" with no dropdown. Schema allows future expansion without migration.

Backlog item: multi-entity support (data model already supports multiple `businesses` rows; UI for entity switcher is v2).

---

## 12. Build spec — components

Components to build (TypeScript / React, Virta stack):

### Setup wizard

- `SetupWizard.tsx` — top-level, owns localStorage state
- `SetupWizardLayout.tsx` — progress bar, header, nav buttons
- `StepWelcome.tsx`
- `StepOwner.tsx`
- `StepBusinessIdentity.tsx`
- `StepContact.tsx`
- `StepTaxIds.tsx`
- `StepAccountingMethod.tsx` — Accrual option disabled with tooltip
- `StepTimeline.tsx`
- `StepReview.tsx` — read-only summary with edit-in-place links

### Categories wizard

- `CategoriesWizard.tsx`
- `StepCategoriesWelcome.tsx`
- `StepExpenseCategories.tsx` — table with toggle / inline edit / add custom
- `StepIncomeCategories.tsx`
- `StepOtherCategories.tsx`
- `StepReviewLater.tsx`
- `StepCategoriesReview.tsx`

### Categories management

- `CategoriesSettings.tsx` — tabbed list
- `AccountRow.tsx` — name / number / Schedule C line / actions menu
- `AddAccountModal.tsx` — used by both wizards and the management screen
- `DeleteAccountModal.tsx` — with reassignment flow
- `MergeAndDeleteAccountModal.tsx`
- `RemapScheduleCLineModal.tsx`
- `ScheduleCLinePicker.tsx` — reusable dropdown with descriptors

### Backend

- `POST /api/businesses` — create from setup wizard
- `POST /api/accounts/bulk` — bulk insert from categories wizard
- `PATCH /api/accounts/:id` — rename / disable / Schedule C remap
- `DELETE /api/accounts/:id` — with reassignment body
- `POST /api/accounts/:id/merge` — merge with destination

### Schedule C descriptors (single source of truth)

A static file: `irs_lines.ts` exporting:

```typescript
export const IRS_LINES = {
  expenses: [
    { id: 'line-8',  label: 'Line 8',  description: 'Advertising' },
    { id: 'line-9',  label: 'Line 9',  description: 'Car and truck expenses' },
    // ...
  ],
  income: [
    { id: 'part-i-1', label: 'Part I line 1', description: 'Gross receipts or sales' },
    { id: 'part-i-7', label: 'Part I line 7', description: 'Other income' },
  ],
};
```

Used by the picker UI and the eventual Schedule C CSV export.

---

## 13. Test plan

Wren review focuses on these behaviors (behavior IDs to be assigned in `qa/QA.md`):

| Behavior ID | What it tests |
|---|---|
| SW-001 | Setup wizard: **6 steps** render in order (Welcome + 5 form steps) |
| SW-002 | Each form step is skippable except the final Review |
| SW-003 | Skip step → field is blank / default in `businesses` row |
| SW-004 | Accrual option is visible but greyed out + tooltip present |
| SW-005 | Mid-wizard refresh resumes at last step |
| SW-006 | Review & create: every row has a pencil; clicking opens inline editor; Save persists; Cancel reverts |
| SW-007 | NAICS lookup modal: typing filters the list; selecting a row writes the code to the field; modal closes |
| SW-008 | NAICS lookup modal: works with no network (offline JSON only) |
| SW-009 | "Up next: set up your categories" hint visible on Welcome step |
| CW-001 | All expense defaults pre-checked; user can toggle off |
| CW-002 | Skipping expense step = all defaults saved |
| CW-003 | Add custom expense: name + Schedule C line required; submitting without line = blocked |
| CW-004 | "Review Later" is auto-created with Schedule C line = null |
| CW-005 | Final review shows correct counts |
| CW-006 | "Other accounts" step renders 3 subheader groups (Cash & bank / Credit & loans / Equity), each with its own table + "Add custom" |
| CW-007 | All category tables default to alphabetical sort by name; account codes match alphabetical order (except Review Later = 6999) |
| CW-008 | No left-side checkboxes in categories tables; rows have **Hide** and **Delete** buttons on the right |
| CW-009 | Clicking **Hide** on a row removes it from the saved list (set `is_hidden = 1` in wizard state); not deleted from defaults |
| CW-010 | Clicking **Delete** shows confirmation modal ("permanently exclude this category from your setup?") and on confirm removes the row from wizard state |
| CW-011 | Header row is sticky during vertical scroll on every categories table |
| CW-012 | Each column header is clickable to sort; default alphabetical by name ascending; active column shows ↑/↓, others show ↕ |
| CW-013 | "Show account numbers" toggle is offered at the top of each categories wizard step; toggling writes to `settings.show_account_numbers` immediately and persists into the management screen |
| CW-014 | Categories wizard step 4 (Other accounts) has a single "Add account" button at the top; no per-subheader Add buttons |
| CW-015 | "Add account" / "Add expense category" / "Add income category" buttons open the same generic Add modal — different label only, same fields |
| CW-016 | Add modal field labels: **Type** + Name + Code + **Tax Line Item (Schedule C of IRS Form 1040)** + Note |
| CW-017 | Add modal Type picker changes which Schedule C lines are shown: Expense → Part II lines; Income → Part I lines; Asset/Liability/Equity → none / hidden |
| CW-018 | Add modal Note field is optional, free-form text |
| CW-019 | Income default order: **Sales → Refunds & Returns → Other Income** (not alphabetical; exception to D16) |
| CW-020 | Setup Wizard step 2 placeholders are generic (e.g. "Your name", "Business name") — no Chantelle-specific examples |
| SW-010 | Setup Wizard step 2 (Basic business info) renders with empty placeholders, no user-specific examples |
| CM-001 | Categories list: every account shows its Schedule C line as a column |
| CM-002 | Rename: no confirmation; transactions unchanged |
| CM-003 | Schedule C remap: inline confirm; historical transactions reroute in aggregate views |
| CM-004 | Delete with transactions: shows reassignment flow; reassign + delete works |
| CM-005 | Merge and Delete same-type: transactions moved to destination, source deleted |
| CM-006 | Merge and Delete different type: blocked |
| CM-007 | Add custom category: Schedule C line picker shows all ~20 line options w/ descriptors |
| ST-001 | Settings toggle: hide account numbers — UI strips the column; DB retains values |
| ST-002 | Settings toggle: re-show account numbers — column returns |
| RB-001 | Sidebar badge: increments when transaction categorized to Review Later |
| RB-002 | Sidebar badge: decrements when last Review Later item is moved |

---

## 14. Out-of-scope reminders (carried over from v1)

Already in v1 spec, not changed by this doc:

- Inventory / COGS
- Multi-currency (USD only)
- Multi-user
- Pretty PDF export (CSV only)
- Recurring invoices
- Plaid integration

---

## 15. Wireframes

See `WIREFRAMES.html` in this folder. Walkthrough covers:

1. Setup Wizard — all 8 steps
2. Categories Wizard — all 6 steps
3. Categories management list view
4. Add custom / delete / merge modals
5. Sidebar with Review Later badge

---

*Last updated: 2026-07-07. Replaces §1 (Chart of Accounts) of `ACCOUNTING-v1.md`.*
