# Lore Research Report: Accounting App for Chantelle (Quilt Design Business)

*Prepared by Lore 📚 for Patrick / Rusty · 2026-06-28*
*Scope: Research only. No code, no scaffold. Decisions left for Rusty.*

---

## Executive Summary

Chantelle's quilt business is a textbook small-craft sole prop: a few hundred to a few thousand transactions per year across 2–4 bank/CC/PayPal/Venmo accounts, ~30–80 wholesale invoices annually, low-volume Etsy sales, materials inventory, and a handful of long-lived assets (sewing machine, long-arm, design software). The right shape is a **single-tenant, single-user, SQLite-backed app** that is opinionated about a Schedule-C-aligned chart of accounts, learns vendor→category rules from her first month of corrections, and produces a one-click accountant export that maps cleanly to IRS lines. Existing tools (QuickBooks, Wave, FreshBooks) all over-shoot her in three ways: jargon density, monthly subscription she doesn't need, and PDF/OCR features she won't use because her banks all offer CSV downloads. The MVP that would actually delight her is small — invoice + import + categorize + tax export — and the dashboard/asset features are nice v2 polish.

---

## 1. Chart of Accounts Structure

### What the IRS / QuickBooks / Wave actually use

The **IRS Schedule C (Form 1040)** defines the expense lines that any export must eventually roll up into. They are fixed by tax law, not by software ([IRS, Schedule C overview](https://www.irs.gov/forms-pubs/about-schedule-c-form-1040); [CentSense 2026 line-by-line guide](https://www.centsense.app/blog/schedule-c-expense-categories-explained)). Key lines for a craft seller: **Line 22 Supplies** (consumables that do *not* become the product — packaging, shipping labels), **Part III COGS** (materials that physically become the product — fabric, batting, thread), **Line 8 Advertising** (Etsy ads, IG boosts), **Line 17 Legal & Professional** (accountant), **Line 22 again** for software subs under the de minimis safe harbor, **Line 13 Depreciation** for the long-arm / sewing machine.

**QuickBooks Online** ships with an industry template system and ~20–40 default accounts; **Wave** seeds a chart at signup based on chosen "business type" and the user can add/categorize freely ([Wave's own guide](https://www.waveapps.com/blog/chart-of-accounts)). Both use the conventional numbered range: **Assets 1000s, Liabilities 2000s, Equity 3000s, Income 4000s, COGS 5000s, Expenses 6000s+**.

### Recommended starter chart (32 accounts)

For Chantelle's quilt design business, I would ship a seeded chart with exactly these — enough to cover Schedule C, narrow enough to not overwhelm:

**Income (4)**
- 4000 Wholesale Sales
- 4010 Etsy Sales
- 4020 Pattern/License Sales
- 4900 Other Income (refunds, shipping reimbursements)

**Cost of Goods Sold (5)**
- 5000 Fabric & Textiles
- 5010 Batting & Backing
- 5020 Thread, Notions & Trim
- 5030 Packaging Materials
- 5090 Freight In (shipping on materials)

**Operating Expenses (16)**
- 6000 Advertising & Marketing (Etsy ads, IG)
- 6010 Software Subscriptions (Adobe, design tools)
- 6020 Website & Hosting
- 6100 Office Supplies
- 6200 Shipping & Postage (outbound)
- 6210 Merchant Fees (Etsy %, PayPal, Stripe)
- 6300 Rent / Studio
- 6400 Utilities
- 6410 Phone & Internet (business %)
- 6500 Insurance (business liability)
- 6510 Professional Fees (accountant, lawyer)
- 6600 Travel
- 6610 Meals (50% deductible)
- 6700 Education & Training
- 6800 Vehicle Expenses (mileage)
- 6900 Other Expenses

**Assets (4)**
- 1000 Business Checking
- 1010 PayPal
- 1020 Venmo
- 1100 Equipment (long-arm, sewing machine, computer — depreciable)
- 1200 Materials Inventory
- 1210 Finished Goods Inventory

**Liabilities (3)**
- 2000 Business Credit Card
- 2100 Sales Tax Payable
- 2200 Owner Draws / Equity

**Equity (1)**
- 3000 Owner's Equity

Total: ~32 accounts. Every account carries an `irs_line` field in the DB so the tax export is mechanical.

---

## 2. Invoice Format

### Required fields (wholesale B2B baseline)

Based on Stripe's and BigCommerce's B2B invoicing best-practice guides ([Stripe](https://stripe.com/resources/more/b2b-invoicing-best-practices), [BigCommerce](https://www.bigcommerce.com/articles/b2b-ecommerce/invoicing/)), a wholesale quilt invoice needs:

- Seller block: business name, address, EIN/SSN, email, phone
- Buyer block: company name, bill-to address, contact, PO number (wholesale often requires)
- Invoice metadata: invoice number, issue date, payment terms ("Net 30"), due date
- Line items: description, quantity, unit price, line total — **per-pattern or per-bolt, never lumped**
- Subtotal, discounts, shipping, tax (note: wholesale quilt sales to resellers are usually tax-exempt with a resale certificate on file — capture the cert number)
- Total due, accepted payment methods, late-fee terms
- Notes / customer message

### PDF generation

All three libraries are reasonable Node choices; each has a real trade-off ([PDF library comparison 2025](https://www.nutrient.io/blog/javascript-pdf-libraries/), [npm-compare](https://npm-compare.com/html-pdf,pdfkit,pdfmake,puppeteer,react-pdf,wkhtmltopdf)):

- **PDFKit** — programmatic, lightweight, no browser. Good for simple structured invoices. Hard to style pretty.
- **Puppeteer / Playwright** — render HTML+CSS to PDF. Most flexible styling; heaver runtime (Chromium).
- **@react-pdf/renderer** — React-style components → PDF. Great DX if the rest of the stack is React.

For Chantelle's volume (maybe 100 invoices/year) and Rusty's likely stack match, **PDFKit or @react-pdf/renderer** are the right size. Puppeteer is overkill unless the invoice template gets ornate.

### Minimum data model

```
Customer { id, name, company, email, address, resale_cert_no, payment_terms }
Invoice  { id, customer_id, number, issue_date, due_date, status (draft|sent|paid|overdue), notes, subtotal, tax, total }
LineItem { id, invoice_id, description, quantity, unit_price, amount }
Payment  { id, invoice_id, paid_on, method, amount, reference }
```

That's it. Status transitions stay simple.

---

## 3. Tax-Prep Report Shape

### What Schedule C actually needs

Schedule C has three parts ([IRS Schedule C](https://www.irs.gov/forms-pubs/about-schedule-c-form-1040); [CentSense breakdown](https://www.centsense.app/blog/schedule-c-expense-categories-explained)):

- **Part I — Income:** gross receipts, returns, COGS, gross profit, other income, net profit
- **Part II — Expenses:** ~20 named lines (8 Advertising → 48/49 Other)
- **Part III — COGS:** inventory method, beginning/ending inventory, purchases, labor, materials, other

For a craft seller, the mapping that matters: every expense account has an `irs_line` code (e.g., Supplies→22, Advertising→8, Office→18, Software→22 if under $2,500 de minimis or 27a "Other" otherwise).

### Export formats accountants accept

- **CSV by IRS line** — universally importable. Every accountant can open it in Excel, pivot, and paste into QuickBooks or Drake. **This is the recommended MVP format.**
- **IIF** (Intuit Interchange Format) — imports into QuickBooks Desktop as journal entries with accounts attached ([Intuit IIF docs](https://quickbooks.intuit.com/learn-support/en-us/help-article/import-export-data-files/export-import-edit-iif-files/L56LT9Z0Q_US_en_US)). More work to generate, but zero work for the accountant. Worth v2.
- **PDF summary** — accountants hate these for import (they re-key), but useful as a human-readable cover sheet.
- **QBO** (Web Connect) — bank-feed format, not transaction-summary. Not what we want.

**Recommended v1:** Two CSVs in a single zip — `schedule_c_income.csv` (date, source, gross_amount, cogs_amount, net) and `schedule_c_expenses.csv` (date, vendor, account, irs_line, amount, memo). Optionally a `trial_balance.csv` that debits/credits every account for the year. An accountant can ingest any of these into QuickBooks in under five minutes.

---

## 4. Statement Parsing

### CSV column reality (banks vary)

Across Chase, AmEx, PayPal, Venmo, the **lowest-common-denominator schema** is: `date, description, amount` — sometimes `balance` is appended. Real-world variation ([Venmo CSV guide](https://capyparse.com/blog/convert-venmo-statement-to-csv-excel-qbo), [AmEx export docs](https://www.americanexpress.com/us/customer-service/faq.download-export-transactions-software.html), [Statements to Sheets](https://statementstosheets.com/blog/payment-app-statement-to-csv)):

| Source    | Typical columns |
|-----------|-----------------|
| Chase CC  | Transaction Date, Post Date, Description, Category, Type, Amount, Memo |
| AmEx      | Date, Description, Card Member, Account #, Amount |
| PayPal    | Date, Time, TimeZone, Name, Type, Status, Amount, Fee, Net, Currency, Balance |
| Venmo     | ID, Datetime, Type, Status, Note, From, To, Amount, Tax, Tip, Fee, Tax Rate |

The parse job is: detect the source (header heuristics + filename), map to a canonical `Transaction { date, description, amount, raw_source }`, dedupe against previously-imported transactions by `(date, amount, description_hash)`.

### PDF parsing — realistic?

Honest answer: **not worth it for v1**. Every bank and payment app in Chantelle's stack offers CSV export. The known approaches ([Reddit r/LocalLLaMA thread](https://www.reddit.com/r/LocalLLaMA/comments/1nbi7xp/help_to_automate_parsing_of_bank_statement_pdfs/), [AWS Textract](https://aws.amazon.com/textract/)):

- **pdf-parse** — only works on text-layer PDFs (digital, not scanned). Cheap, fast, brittle on layouts.
- **Tesseract OCR** — handles scanned PDFs, accuracy tanks on tables.
- **AWS Textract** — purpose-built for tables/forms, ~$1.50/1k pages. Best accuracy but a paid dependency and per-call latency.

**Recommendation:** ship CSV-only for v1. Surface a "we'll add PDF/OCR later" hint. If Chantelle asks, add it via Textract behind a feature flag — not local OCR.

### Minimum viable parsing pipeline

```
Upload → sniff header (Chase|AmEx|PayPal|Venmo|Other) → map to canonical → 
dedupe → present for review (the categorization UX, next section) → write as expense/income.
```

That's three parsers (Chase, PayPal, Venmo) plus a "generic CSV — pick columns" fallback.

---

## 5. Categorization UX

### What the pros do

QuickBooks and Wave both use a "For Review" queue with rules ([QuickBooks bank rules](https://quickbooks.intuit.com/learn-support/en-us/help-article/banking/set-bank-rules-categorize-online-banking-online/L0mjJl0nD_US_en_US), [community thread](https://quickbooks.intuit.com/learn-support/global/reports/when-categorizing-transactions-is-there-a-way-to-set-up-rules/00/1511592)). The flow:

1. Upload connects/fresh import → transactions land in "For Review"
2. Auto-rules from history fire (vendor name match → category)
3. User bulk-confirms the rule, or adjusts per-row
4. Each "Adjust" can promote the choice to a new permanent rule

### What Chantelle actually needs

She's processing ~50–100 transactions per month. The fastest possible UI:

- **Two-pane:** list of pending transactions on left, account picker on right
- **Keyboard-first:** `j/k` move, `1–9` assign to top-9 accounts, `Enter` confirm & advance, `r` open rule creator, `s` split transaction
- **Default-account quick keys:** "Etsy ads" = `1`, "Fabric" = `2`, "Shipping supplies" = `3`, etc. — she sets these on first run.
- **"Always categorize [Vendor] as [Account]"** toggle on every confirm — builds the rules automatically.

Sage and Tally both lean heavily on shortcuts ([Tally shortcuts](https://www.aiaccountant.com/blog/all-tally-prime-shortcut-keys-list)), which validates the approach. Gmail's "archive with `e`" proved this UX pattern at consumer scale.

---

## 6. Asset Management

### What a register needs

Minimal viable asset register:

- Description (e.g., "APQS long-arm quilting machine")
- Acquisition date, cost, vendor, receipt reference
- Category (Equipment / Vehicle / Software-capitalized)
- Depreciation method (Section 179, Bonus, MACRS straight-line)
- Useful life (5 yr computers, 7 yr office equipment, 5 yr vehicles)
- Disposition date + proceeds

For Chantelle, that's maybe 5–15 entries total. A spreadsheet with a few formulas handles it fine.

### Is depreciation worth building?

**No, not in v1.** Here's why:
- Section 179 + bonus depreciation change yearly and the rules are not trivial
- Most small-biz sole props just elect Section 179 to expense everything in year 1, which produces a single number the accountant can drop on **Schedule C Line 13 Depreciation**
- The depreciation-schedule generation itself is a niche accountant tool (Fixed Asset Pro, AssetAccountant — see [MoneySoft](https://moneysoft.com/fixed-asset-depreciation-software/) and [AssetAccountant](https://www.asset.accountant/us/))

**Recommendation:** let Chantelle record acquisitions as assets and flag "use Section 179 this year" → which exports Line 13 with the lump sum. Punt full schedule generation to the accountant (or v3).

### Inventory tracking

Two flavors, pick one in v1:

- **Materials (per-sku or batch):** track fabric by bolt or batch. COGS = materials consumed in sales.
- **Finished goods:** track finished quilts in stock. COGS = materials + labor allocation at sale.

For a quilt designer who mostly makes-to-order, **materials-only batch tracking** is the right shape. A finished-goods count is a nice-to-have. Skip per-stitch labor tracking — that's overkill for one person.

---

## 7. Profitability Dashboard

### The 6 metrics that actually matter

Based on the small-business KPI literature ([NetSuite 15 metrics](https://www.netsuite.com/portal/resource/articles/financial-management/small-business-financial-metrics.shtml), [FreshBooks KPIs](https://www.freshbooks.com/blog/kpis-small-business), [URI SBDC](https://web.uri.edu/risbdc/5-key-metrics-for-small-business-owners-to-track/)), for a sole-prop craft seller I'd show exactly:

1. **Revenue (MTD / YTD)** — total gross sales
2. **COGS** — materials consumed
3. **Gross margin %** — (Revenue − COGS) / Revenue. The single most important number.
4. **Operating expenses** — total opex
5. **Net profit** — the bottom line, what she actually keeps
6. **AR aging** — who owes her, how much, how overdue

Optional v2: top customers by revenue, revenue by channel (Etsy vs wholesale vs pattern), best-selling patterns, quarterly estimated tax due.

### Presentation

Single screen, large numbers, month-to-date and year-to-date side by side. Sparkline for trend. No drill-down for v1; that's where dashboards bloat. Compare against prior year only.

---

## 8. Build Shape Recommendations

### Single-tenant vs multi-tenant

**Definitive: single-tenant single-user.** The complexity tax of multi-tenant (tenant IDs on every row, RLS, per-tenant config, billing) buys nothing here. The only "hidden complexity" to flag for Rusty: even single-tenant benefits from a `user_id` column on every table from day one — it costs nothing now and means multi-tenant later is a config flip, not a rewrite. ([Brocoders 2026 guide](https://brocoders.com/blog/multi-tenant-architecture-designing-saas-apps/) confirms single-tenant for SMB is appropriate.)

### Storage: SQLite is fine

SQLite comfortably handles multi-GB databases and 100s of writes/sec — well beyond Chantelle's needs ([DataCamp comparison](https://www.datacamp.com/blog/sqlite-vs-postgresql-detailed-comparison)). It also matches Virta's stack, gives Rusty zero new infrastructure, and is trivially backupable (one file). The only reason to reach for Postgres would be if Virta's route ever becomes multi-user — then upgrade. **Recommended.**

### Auth: same Cloudflare Access pattern as Virta

Yes. Reuse the pattern. One human, no passwords to manage, integrates with whatever IdP Virta already fronts.

### Where does it live?

**Recommended: a route inside Virta at `/books`**, served from a sub-path or reverse-proxied. Reasons:
- Shared auth, no duplicate login
- One URL to remember
- Shared header/nav/chrome feels like one product
- A standalone repo that Virta links to = two deploys, two SSL certs, two auth flows, more surface area for Rusty to maintain

The only reason to go standalone is if Chantelle ever wants to share access with her accountant directly — and even then, a "shareable read-only link" inside Virta is cheaper than forking the repo.

---

## 9. Comparable Tools (UX Reference Only)

| Tool | Does well | Overbuilt for Chantelle |
|------|-----------|--------------------------|
| **Wave** | Free tier, clean invoice UI, decent import flow. ([Jobbers comparison](https://www.jobbers.io/freshbooks-vs-quickbooks-vs-wave-vs-bonsai-true-cost-comparison-for-freelancers/)) | Sales tax engine, multi-user, payroll |
| **FreshBooks** | Best-in-class invoicing UX, time tracking, client comms ([Gentle Frog](https://gentlefrog.com/comparing-accounting-software-qbo-xero-freshbooks-wave-zoho-books/)) | Time tracking she'll never use, project management, retainers, proposals |
| **QuickBooks SE** | Schedule-C-aware categorization, mileage tracker ([QuickBooks SE categories](https://quickbooks.intuit.com/learn-support/en-us/help-article/expense-accounts/schedule-c-expense-categories-quickbooks-self/L1viz8KIU_US_en_US)) | Quarterly tax estimator, tax filing upsell, mileage features she'll rarely use |
| **Xero** | Beautiful UI, strong reports ([Webgility](https://www.webgility.com/blog/freshbooks-vs-quickbooks-vs-xero)) | Multi-currency, inventory tiers, ecosystem integrations |
| **Bonsai** | Contracts + proposals + invoicing bundle for freelancers ([Ledgentry](https://www.ledgentry.com/blog/quickbooks-self-employed-alternatives-2026)) | Templates she won't customize, contract e-sign flow |
| **Craftybase** | Purpose-built for Etsy/craft sellers — materials → COGS ([Craftybase Etsy guide](https://craftybase.com/blog/best-accounting-software-etsy-sellers)) | Subscription she doesn't need; doesn't handle wholesale invoicing well |

**Key UX takeaways:**
- **Two-pane review queue** (QB/Wave) is the proven pattern
- **Keyboard shortcuts** (Sage/Tally) are how power users fly through 100s of transactions
- **One-click accountant export** (none of them do this well — Wave's PDF report is ugly, QB's IIF is a maze)
- **Simple = wins.** Wave's "everything in one place, free" is why small Etsy sellers tolerate its blandness.

We are not competing. We're building **the right shape for one person**.

---

## Recommendations (If I Were Building This)

1. **Ship v1 as: invoice + CSV-import + categorize + Schedule-C CSV export.** That's the 80% path. No PDF parsing, no depreciation scheduler, no dashboard beyond gross profit and AR aging.
2. **Seed the chart of accounts with the 32 accounts above**, every one with an `irs_line` attribute. Customization comes later — first make the default good.
3. **Make the categorization UI keyboard-first from day one.** j/k, 1–9, Enter. Don't ship a polished click-only UI that she'll hate by month three.
4. **One-click "Year-End Export"** button that produces a zip with three CSVs (income, expenses, trial balance). Time-to-accountant: under five minutes.
5. **Live at `/books` inside Virta**, SQLite, single-tenant, `user_id` on every table.
6. **Inventory v1 = materials-only, batch-level.** Finished goods and per-unit are v2.
7. **Depreciation = manual.** She records assets with cost and a flag "Section 179 this year?" — export line 13 accordingly.
8. **PDF invoice = @react-pdf/renderer or PDFKit**, not Puppeteer. Match Rusty's stack.
9. **Defer OCR/PDF statement parsing** to v2 via Textract. Don't build local OCR.
10. **Owner draws as a single equity account**, not split. Chantelle's accountant can ask for detail if needed.

---

## Risks & Unknowns (Patrick Needs to Decide)

- **Sales tax:** is Chantelle required to collect/ remit in her home state? If yes, the app needs a sales-tax engine and 2100 Sales Tax Payable becomes a real workflow. If Etsy handles it (paid channel), the app just records the liability and the payment. **Ask before designing 2100.**
- **Resale certificates:** wholesale-to-reseller sales are usually tax-exempt. Does she collect certs? Where are they stored?
- **Estimated quarterly taxes:** does she remit quarterly? If yes, dashboard metric #6 above; otherwise skip.
- **Home office:** many sole props use the simplified home-office deduction. Is she claiming it? If yes, allocate utilities to a Home Office expense category.
- **Mileage:** the IRS standard rate ($0.67/mi in 2026) needs a trip log. Worth a tiny "trips" feature? Probably not in v1.
- **Multi-currency:** Etsy pays in USD but some wholesale may be CAD/EUR. Almost certainly USD-only for v1, but confirm.
- **Year boundary:** when does her fiscal year start? Default = calendar year. Sole props can pick — confirm.
- **Backup of the SQLite file:** who owns it? Rusty's hosting? If her laptop dies, does the data survive? Need a backup story even at single-user scale.
- **Accountant access:** does she want her accountant to log in directly, or is annual CSV export enough? Strongly recommend the latter — much cheaper to build.
- **Bank connections:** Plaid integration would auto-pull transactions, eliminating CSV upload. Massive build cost. Punt unless Chantelle insists.

---

## Estimated Effort (small / medium / large)

| Area | Effort | Notes |
|------|--------|-------|
| Chart of accounts + DB schema | **Small** | 32 accounts, `irs_line` mapping, migrations |
| Invoice CRUD + PDF | **Medium** | 3–5 days for the data + PDF generation + send-by-email |
| Customer list + terms | **Small** | 1–2 days |
| CSV import pipeline (4 sources) | **Medium** | 4–6 days, mostly writing parsers + dedupe |
| Categorization review UI | **Medium** | 4–5 days, keyboard-first, rules engine |
| Schedule C CSV export | **Small** | 1–2 days, mechanical mapping |
| AR aging report | **Small** | 1 day, just sum-by-customer-by-bucket |
| Profitability dashboard | **Small** | 2 days, six big numbers |
| Asset register (basic) | **Small** | 2 days, no depreciation calc |
| Inventory — materials batch | **Medium** | 4–6 days, requires stock-adjust UX |
| Auth + route mount in Virta | **Small** | 1–2 days if Virta pattern is solid |
| **MVP total** | **Medium-Large** | **~6–8 weeks solo for Rusty**, or 3–4 weeks paired |

---

*End of report. Questions, push-back, or scope changes → reply to Lore via Patrick.*