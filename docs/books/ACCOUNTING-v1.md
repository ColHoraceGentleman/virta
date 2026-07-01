# ACCOUNTING-v1.md — Virta Books: MVP

**Owner:** Chantelle Bailey (single user)
**Builder:** Cinder
**Reviewer:** Wren → Echo → Rusty
**Project root:** `/Users/colonelhoracegentleman/clawd/projects/accounting-app/`
**Lives at:** `/books` inside Virta (single codebase, sub-route)
**Created:** 2026-06-28
**Status:** Scoped — Patrick to confirm before build

---

## Context

Chantelle runs a quilt-pattern design business. She's a designer, not a physical-goods maker — what she sells is patterns and licenses, plus occasional design services. The business is a single-member LLC filing a Schedule C on the Baileys' joint return. **Currently running at a net loss** (shrinking). Patrick is the technical owner; Chantelle is the user.

This app replaces nothing she has today — she currently uses spreadsheets + Etsy/payment-app reports. The goal is a single place for chart of accounts, invoicing, expense categorization, tax-prep export, and basic asset/dashboard reporting.

**Lore's research:** `LORE_RESEARCH.md` (in this folder, 22KB, 13 sections).

**Open questions answered by Patrick (2026-06-28):**

| Question | Answer |
|---|---|
| Sales tax workflow | **Skip v1.** No nexus currently; revisit if business scales. |
| Resale certificates | **Skip v1.** She doesn't collect them. |
| Quarterly estimated taxes | **Skip v1.** Business at a loss. |
| Home office deduction | **Yes, she claims it.** Flag on dashboard (see §10). |
| Fiscal year | Calendar year (Jan–Dec). |
| Backup | Per-instance — whoever runs Virta backs up the SQLite file. iCloud/Dropbox target. |
| Accountant access | **CSV export only** in v1; pretty PDF is v2. |
| Inventory / COGS | **Skip v1.** Designer business; supplies are operating expenses, not COGS. |
| Resale cert on invoices | **Skip.** Field doesn't exist on customer/invoice in v1. |
| Pretty PDF accountant report | v2. v1 is CSV-only. |

---

## Scope: In vs. Out

### In v1 (this spec)

1. Chart of accounts (32 seeded accounts, `irs_line` mapping)
2. Customers
3. Invoices (CRUD + PDF generation + send-by-email)
4. Payments (record payment against invoice)
5. AR aging report
6. Import pipeline (CSV + prebuilt PDF parsers for known institutions, plus generic CSV-mapping fallback)
7. Categorization review UI (keyboard-first)
8. Vendor → category rules (auto-categorize on import)
9. Schedule C CSV export (zip: income + expenses + trial balance)
10. Asset register (basic, with Section 179 flag)
11. Profitability dashboard (6 KPIs)
12. Home office expense category with dashboard warning
13. Backup helper (cron-driven iCloud/Dropbox push)

### Deferred to v2

- Inventory / materials tracking (designer business, not needed)
- Sales tax workflow
- Pretty PDF accountant report
- Multi-currency
- Quarterly estimated tax calculator
- Mileage / trip logging
- Per-customer profitability
- Recurring invoices

### Deferred to v3 (or never)

- Plaid integration
- Multi-user
- Resale certificates (when business scales)
- Depreciation schedule generation (not just lump-sum Section 179)
- Real-time sales tax engine

---

## 1. Chart of Accounts

### Seed data

29 accounts (4 income + 16 operating expenses + 5 assets + 3 liabilities + 1 equity), every one with `irs_line` mapping. Defaults seeded on first migration; user can rename/add/delete freely but the `irs_line` is immutable.

**Income (4)**
| Account | irs_line | Notes |
|---|---|---|
| 4000 Wholesale Sales | Part I Gross receipts | B2B invoice revenue |
| 4010 Etsy Sales | Part I Gross receipts | Etsy channel revenue |
| 4020 Pattern/License Sales | Part I Gross receipts | Direct pattern sales, licenses |
| 4900 Other Income | Part I Other income | Refunds, shipping reimbursements |

**Operating Expenses (16)** — supplies land here, NOT in COGS, because Chantelle is a designer
| Account | irs_line | Notes |
|---|---|---|
| 6000 Advertising & Marketing | Line 8 | Etsy ads, IG boosts |
| 6010 Software Subscriptions | Line 18 or Line 27a | Adobe, design tools — under $2,500 safe harbor = Line 22 |
| 6020 Website & Hosting | Line 18 | chantellebaileydesign.com hosting |
| 6100 Office Supplies | Line 18 | Stationery, printer ink |
| 6200 Shipping & Postage | Line 18 | Outbound shipping for physical patterns |
| 6210 Merchant Fees | Line 18 | Etsy %, PayPal, Stripe, Venmo fees |
| 6300 Rent / Studio | Line 20 | Studio rent if any |
| 6400 Utilities | Line 25 (Utilities) | Allocated to home office (see §10) |
| 6410 Phone & Internet | Line 25 | Allocated to home office |
| 6500 Insurance | Line 15 | Business liability |
| 6510 Professional Fees | Line 17 | Accountant, lawyer |
| 6600 Travel | Line 24a | Business travel |
| 6610 Meals | Line 24b | 50% deductible |
| 6700 Education & Training | Line 27a | Skillbuild classes, books |
| 6800 Home Office | Line 30 | Patrick's note: kept in chart for completeness; deductibility is a year-by-year tax-pro decision. No dashboard warning in v1. |
| 6900 Other Expenses | Line 27a | Catch-all |

**Assets (5)**
| Account | irs_line | Notes |
|---|---|---|
| 1000 Business Checking | Balance sheet | Chase business checking |
| 1010 PayPal | Balance sheet | PayPal balance |
| 1020 Venmo | Balance sheet | Venmo balance |
| 1100 Equipment | Line 13 (depreciation) | Sewing machine, long-arm, computer |
| 1200 Materials Inventory | Balance sheet | DEFERRED — placeholder for future |

**Liabilities (3)**
| Account | irs_line | Notes |
|---|---|---|
| 2000 Business Credit Card | Balance sheet | |
| 2100 Sales Tax Payable | n/a | DEFERRED — placeholder |
| 2200 Owner Draws / Equity | n/a | |

**Equity (1)**
| Account | irs_line | Notes |
|---|---|---|
| 3000 Owner's Equity | n/a | |

### Edit rules (delete + merge)

- **All accounts can be renamed** (including seeded ones).
- **Delete is blocked if transactions reference the account.** If any journal lines or transactions point at the account, the delete shows: *"X transactions are categorized to this account. Move them to another account first, then delete."* with a link to a reassignment flow. Empty accounts delete cleanly.
- **Account merge** combines two accounts of the same `account_type`:
  - User picks source + destination in Settings → Chart of Accounts → "Merge accounts"
  - All journal lines and transactions on the source are re-pointed to destination in a single SQL transaction
  - Source is then deleted
  - Cross-type merges blocked (can't merge income with expense)
- **`is_system` flag is informational only** — marks seeded accounts in the UI; doesn't gate behavior.

### DB schema

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,         -- '4000', '6000', etc.
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,        -- 'income' | 'expense' | 'asset' | 'liability' | 'equity'
  irs_line TEXT,                     -- 'Line 8', 'Part I Gross receipts', 'Line 30', etc.
  parent_id TEXT REFERENCES accounts(id),  -- for sub-account hierarchies
  is_active INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,    -- informational: seeded/curated accounts
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_accounts_code ON accounts(code);
CREATE INDEX idx_accounts_type ON accounts(account_type);
```

---

## 2. Customers

**Fields:**
- `name` (required)
- `company`
- `email`
- `address_line1`, `address_line2`, `city`, `state`, `postal`, `country`
- `payment_terms` (default `Net 30`)
- `notes`

**No resale certificate field** (deferred).

**DB:**
```sql
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal TEXT,
  country TEXT,
  payment_terms TEXT DEFAULT 'Net 30',
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_customers_name ON customers(name);
```

---

## 3. Invoices

**Fields:**
- `customer_id`
- `number` (auto-generated: `YYNNN` format — e.g., `26042`. Year prefix 2 digits, 3-digit sequence restarting each year. Patrick confirmed 2026-06-28.)
- `issue_date`, `due_date` (due_date = issue_date + payment_terms from customer; editable within the invoice)
- `payment_terms` (copied from customer at creation, editable per-invoice — see Terms rules below)
- `status` (`draft` | `sent` | `paid` | `overdue` | `void`)
- `subtotal`, `tax` (percent, default 0%), `total` (computed from line items)
- `notes`
- `sent_at`, `paid_at` (timestamps for status transitions)

**Line items:**
- `description`, `quantity`, `unit_price`, `amount`

**Terms rules (Patrick confirmed 2026-06-28):**
- `payment_terms` on invoice defaults to customer's `payment_terms` at creation time
- Terms are editable within the invoice at any time
- When terms are changed on an invoice, prompt: *"Update [Customer Name]'s default terms to [new terms] going forward, or keep this as a one-time change?"*
  - "Update customer" → patches `customers.payment_terms`, future invoices inherit
  - "One-time" → only this invoice changes, customer record unchanged
- **Due date is the due date.** Changing customer terms does NOT recompute existing invoice due dates. The only way to change a due date on an existing invoice is to open it, edit the `due_date` field directly, save, and resend. (Patrick confirmed 2026-06-28.)

**Overdue cron (Patrick confirmed 2026-06-28):**
- Daily cron that flips `sent` → `overdue` when `due_date < today`
- **Toggled off by default.** Settings → Invoices → "Auto-mark overdue" toggle
- Customizable email message when an invoice is auto-marked overdue (Settings → Invoices → "Overdue notification message")
- When toggled on: cron runs at 6AM, checks all `sent` invoices past due, flips status, optionally sends the configured overdue message to the customer

**PDF generation:**
- Library: **`@react-pdf/renderer`** (matches Virta's React stack, lighter than Puppeteer)
- **Match Chantelle's existing Google Sheets template** (Patrick attached 2026-06-28). Layout:
  - **Top-left:** Invoice number, Issue Date, Due Date (stacked, label + value)
  - **Top-right:** Bill To block (customer name + full address)
  - **No logo in v1** — she doesn't have one on the current template
  - **No header business name block** — template is minimal; business identity is in the footer
  - **Line items table:** 4 columns — Description (left-aligned) | QTY (center) | PRICE (right) | TOTAL (center)
  - Up to ~10 line item rows (template has blank rows; app just renders actual rows)
  - **Totals area (right-aligned block below line items):** Tax (%) and Amount Due
  - **Footer (centered, bottom):** `chantellebaileydesign@gmail.com  |  @chantellebaileydesign`
  - Clean, minimal aesthetic — white background, no decorative borders
- Branded with her business email and social handle from Settings
- **Tax field:** percentage (default 0.0% per template). Tax amount = subtotal × tax%. Most wholesale will be 0%.

**Send by email:**
- Node `nodemailer` with SMTP creds stored in **macOS Keychain** (not the DB)
- Default subject: `Invoice {number} from {business_name}`
- Default body: short, professional, includes the PDF as attachment
- Settings → Email captures SMTP host/port/user/app-password one-time
- **v1 default provider: Gmail** (smtp.gmail.com:587) with an app-specific password (Patrick confirmed 2026-06-28). Other providers work but Gmail is the documented happy path.
- Email goes out from inside the app (direct SMTP, not Mail.app) — the app owns `sent_at` and status transitions

**Status transitions:**
- `draft` → `sent` (when "Send" button clicked)
- `sent` → `paid` (when all payments recorded sum to `total`; partial payments leave status `sent`)
- `sent` → `overdue` (auto, daily cron — toggled in Settings, off by default)
- `*` → `void` (manual, requires confirmation modal — soft delete, preserves accounting trail)

**Multiple payments (Patrick confirmed 2026-06-28):**
- An invoice can have 0+ payment rows against it
- Partial payment: `sum(payments.amount) < invoice.total` → status stays `sent`
- Full payment: `sum(payments.amount) >= invoice.total` → status flips to `paid`, `paid_at` set
- **"Payments In" screen** — dedicated screen (`/books/payments`) that:
  - Shows a queue of payments to record
  - Attempts to match each payment against open invoices (by customer + amount)
  - Lets her confirm the match, adjust, or mark as "Non-invoiced revenue" (creates an income-account journal entry instead)
  - Non-invoiced revenue is categorized to an income account (default: 4900 Other Income, overridable)

**DB:**
```sql
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  number TEXT NOT NULL UNIQUE,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  sent_at TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

CREATE TABLE line_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_line_items_invoice ON line_items(invoice_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  paid_on TEXT NOT NULL,
  method TEXT,                         -- 'check' | 'ach' | 'paypal' | 'venmo' | 'card' | 'cash' | 'other'
  amount REAL NOT NULL,
  reference TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
```

---

## 4. AR Aging Report

**Endpoint:** `GET /api/v1/books/reports/ar-aging`

**Buckets** (Patrick confirmed 2026-06-28): Current, 1–30 days overdue, 31–60, 61–90, 90+

**Output:** JSON array of `{ customer_name, current, days_30, days_60, days_90_plus, total }`

**UI:** Single page, table view, sortable. Default sort by total desc. Drill-down to invoice list per customer.

---

## 5. CSV Import Pipeline

### Sources

**Two parallel import paths: prebuilt parsers (for known institutions, CSV and PDF) and generic CSV mapping (the fallback).**

**Prebuilt parsers** ship as `parsers/<institution>.js` modules. Each parser exports:

- `detect(buffer, filename, mimeType) → { matches: bool, source: string, format: 'csv'|'pdf' }`
- `parse(buffer) → Array<RawTransaction>` where `RawTransaction = { txn_date, description, amount }` (canonical shape; everything else is derived)

**Initial parser inventory** (R7 — Patrick confirmed 2026-06-30):

| Institution | Formats | Parser shape |
|---|---|---|
| **Chase CC** | CSV | `parsers/chase-cc.js`. Header signature: contains "Transaction Date" + "Post Date". Canonical mapping: `date=Transaction Date, description=Description, amount=Amount` (negative outflow). |
| **AmEx** | CSV | `parsers/amex.js`. Header contains "Card Member". `date=Date, description=Description, amount=Amount` (negative outflow). |
| **PayPal** | CSV | `parsers/paypal.js`. Header contains "TimeZone" + "Status". `date=Date, description=Name, amount=Net` (or `Amount` if `Net` absent) (positive = inflow). |
| **Venmo** | CSV | `parsers/venmo.js`. Header contains "Datetime" + "From". `date=Datetime, description=Note, amount=Amount` (positive = inflow). |
| **Chase Checking** (future) | PDF | `parsers/chase-checking-pdf.js`. Will be added in v1.1 — not blocking Phase C. |

When a user uploads a file, the import flow calls `detect()` on every registered parser; the first match wins. **CSV-format parsers** are header-sniff based (string match on header row). **PDF-format parsers** are layout-based (text-position extraction). Both produce the same `RawTransaction[]` shape.

**Anything else: generic CSV mapping.** If no parser matches and the file is a CSV, the user sees the column-mapping UI (date / description / amount dropdowns). If no parser matches and the file is a PDF, the user sees a message: *"We don't have a parser for this PDF yet. Please export to CSV from your institution's website and re-upload."* The CSV mapping can be saved as a generic user-named mapping for re-use.

**CSV column-mapping rules** (unchanged from prior spec, repeated here for completeness):

| Source | Header detection | Canonical mapping |
|---|---|---|
| **Chase CC** | Header contains "Transaction Date" + "Post Date" | `date=Transaction Date, description=Description, amount=Amount` |
| **AmEx** | Header contains "Card Member" | `date=Date, description=Description, amount=Amount` |
| **PayPal** | Header contains "TimeZone" + "Status" | `date=Date, description=Name, amount=Net` (or `Amount` if `Net` absent) |
| **Venmo** | Header contains "Datetime" + "From" | `date=Datetime, description=Note, amount=Amount` |
| **Generic CSV** | No header match | Show column-mapping UI; user picks which column is date/description/amount |

**Source-mappings are saved.** When the user picks a mapping (system-suggested or manual), we store it in `csv_source_mappings` so the next import from the same source uses the same mapping automatically. (See "Mappings" below.)

### Pipeline

```
Upload file (.csv or .pdf) → run each registered parser's detect() →
  ├─ first match: use that parser's parse() to extract RawTransactions
  └─ no match:
      ├─ CSV: show generic column-mapping UI
      └─ PDF: show "unsupported PDF, please export to CSV" message

→ resolve column mapping (prebuilt parser's mapping, or user-confirmed CSV mapping) →
suggest source account (per R5, memorized per source_key) → user confirms →
compute dedupe_hash per row (see Dedupe section below) →
check for exact matches → mark duplicates (auto-skip) →
check for near-duplicates → mark for user review (flag, don't skip) →
present for review (Categorization UI, §6) → on confirm, create Transaction + Journal Entry.
```

### Dedupe (R8 — Patrick confirmed 2026-06-30)

Two-tier dedupe: exact (auto-skip) and near-duplicate (flag for user review).

**Exact dedupe** — sha256 hash of `txn_date | amount.toFixed(2) | description | account_id`. The `UNIQUE` constraint on `dedupe_hash` is the database-layer backstop. Re-imports of the same statement produce identical hashes → all rows skipped. Partial overlaps where rows are byte-identical are caught here too. The `vendor_normalized` column is **not** in the exact hash (different raw descriptions with the same vendor are not duplicates — they may be different transactions that should both be imported).

**Near-duplicate detection** — runs after exact dedupe, before the categorization UI. For each non-duplicate row, the system searches for potential matches: same `vendor_normalized` + same `amount.toFixed(2)` + `txn_date` within ±3 days against any existing transaction on the same `account_id`. Matches are flagged as `near_duplicate: { existing_transaction_id, days_apart }`. Near-duplicates are **not auto-skipped** — they're imported but flagged so the user can decide in the Categorization UI whether to keep both, delete the new one, or delete the old one. This catches:

- Re-exports where the bank changed the description string between exports (`AMZN MKTP US*RT4F2K3L` → `AMAZON.COM*RT4F2K3L AMZN.COM/BILL`).
- Date drift on a posted transaction (bank sometimes adjusts `txn_date` by 1 day).
- Same merchant, same amount, but a different processor (PayPal Netflix vs. Square Netflix on the same card).

The Categorization UI shows a `near_duplicate` warning on each flagged row with a link to the existing transaction. The user can:

1. Keep both (legitimate coincidence — different transactions that happen to match)
2. Delete the new one (it's a re-import of an existing row)
3. Delete the old one (the new row is correct, the old one was wrong)

**Why near-duplicate is flagged, not auto-skipped:** at Chantelle's expected volume (~300 rows/month), the false-positive cost of a missed legitimate transaction outweighs the false-positive cost of asking. Plaid and most banking apps use the same model — flag, don't auto-skip.

### Mappings (R1, R5 — Patrick confirmed 2026-06-29)

**The user controls column mapping. The system suggests; the user accepts or adjusts.**

- **`csv_source_mappings`** table: stores saved per-source column mappings (`source_key`, `date_col`, `description_col`, `amount_col`, `amount_sign_convention`, `created_at`, `last_used_at`).
- **On import:**
  1. System sniffs the header to identify a candidate source (Chase / AmEx / PayPal / Venmo / generic).
  2. System looks up a saved mapping for `(source_key, header_signature)`. If found, pre-selects it.
  3. If no saved mapping, system uses the canonical mapping for the detected source and shows a **Mapping preview** with the proposed columns highlighted. User can adjust any column with a dropdown of available header names.
  4. User must click "Apply" before import proceeds. Saving the mapping is a separate checkbox ("Save this mapping for future imports").
- **Manual mapping:** a "New mapping" option lets her build one from scratch (column → date/description/amount). Same save semantics.
- **Mappings list:** Settings → Import → CSV Source Mappings shows all saved mappings, editable, deletable.
- **Memorized account assignment (R5):** the import flow suggests a source account based on the detected source (Chase → Business CC, PayPal → PayPal account, Venmo → Venmo account, etc.). User **must accept** the suggestion before proceeding — no auto-assignment. Once accepted, the source-account choice is **memorized per source_key**: every future import from Chase auto-suggests the same account. Settings → Import → CSV Source Mappings also lets her change or clear the memorized account.

### Size limits (R6 — Patrick confirmed 2026-06-29)

Soft cap: **max 10,000 rows per upload, 5MB file size.** No streaming needed; in-memory parsing is fine at Chantelle's expected volume (monthly statements of 50–300 rows). The cap exists to surface obvious mistakes early ("did you really mean to upload 50,000 rows?") not as a hard limit on her real usage.

### Refunds and credits (R4 — deferred to v2)

Refunds appear in CSV exports as positive-amount rows. In v1 they look identical to inflow transactions in the Categorization UI. Visual distinction (e.g., "Amazon refund +$15.23" with a different indicator than "Amazon purchase -$15.23") is **v2**. For v1, she can use the `e` exclude shortcut on refunds that don't belong to the business.

### Vendor normalization (R2 — Patrick confirmed 2026-06-29)

**Best-effort normalization, editable before saving a rule.**

- Strip common prefixes/suffixes (TXN IDs, reference numbers, card suffixes — `PAYPAL *`, `SQ *`, `CARDMEMBER XX-XXXX`, etc.). The exact strip list is implementation-defined; the v1 contract is "no garbage characters in the vendor name."
- Lowercase + trim + collapse whitespace.
- The normalized name is computed on import and stored in `transactions.vendor_normalized`. She can override it before saving a vendor rule — the override is what's stored in `vendor_rules.vendor_pattern`.

### DB

```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),  -- which bank/CC/PayPal/Venmo this came from
  imported_at TEXT DEFAULT (datetime('now')),
  txn_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,                              -- negative = outflow, positive = inflow
  raw_source TEXT,                                   -- 'chase' | 'amex' | 'paypal' | 'venmo' | 'generic'
  raw_csv_row TEXT,                                  -- JSON blob of original row
  dedupe_hash TEXT NOT NULL UNIQUE,                  -- sha256(date+amount+description+account)
  category_account_id TEXT REFERENCES accounts(id),  -- null until categorized
  vendor_normalized TEXT,                            -- cleaned vendor name for rule matching
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'uncategorized',      -- 'uncategorized' | 'categorized' | 'excluded'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_date ON transactions(txn_date);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_category ON transactions(category_account_id);

CREATE TABLE vendor_rules (
  id TEXT PRIMARY KEY,
  vendor_pattern TEXT NOT NULL,        -- e.g. 'amazon', 'etsy ads'
  category_account_id TEXT NOT NULL REFERENCES accounts(id),
  match_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_vendor_rules_pattern ON vendor_rules(vendor_pattern);

CREATE TABLE csv_source_mappings (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,            -- 'chase' | 'amex' | 'paypal' | 'venmo' | 'generic' | user-named
  header_signature TEXT NOT NULL,      -- sha256 of joined sorted header names (e.g. 'Transaction Date|Post Date|Description|...')
  date_col TEXT NOT NULL,
  description_col TEXT NOT NULL,
  amount_col TEXT NOT NULL,
  amount_sign_convention TEXT NOT NULL DEFAULT 'negative_outflow' CHECK (amount_sign_convention IN ('negative_outflow', 'positive_outflow')),
  memorized_account_id TEXT REFERENCES accounts(id),  -- R5: the source account she accepted last time
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_csv_source_mappings_sig ON csv_source_mappings(source_key, header_signature);
```

### Categorization side effect

When a transaction is categorized, **also create a journal entry** (double-entry):

```sql
CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY,
  txn_date TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT,                        -- 'transaction_import' | 'manual' | 'invoice_payment'
  source_id TEXT,                     -- id in source table (for traceability)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE journal_lines (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);
```

**Example:** Chantelle buys $50 of fabric from Joann on her Business CC.
- Transaction categorized to 6100 Office Supplies
- Journal entry: **Debit 6100 Office Supplies $50, Credit 2000 Business Credit Card $50**

(For a designer business with no inventory, every expense is a simple one-line journal entry; the expense account is debited, the source asset account — the bank/CC/PayPal/Venmo account from `transactions.account_id` — is credited.)

**Note:** the source account comes from `transactions.account_id` (whichever bank/CC/PayPal/Venmo the row was imported from), not assumed to be Business Checking. The example above shows CC; if she'd paid from Checking it would be 1000 Business Checking. The importer's memorized source-account assignment (§ Mappings above) determines this when the row is created.

---

## 6. Categorization Review UI

**Layout:** Two-pane.
- **Left:** Transaction list with three tabs at the top — `Pending` (default), `Auto-categorized` (rules fired on import), `Excluded` (marked personal/non-business). Virtualized scroll for 1000s.
- **Right:** Account picker + transaction detail.

**Keyboard shortcuts:**
- `j` / `k` — next / prev transaction
- `1`–`9` — assign to top-9 accounts (user-configurable order)
- `Enter` — confirm categorization, advance to next
- `r` — open rule creator ("always categorize [vendor] as [account]")
- `s` — open split editor (v1: 2 accounts max, amounts must sum to original)
- `e` — exclude (mark as personal/non-business)
- `?` — toggle shortcut overlay (modal; dismiss with `?` or `Esc`)

**Top-9 customization:** Settings → Categorization → drag-reorder her 9 most-used accounts to the 1-9 quick keys. **v1 default order** (Patrick confirmed 2026-06-29): 4000 Wholesale Sales, 4010 Etsy Sales, 6210 Merchant Fees, 6010 Software Subscriptions, 6200 Shipping & Postage, 6100 Office Supplies, 6700 Education & Training, 6800 Home Office, 6900 Other Expenses.

**Vendor rules:**
- After 3+ manual categorizations of the same vendor, prompt: "Always categorize [Vendor] as [Account]?"
- Rules apply automatically on next import — matching rows get `category_account_id` set during import and skip the Pending tab.
- Auto-categorized rows are **visible** in the `Auto-categorized` tab so she can spot-check rule firings (X2 — builds trust, single-user, small volume).
- Manageable in Settings → Vendor Rules.

**Vendor normalization:** see §5 (single source of truth for the strip list and the "no garbage characters" contract).

---

## 7. Schedule C CSV Export

**Trigger:** Settings → Tax Export → "Export {year}" button.

**Output:** ZIP file containing:

1. **`schedule_c_income.csv`**
   ```
   date,source,gross_amount,cogs_amount,net,account_code,account_name
   2026-01-15,Etsy,1245.00,0,1245.00,4010,Etsy Sales
   ```

2. **`schedule_c_expenses.csv`**
   ```
   date,vendor,account_code,account_name,irs_line,amount,memo
   2026-01-03,Joann,6100,Office Supplies,Line 18,50.00,fabric
   ```

3. **`trial_balance.csv`**
   ```
   account_code,account_name,debits,credits
   1000,Business Checking,15000.00,12500.00
   4010,Etsy Sales,0,1245.00
   ```

**Mapping logic:**
- Income accounts (4000–4999) → `schedule_c_income.csv` with `gross_amount = sum(amount where account is income)`
- Expense accounts (6000–6999) → `schedule_c_expenses.csv` with `irs_line` from account
- Asset/Liability/Equity accounts → `trial_balance.csv` only
- Empty `cogs_amount` in income rows (no COGS in v1)

**Mechanically computed from journal entries.** No manual classification needed.

**Filename:** `chantelle-books-{year}-export-{YYYY-MM-DD}.zip`

---

## 8. Asset Register

**Fields:**
- `description` (e.g., "APQS long-arm quilting machine")
- `acquisition_date`
- `cost`
- `vendor`
- `category` (`equipment` | `vehicle` | `software_capitalized`)
- `useful_life_years` (default: 5 for equipment, 5 for vehicles)
- `section_179_elected` (boolean — checkbox)
- `disposition_date` (nullable)
- `disposition_proceeds` (nullable)

**DB:**
```sql
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  acquisition_date TEXT NOT NULL,
  cost REAL NOT NULL,
  vendor TEXT,
  category TEXT NOT NULL,
  useful_life_years INTEGER NOT NULL DEFAULT 5,
  section_179_elected INTEGER NOT NULL DEFAULT 0,
  disposition_date TEXT,
  disposition_proceeds REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**Section 179 effect on export:**
- If `section_179_elected = 1`, the asset's cost is included in the year's Schedule C Line 13 lump sum
- Otherwise, the asset is excluded from the tax export (accountant handles depreciation)

**No depreciation schedule generation in v1.** The export lumps all Section-179-elected acquisitions into a single number.

---

## 9. Profitability Dashboard

**Layout:** Single page, 6 large KPI tiles + 1 warning tile (home office, see §10).

**KPI tiles:**

| Tile | Metric | Period toggle |
|---|---|---|
| Revenue | Sum of income accounts | MTD / YTD |
| Operating Expenses | Sum of expense accounts | MTD / YTD |
| Net Profit | Revenue − Operating Expenses | MTD / YTD |
| Gross Margin % | n/a (no COGS) — display "n/a (designer business)" | — |
| AR Outstanding | Sum of `total - payments` for invoices with status `sent` or `overdue` | current |
| Top Customers (Top 5) | by YTD revenue | YTD |

**Period selector:** MTD / QTD / YTD / Custom date range.

**Sparklines:** Each KPI gets a 12-month trailing sparkline (just net amounts per month).

---

## 10. Home Office Expense Category

**Background (Patrick, 2026-06-28):**
- Chantelle did **not** claim the home office deduction last year
- Net loss has been shrinking year-over-year; revenues trending up
- Sufficient legitimate business activity — IRC §183 hobby-loss concern is low
- But she may want to claim it in a future year

**v1 implementation:**

- "6800 Home Office" is included in the seed chart as a standard expense category
- **No dashboard warning tile in v1.** The warning concept is deferred until/unless she starts claiming the deduction routinely. Easy to add later (one line of code) if/when circumstances change.
- Whether to claim the deduction in any given year is a decision with her tax pro — out of scope for this app
- The category is fully editable / deletable via Settings → Chart of Accounts like any other category
- The accountant-export includes 6800 Home Office as a normal expense line; no special highlighting

---

## 11. Backup Helper

**Goal:** Chantelle's Virta instance (on her Mac mini, eventually) needs to back up the SQLite file to iCloud/Dropbox daily.

**Implementation:**
- New API endpoint: `POST /api/v1/books/admin/backup-now`
- Cron job: `daily-books-backup` at 2 AM, isolated session, model `minimax/MiniMax-M3`
- Backup destination: `~/Library/Mobile Documents/com~apple~CloudDocs/Virta Backups/books-{YYYY-MM-DD}.db` (iCloud Drive) OR `~/Dropbox/Virta Backups/...` — configurable in Settings
- Retention: keep last 30 backups, prune older
- Failure alert: iMessage Patrick if backup fails 3 days in a row

**Settings UI:** "Backup destination: [iCloud Drive] / [Dropbox] / [Disabled]" + a "Back up now" button.

---

## 12. Virta Integration

### Route mount

`/books/*` inside the existing Virta server (Node/Express).

```
/books                 → redirect to /books/dashboard
/books/customers       → customer list
/books/customers/:id   → customer detail + invoices
/books/invoices        → invoice list
/books/invoices/new    → create invoice
/books/invoices/:id    → invoice detail + PDF preview + send
/books/import          → CSV upload + categorize
/books/categorize      → keyboard-first review queue
/books/payments        → Payments In (match payments to open invoices or non-invoiced revenue)
/books/reports/ar      → AR aging
/books/reports/export  → Schedule C CSV export
/books/assets          → asset register
/books/dashboard       → profitability dashboard
/books/settings        → chart of accounts, vendor rules, backup, SMTP, categorization
/books/reconcile       → account reconciliation (Phase E.1)
```

### Nav (when shell/hub refactor lands)

The `/books` tab in the top app switcher, with a 🧾 emoji or 📒.

### Auth

Same Cloudflare Access pattern as Virta. Chantelle's email gates the whole thing (both `/` and `/books`).

---

## 13. Account Reconciliation (Phase E.1)

**Why this exists separate from import dedupe.** Import dedupe asks "is this row already in the system?" — point-in-time, per-row, at upload. Reconciliation asks "does my Books balance match my bank statement?" — point-in-time, per-account, against an external statement. They catch different classes of error:

- **Dedupe catches:** re-uploading the same statement, partially-overlapping date ranges with byte-identical rows.
- **Reconciliation catches:** transactions the bank shows that we never imported (missed an upload), transactions we have that the bank doesn't show (imported something wrong), uncleared checks, timing differences.

**Without reconciliation, the dashboard numbers are untrustworthy.** That's why this is Phase E.1, before Phase F (Profitability Dashboard).

### Cadence

**Monthly per account.** Chantelle picks an account and a month, sees the reconciliation view, completes it. ~30 seconds per account if imports are up to date; longer if something needs investigating.

### Flow

```
/books/reconcile  → list of asset/liability accounts with last reconciliation date
                  → click an account → /books/reconcile/:account_id

On the reconciliation view:
  1. Show statement period picker (defaults to previous month)
  2. Show uncleared transactions for the period (status='uncategorized' OR status='excluded' OR no journal entry yet)
  3. She pastes the bank statement balance + cleared-count for the period
  4. System computes: books_balance - statement_balance = diff
  5. If diff == 0: ✅ "Reconciled. Mark as complete." → store reconciliation row
  6. If diff != 0: ⚠️ show diff, show the list of uncleared transactions, show the list of cleared transactions with running balance. She can:
       a. Mark transactions as cleared/uncleared (toggle)
       b. Add a missing transaction manually (creates a Transaction + journal entry inline)
       c. Investigate and come back later (save draft reconciliation)
```

### DB

```sql
CREATE TABLE reconciliations (
  id                  TEXT PRIMARY KEY,
  account_id          TEXT NOT NULL REFERENCES accounts(id),
  period_start        TEXT NOT NULL,  -- YYYY-MM-01
  period_end          TEXT NOT NULL,  -- YYYY-MM-DD (last day of month)
  statement_balance   REAL,           -- pasted by user; null until provided
  books_balance       REAL NOT NULL,  -- computed at reconciliation time
  diff                REAL,           -- books_balance - statement_balance; null until statement_balance provided
  cleared_count       INTEGER,        -- count of transactions marked cleared in this period
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reconciled', 'investigating')),
  notes               TEXT,
  reconciled_at       TEXT,           -- when status moved to 'reconciled'
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_reconciliations_account ON reconciliations(account_id);
CREATE INDEX idx_reconciliations_period ON reconciliations(period_start, period_end);

CREATE TABLE reconciliation_clears (
  id              TEXT PRIMARY KEY,
  reconciliation_id TEXT NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id),
  cleared_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(reconciliation_id, transaction_id)
);
CREATE INDEX idx_reconciliation_clears_recon ON reconciliation_clears(reconciliation_id);
CREATE INDEX idx_reconciliation_clears_txn ON reconciliation_clears(transaction_id);

-- Add to transactions table:
ALTER TABLE transactions ADD COLUMN cleared_at TEXT;  -- null = uncleared, timestamp = cleared (set by reconciliation)
```

The `transactions.cleared_at` column is the canonical "did the bank confirm this posted" flag. Import doesn't set it. Reconciliation sets it when she marks a row as cleared.

### UI

- `/books/reconcile` — list of reconcilable accounts (asset/liability type only) with last-reconciled date and a "Reconcile" button per account.
- `/books/reconcile/:account_id` — the reconciliation view described above. Two-column layout: left = uncleared txns with checkbox to mark cleared, right = cleared txns with running balance, top = statement balance input + diff display.

### Out of scope for E.1

- Statement PDF parsing (paste-the-balance is the v1 input)
- Multi-period view (one month at a time)
- Split transactions (still v2)
- Reconciliation for income/expense accounts (only asset/liability — that's where balances live)

### Why this is E.1 not E or F

- E (Reports) is read-only, computed from existing data — low risk, builds on existing imports
- E.1 needs new schema, new UX flow, new interactions with the import system — its own phase
- F (Dashboard) numbers depend on reconciliation being possible — so E.1 ships before F

---

## Build Order

| Phase | Items | Effort |
|---|---|---|
| **A: Foundation** | DB schema, accounts seed, customers CRUD, basic dashboard skeleton | Small |
| **B: Invoicing** | Customers, invoices CRUD, line items, payments, PDF generation | Medium |
| **C: Import + Categorization** | CSV upload + prebuilt parsers + generic fallback + dedupe (with near-duplicate detection + vendor-normalized hash), Categorization UI, vendor rules, journal entry generation | Medium |
| **D: Reports** | AR aging, Schedule C CSV export, trial balance | Small |
| **E.1: Reconciliation** | Per-account monthly reconciliation — paste bank balance, see uncleared txns, surface diff, approve. Catches missed imports + wrong entries that dedupe can't. **Before F because dashboard numbers depend on it.** | Medium |
| **F: Assets + Polish** | Asset register, profitability dashboard with all KPIs + home office warning, backup helper | Small |
| **TOTAL** | | **Medium-Large (~6-8 weeks solo)** |

---

## Definition of Done

- [ ] All 32 accounts seeded on first boot; user can customize but `irs_line` is read-only
- [ ] Customer CRUD works end-to-end with smoke test
- [ ] Invoice CRUD works; PDF generates and downloads; send-by-email delivers
- [ ] Payments In screen: match payment to open invoice, partial payment leaves invoice open, non-invoiced revenue creates journal entry
- [ ] AR aging shows correct buckets; drill-down to invoices
- [ ] CSV import works for Chase, AmEx, PayPal, Venmo, generic; dedupe prevents double-import
- [ ] Categorization review UI keyboard-first (j/k/1-9/Enter/r/s/e)
- [ ] Vendor rules auto-apply on import
- [ ] Schedule C export produces valid 3-file ZIP; income + expenses + trial balance
- [ ] Asset register CRUD with Section 179 flag
- [ ] Profitability dashboard shows all 6 KPIs + home office warning tile
- [ ] Daily backup cron runs without errors for 7 consecutive days
- [ ] No regressions to existing Virta features
- [ ] Wren review + Echo QA both PASS

---

## Open Questions for Patrick Before Build

1. ~~Home office warning wording~~ ✅ Resolved 2026-06-28 — see §10. Category stays in chart, no warning tile in v1, fully editable.
2. ~~Top-9 quick keys~~ ✅ Resolved 2026-06-28 — ship defaults: **Income, Etsy Fees, Software, Shipping, Office, Travel, Meals, Home Office, Other**. Fully configurable via Settings → Categorization (drag-to-reorder).
3. ~~SMTP provider~~ ✅ Resolved 2026-06-28 — **Gmail** with an app-specific password. Settings → Email captures host (smtp.gmail.com), port (587), user (her @gmail), app password. Credentials stored in macOS Keychain.
4. ~~AR aging buckets~~ ✅ Resolved 2026-06-28 — Current / 1–30 / 31–60 / 61–90 / 90+ days.
5. ~~Multi-currency~~ ✅ Resolved 2026-06-28 — **USD only** for v1. No currency field on transactions or invoices; everything stored as numeric USD.
6. ~~Data import from existing spreadsheets~~ ✅ Resolved 2026-06-28 — **start fresh**. No importer needed in v1.

---

## References

- `LORE_RESEARCH.md` — full research report
- `tools/agent-safety-lessons.md` — general OpenClaw safety patterns (apply if/when this app needs external API access)
- `projects/virta-multi-account-roadmap.md` — Virta shell/hub direction this app fits into

---

*Last updated: 2026-06-28 — all open questions resolved; spec ready for build handoff*