# Virta Books — Setup Wizard & Categories Management Spec

**Owner:** Rusty
**Status:** Decisions locked 2026-07-07. **Round 2 applied 2026-07-08** (merged Owner + Business identity + Tax IDs into one step, alphabetical account numbering, NAICS lookup modal, edit-on-review pattern, asset/liability/equity subheaders, Welcome-screen Schedule C explainer).
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

---

## 4. Data model

### 4.1 `businesses` (NEW table — replaces the implicit single-tenant assumption)

```sql
CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  proprietor_name TEXT,                          -- "Chantelle Bailey"
  business_name TEXT,                            -- "Chantelle Bailey Design"
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

Preview bullets (softened — describe what the user will *do*, not implementation status):

- Pick your accounting method
- Fill in your categories (pre-filled from Schedule C — customize anytime)

Footer line under the CTA: **"Up next: set up your categories"** so the user knows where the button takes them.

Single CTA: "Get started."

### Step 2: Basic business info (merged)

This step replaces the old Steps 2 (Owner), 3 (Business identity), and 5 (Tax IDs). Two subheaders on desktop (stacked on mobile):

**About you**

| Field | Type | Notes |
|---|---|---|
| Your legal name (the business owner) | text | Label clarifies "this is you — the proprietor." Used in invoice header. Schedule C top of form. |
| What does your business do? | textarea | Schedule C field A. Max 280 chars. |

**About your business**

| Field | Type | Notes |
|---|---|---|
| Business name | text | Trade name. Default placeholder: "My Business Name" |
| Trade name | text | Optional. Distinct from `business_name`. |
| Industry code (NAICS) | NAICS picker | See §6A. Search-by-keyword modal backed by offline JSON. Schedule C field B. |
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
| When did your business start? | date | Schedule C field J. Optional. |

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

"Why is this on a tax app?" — NAICS is on Schedule C field B. It's not validated at submit time, just stored. If the user doesn't know it, the field stays empty (already optional).

---

## 7. Categories Wizard — step-by-step

### Step 1: Welcome explainer

Headline: "Set up your categories." Body explains that categories = "the buckets your money gets sorted into" and that they're pre-seeded based on Schedule C. "You can rename, remove, or add any of them."

CTA: "Next."

### Step 2: Expense categories

Table:

| Checkbox | Number | Name | Schedule C line | Description |
|---|---|---|---|---|
| ☑ | 6000 | Advertising | Line 8 | "Ads, marketing, promotions" |
| ☑ | 6100 | Vehicle | Line 9 | "Car and truck expenses for business" |
| ... | ... | ... | ... | ... |

(See §10 for the full default list.)

User can:

- Toggle a checkbox on/off
- Edit the Name inline
- See the Schedule C line — clicking the line number opens a popover with the IRS descriptor
- Add a custom expense: "Add another expense category" button → modal: Name (text) + Schedule C line picker (dropdown with all ~20 line options + descriptors)

Skip = all defaults pre-checked.

### Step 3: Income categories

Same structure as expense, but smaller list. Only Schedule C Part I line 1 maps to all income categories.

Default income list:
- 4000 Sales (mapped to Part I line 1: Gross receipts)
- 4010 Other Income (mapped to Part I line 1)
- 4900 Refunds & Returns (mapped to Part I line 1)

Plus: option to "Add another income category" with the same Picker.

### Step 4: Asset / Liability / Equity (with subheaders)

Pre-seeded list, all checked by default, **rendered in three subheader groups** (each its own table with its own "Add custom" button):

**Cash & bank accounts** (Asset)

| Number | Name | Type |
|---|---|---|
| 1010 | Business Checking | Asset |
| 1020 | Business Savings | Asset |
| 1100 | Cash on Hand | Asset |

**Credit & loans** (Liability)

| Number | Name | Type |
|---|---|---|
| 2000 | Business Credit Card | Liability |
| 2100 | Loans Payable | Liability |

**Equity**

| Number | Name | Type |
|---|---|---|
| 3000 | Owner's Equity | Equity |
| 3100 | Owner Draws | Equity |
| 3200 | Owner Contributions | Equity |

Reserved subheader for v2: **Property & equipment** (Vehicles, Equipment, Real Estate) — schema already supports it; not in v1 seed.

Same toggle / rename / add behavior per row. The whole step is still skippable (= accept all defaults).

**Default sort order (applies to every table in every wizard step and the management screen): alphabetical by name, ascending.** Account codes are assigned at seed time in alphabetical order — e.g. 6000 Advertising, 6010 Accounting, 6020 Car & truck — so the printed/numbered list reads naturally. No manual numbering override UI in v1.

### Step 5: Review Later

Auto-creates a single expense account:
- Number: 6999
- Name: "Review Later" (user can rename)
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

### 8.1 List view

Three tabs:

| Tab | Shows |
|---|---|
| Income | All income accounts |
| Expenses | All expense accounts, Review Later pinned to top |
| Other | Assets, Liabilities, Equity, grouped |

Each row:
| Name | Number | Schedule C line | Transactions | ⋯ menu |

Menu:
- Edit (rename, change Schedule C line, change number)
- Disable (sets `is_active = 0`, hides from pickers; reversible)
- Delete (blocked if transactions reference — see delete flow below)
- Merge with… (pick destination account; see merge flow below)

### 8.2 Add custom

Same as the wizard step 4 add-custom UX. Available from any tab. Same required field: Schedule C line.

### 8.3 Delete flow

If `transactions.account_id` references the account → modal:
> "**[N] transactions** are categorized to this account. Move them to another account first, then delete."
> [Pick destination account] [Cancel]

Once reassigned (or if no transactions), delete confirms and runs.

### 8.4 Merge flow

Pick source + destination. Same `account_type` required. Modal:
> "All transactions on **[source]** will be moved to **[destination]**. This can't be undone."
> [Merge] [Cancel]

Single SQL transaction: re-points journal lines + transactions, deletes source.

### 8.5 Schedule C remap

If user edits a category's Schedule C line on a category with existing transactions:
- Inline confirmation: "Changing the Schedule C line affects how this category's transactions appear on tax exports. Continue?"
- Yes → line updated, all historical transactions rerouted in any aggregate view (they live on the account, not the line)

### 8.6 Rename flow

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

### Income (3 default, alphabetical)

| Code | Name | Schedule C line |
|---|---|---|
| 4000 | Other Income | Part I line 1 |
| 4010 | Refunds & Returns | Part I line 7 |
| 4020 | Sales | Part I line 1 |

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
- `MergeAccountModal.tsx`
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
| CM-001 | Categories list: every account shows its Schedule C line as a column |
| CM-002 | Rename: no confirmation; transactions unchanged |
| CM-003 | Schedule C remap: inline confirm; historical transactions reroute in aggregate views |
| CM-004 | Delete with transactions: shows reassignment flow; reassign + delete works |
| CM-005 | Merge same-type: works, source deleted, transactions moved |
| CM-006 | Merge different type: blocked |
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
