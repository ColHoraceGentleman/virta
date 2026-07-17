# Manual Journal Entry UX Research

**Date:** 2026-07-09
**Author:** Lore (subagent, manual-entry UX research)
**Goal:** Find concrete patterns to redesign the Virta Books v2 manual-entry modal (currently 8 fields: Date, Type, Category, Name, Amount, Description, Matched with, Notes).

**Method:** Public help docs, training sites, and 3rd-party tutorials. Could not find an interactive demo for any of the six — all sources are text descriptions of the screens, with the exception of FreshBooks which has dated but visible screenshot URLs. Patterns below are derived from how the apps document the flow step-by-step, which is usually a faithful proxy for the actual UI.

---

## 1. QuickBooks Online (Intuit)

**Entry point:** `+ New` button → dropdown under "Other" → `Journal Entry`. Also a separate `+ New` → `Expense` flow for non-accountants that hides the debits/credits.

**Field order on the Journal Entry screen (full-accountant view):**
1. Date
2. Journal number (auto, with gear to override)
3. Line 1: Account (dropdown from chart) · Debits · Credits
4. Line 2: Account · Debits · Credits
5. … "+ Add line" as needed
6. Memo (per-line, but most people fill one)
7. Class / Location (optional, only shown if tracking is enabled)
8. Attachment (paper-clip)

**Required vs optional:** Account, Debits, Credits are required per line; totals must balance before Save is enabled. Date defaults to today. Class/Location and attachment are explicitly optional.

**Action button placement:** Sticky footer. Two-button pattern: `Save and new` (left) and `Save and close` (right, primary). `Cancel`/`Close` is in the top-right of the modal/page.

**Field count:** ~4–6 visible core fields (Date, Journal #, two line pairs). "Show more" is not a pattern — additional fields (Class, Location, Attachment) appear inline when the relevant feature is enabled at the org level.

**Special UX patterns:**
- **"System may enter the same amount in the opposite column on the other line"** — QBO will auto-mirror your first amount to the other side of the journal so you don't have to think about debits = credits.
- **"Save and new"** is the killer pattern for sole proprietors batch-entering transactions. It's faster than the modal-close-modal-open flow.
- **No tax in the journal entry screen** — tax is handled on the underlying bills/expenses, not the journal.

**Helper copy:** Almost none in the actual modal. Intuit deliberately keeps the screen dry. The help docs page leads with a warning: *"Before creating a journal entry, make sure you understand the basics of debits and credits in accounting. If you're not certain, consult your accountant to avoid errors."* That same warning is missing from the screen — it's a known UX gap.

**Non-obvious:** QBO actually has *two* entry paths and doesn't bridge them. Most non-accountant users go to `+ New` → `Expense` (which hides debits/credits and pairs the account for you) and never see the Journal Entry screen. The "Add expense" flow is what QBO quietly steers sole proprietors to, because the journal entry screen is too accountant-flavored.

**Sources:**
- https://quickbooks.intuit.com/learn-support/en-global/help-article/accounting-bookkeeping/create-journal-entry-quickbooks-online/L6Bzy9mT9_ROW_en
- https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/manually-add-transactions-quickbooks-self-employed/L1obtgTBA_US_en_US
- https://www.saasant.com/blog/how-to-create-journal-entries-in-quickbooks-online/

---

## 2. Xero

**Entry point:** `Accounting` → `Advanced` → `Manual Journals` → `New Journal`. (In the older nav, `Accounting` → `Manual Journals`.) Distinct from `Spend Money` / `Receive Money`, which are simpler cash-side forms.

**Field order on the Manual Journal screen:**
1. Date
2. Reference (free-text, optional but recommended)
3. Narration (single field, applies to the whole journal — this is the "what is this entry for" field)
4. Line items table:
   - Account · Description · Tax Rate · Debit · Credit (per line)
5. "Add a new line" at the bottom
6. Attachment (paper-clip)
7. Optional "Show reversals" / "Reverse on [date]" checkbox below the lines
8. Totals/balance display: `Total debits`, `Total credits`, **Balance: $0.00** in green when matched

**Required vs optional:** Date, at least two balanced lines are required. Reference, Description (per line), Tax Rate, and Reversal date are all optional. Narration is treated as required by community guidance but not flagged with an asterisk in the UI.

**Action button placement:** Sticky footer. `Save as Draft` (secondary, left) and `Post` (primary, right). `Cancel` is top-right of the screen.

**Field count:** 3 header fields + per-line grid (4 columns) + 2 post-line actions. No "Show more" — everything is visible by default.

**Special UX patterns:**
- **Running balance check** — the footer of the line grid shows `Balance: $0.00` and turns red/green depending on whether debits match credits. Posting is *blocked* if the balance is non-zero.
- **Auto-reversing journals** — `Show reversals` checkbox on the entry form. Post a June 30 accrual, set reversal date as July 31, and Xero creates the mirror-image journal for you on that date. Big deal for accruals.
- **Clone** — every saved journal has a "Clone" action that creates a new draft with all the same lines, date, and narration. One-click "do the same thing again" flow.
- **"Save as Draft"** is the explicit first-class citizen. The community treats this as the safe default ("if you're unsure, save as draft").
- **Reusable templates** — journals can be saved as templates (separate from drafts) for true recurring entries (e.g., monthly depreciation).

**Helper copy:** A single banner at the top of the help doc: *"Manual journal entries are the precision tool your accounts need when standard transaction forms won't cut it. Get the date right. Match debits to credits. Write a clear narration. Set reversals for every accrual."* The screen itself has very little inline copy. The running-balance indicator *is* the helper — it tells you the most important thing (is this balanced?) in one glance.

**Non-obvious:** Standard Xero users (non-Adviser role) **cannot create manual journals** at all. This is enforced as a permissions gate. For our use case (sole proprietor), that's the wrong default — but the gate exists because Xero's position is "if you don't know what you're doing, you shouldn't be posting journals." Their answer is to make the `Spend Money` / `Receive Money` forms the default cash entry path and push users away from manual journals for routine entries.

**Sources:**
- https://salesso.com/blog/how-to-add-a-manual-journal-entry-in-xero-final/
- https://blog.accountingprose.com/how-to-use-xero-journal-entries-properly
- https://coefficient.io/templates/xero-journal-entry-template
- https://central.xero.com/s/article/Add-import-and-post-manual-journals-US (loaded behind a JS gate; only Google snippets available)

---

## 3. Zoho Books

**Entry point:** `Accountant` → `Manual Journals` → `+ New Journal`. There's also a separate `Purchases` → `Expenses` flow that hides the debits/credits. Zoho has *two* entry modes for the same screen: `Save as Draft` and `Save and Publish`.

**Field order on the Manual Journal screen:**
1. Date
2. Journal# (auto-populated, gear-icon to override)
3. Notes (free-text, whole-journal)
4. Reporting Method (Accrual / Cash / Both — radio, defaults to Accrual + Cash)
5. Currency
6. Line item table:
   - Account · Contact · Transaction Type (Sales/Purchases) · Tax · Debit · Credit
7. Total Debits · Total Credits (running totals at the bottom of the grid)
8. Attachment

**Required vs optional:** Date, Journal#, Account, and at least two balanced lines are required. Notes, Reporting Method, Currency, Contact, Tax, and attachments are all optional.

**Action button placement:** Top-right of the page (not in a sticky footer). `Save as Draft` (secondary) and `Save and Publish` (primary, green). There's also a top-bar `Edit` toggle and `Publish` button on the detail page for drafts.

**Field count:** 5 header fields + per-line grid (6 columns). Additional fields appear inline (Reporting Tags, Project) only if those features are enabled in the org. No "Show more."

**Special UX patterns:**
- **Approval workflow** — if org-level approvals are on, the journal goes to `Draft` → `Pending Approval` → `Approved` → `Published`. Otherwise it's just Draft → Published. Status shows as a colored chip in the list.
- **Journal Templates** — separate entity. You build a template (e.g., "monthly depreciation"), and the debit/credit accounts and amounts auto-fill when you use it. Different from a recurring schedule, more like a one-click template.
- **Clone** — built-in action on any journal, creates a new draft with the same lines.
- **Bulk Publish** — multi-select journals in the list, click Publish, all go live at once. Useful for accountants.
- **Activity log** — every journal has a full audit log (creation, edits, approvals, status changes) as a tab on the detail page.

**Helper copy:** A lot, actually, but in the help docs, not in the modal. The help page opens with a 2-paragraph explanation of *what a manual journal is and when to use one*, which QBO and Xero don't do. The screen itself stays dry.

**Non-obvious:** Zoho has a `View Journal` link at the bottom of every Expense/Bill/Invoice detail page — every standard form knows how to display the corresponding journal entry in human-readable form. That's a nice transparency pattern: "you entered an expense, here's the double-entry that produced." If we go the Virta way (hiding debits/credits), we should still let users drill into "show me the journal behind this" for the curious.

**Sources:**
- https://www.zoho.com/us/books/help/accountant/manual-journal.html
- https://www.zoho.com/us/books/help/accountant/journal-templates.html
- https://www.zoho.com/us/books/help/expense/basic-functions.html

---

## 4. Sage Business Cloud Accounting

**Entry point:** `Adjustments` → `Journals` → `New Journal`. Distinct from the `Banking` → `New Transaction` flow (Spend/Receive money), which is the simpler cash-side path.

**Field order on the New Journal screen:**
1. Date
2. Reference (free-text, short)
3. Description (free-text, longer, optional)
4. Line items table (header row):
   - Details · Ledger Account · Include on VAT Return? · Debit · Credit
5. "Add another line" at the bottom
6. Attachment (paper-clip)
7. Inline balance check / warning if unbalanced

**Required vs optional:** Date, at least two lines, balanced debits = credits are required. Reference, Description, VAT flag, and attachment are optional. The asterisks are present on Ledger Account (required) and on Date (required).

**Action button placement:** Sticky footer. `Save` (primary, right) and `Cancel` (secondary, left). No "Save and new" — once you save, the modal closes and you click `New Journal` again.

**Field count:** 3 header fields + per-line grid (5 columns). No "Show more" pattern.

**Special UX patterns:**
- **VAT/tax toggle per line** — "Include on VAT Return?" checkbox on each line. Sage is UK/EU-flavored, so the tax handling is per-line and explicit. In the US (our case) this would be a no-op or hidden.
- **Control-account warnings** — if you pick a control account (e.g., Trade Debtors, Trade Creditors, VAT), Sage shows an inline warning: *"Journals posting directly to your Trade Debtors aren't on your Aged Debtors Reports."* This is a *very* good pattern — Sage is teaching you the consequence of your choice in context, not blocking the save.
- **Required-ledger asterisk** — Ledger Account is marked with a red asterisk. Other required fields (Date, balances) are validated on submit, not flagged with asterisks.
- **Reverse/Copy/Delete** — every saved journal has all three actions. Reverse creates a mirror-image journal on the same screen.

**Helper copy:** "Quick tips" section in the help doc has Attach files and Control accounts callouts. The screen itself has the inline warnings described above and very little else. The control-account warning is the most pedagogically useful piece of inline copy across any of the six apps.

**Non-obvious:** Sage's stance is that "control accounts" (the accounts that system transactions normally touch) should be left alone. Journals that touch them break the AR/AP subledger. This is exactly the kind of warning Virta's "Matched with" field could surface — *"You picked Credit Card as the other side. That account is normally driven by statement imports, not manual entries."*

**Sources:**
- https://gb-kb.sage.com/portal/app/portlets/results/viewsolution.jsp?solutionid=222001000100721
- https://us-kb.sage.com/portal/app/portlets/results/viewsolution.jsp?solutionid=220924550010631
- https://help-accountants.sage.com/en-gb/pe/Accounting/CreateJournals.htm

---

## 5. Wave

**Entry point:** `Accounting` → `Transactions` → `+ Add Expense` (or `+ Add Income` for a deposit). Distinct from `More` → `Add Journal Transaction`, which is the double-entry path used for opening balances and corrections.

**Field order on the Add Expense screen (single-line, "transactional" — the easy path most sole proprietors use):**
1. Description (free-text, short — the human-readable label)
2. Account (dropdown from chart — *which bank account this hits*)
3. Date
4. Transaction Type (Deposit / Withdrawal — radio, defaults to Withdrawal for an expense)
5. Amount (after tax)
6. Category (dropdown — *which P&L account this hits*)
7. Tax (link/expandable, optional)

**Required vs optional:** Description, Account, Date, and Amount are required. Category is required in newer versions (Wave added this around 2024 — previously it was optional and you'd categorize later). Tax is optional.

**Action button placement:** Top-right of the page. `Save` (primary, blue) is sticky to the top of the form. `Cancel` is in the page nav. (In the mobile app, Save is at the top right with a checkmark icon.)

**Field count:** ~5–7 visible fields, all on one screen, no "Show more" — the rest of the journal-entry machinery is hidden in the separate "Add Journal Transaction" screen.

**Special UX patterns:**
- **One account, not two** — this is the big one. Wave's "Add Expense" assumes you're moving money from one bank account to one P&L category. The "other side" is implicit. You don't pick a "matched with" — the bank account is already in the `Account` field at the top.
- **Inline editing** — Wave's transactions list lets you click directly on Description, Account, Category, or Amount cells in the row and edit them in place, without opening a modal. The modal is for new entries only.
- **Tax inclusive** — the Amount field is described as "amount inclusive of sales taxes if applicable." Wave doesn't make you compute tax separately. You just type the total.
- **"Mark as Reviewed"** — every imported transaction starts unreviewed. You can bulk-mark them as reviewed. Manual entries are auto-reviewed.
- **Auto-categorize rules** — recurring transactions (e.g., "Spotify" → "Software Subscriptions") get auto-categorized. The rules live in Settings.

**Helper copy:** Minimal in the modal. The dashboard has a lot of onboarding tooltips for first-time users. The help center's "Accounting made easy" article is a guided tour, not inline copy.

**Non-obvious:** Wave is the *only* one of the six apps where the standard expense form doesn't ask you to specify the offsetting account. The entire "Matched with" field is implicit. For a sole proprietor who only has one bank account, this is the right move — and it's why Wave is the easiest of the six to use, despite being free.

**Sources:**
- https://www.techsolutions.support.com/how-to/how-to-add-an-expense-transaction-in-wave-financial-14931
- https://support.waveapps.com/hc/en-us/articles/208621526-Create-an-expense-transaction
- https://www.doola.com/blog/how-to-use-wave-accounting-a-complete-beginners-tutorial/

---

## 6. FreshBooks

**Entry point:** Dashboard → `Create New` → `Expense`, or `Expenses` section → `+ New Expense`. (There's also a `Quick Expense` flow that's a stripped-down variant, and a recurring expense flow under Expense Settings.)

**Field order on the New Expense screen:**
1. Category (dropdown — required, with `Add category` link to create new)
2. Receipt image attachment (paper-clip icon, drag-and-drop)
3. Date (auto-fills to today)
4. Merchant (with `Add Merchant` link, dropdown of past)
5. Description (`Add description` link, expands to a text field — collapsed by default)
6. Add Taxes (link, expands to tax fields — collapsed by default)
7. Grand Total (always visible, the only required numeric field)
8. Expense Settings panel (right side, collapsible):
   - Mark as billable → + client/project + markup
   - Make Recurring
   - Currency
   - Cost of Goods Sold (COGS)

**Required vs optional:** Category and Grand Total are required. Everything else is "add a [thing]" link, which means it's collapsed-but-okay-to-skip. The links expand on click and reveal the input.

**Action button placement:** Top-right of the page, green `Save` button, sticky at the top of the form. No "Save and new" — but the `Quick Expense` flow has a checkmark-icon save that auto-resets the form, which serves the same purpose.

**Field count:** 2 required + 4–6 optional, plus 4 settings toggles. The default view shows only Category, Receipt, Date, and Grand Total. Everything else is behind `Add description` / `Add Taxes` / `Add Merchant` links or under Expense Settings.

**Special UX patterns:**
- **"Add X" link expansion** — instead of always-visible optional fields, FreshBooks shows `[+ Add description]`, `[+ Add taxes]`, `[+ Add Merchant]`, `[+ Assign to client]`. Click → expands inline. The screen stays small. *This is the single best pattern in this entire research* for a non-accountant-friendly form.
- **Drag-and-drop receipt anywhere** — the receipt paper-clip is a "drop target" that accepts files. FreshBooks explicitly does *not* OCR the receipt — "uploading an image of the receipt just lets you save it there for your own organizational purposes."
- **Save button at the top, not the bottom** — unusual choice, and probably driven by the long right-side Expense Settings panel (Save would be way off-screen if it was only at the bottom).
- **Currency "remembered from last expense"** — small detail, but it means you don't re-pick currency every entry. Sensible defaulting.
- **Billable + markup + client rebill** — a complete flow for service businesses that pass expenses through to clients. N/A for our sole-prop use case.
- **Recurring expenses** — separate entity under Expense Settings. Auto-delete if the creator's account is suspended (a small footgun).
- **No debits/credits anywhere** — like Wave, the entry form is purely "category + amount + who/why." The double-entry is fully hidden.

**Helper copy:** A small bit, in the help docs, framed for non-accountants: *"A category is required"* and *"The Date is automatically set to present day"* — these are reassurance lines, not tutorials.

**Non-obvious:** FreshBooks' expense form has a different mental model than the journal-entry screens in QBO/Xero/Zoho/Sage. It's not hiding a journal entry — it doesn't generate a double-entry at all. The expense *is* a category+amount record, and the underlying chart of accounts tracks the bank-account offset implicitly. For our use case (sole-prop Schedule C, no real AR/AP), this is the *right* model to crib.

**Sources:**
- https://support.freshbooks.com/hc/en-us/articles/216631488-How-do-I-create-an-expense-
- https://gentlefrog.com/how-to-add-expenses-in-freshbooks/

---

## Patterns we should consider

| # | Pattern | Used by | Adopt? | Notes |
|---|---------|---------|--------|-------|
| 1 | **"Add X" link to expand optional fields** — keep the default view tiny, let users opt into more fields inline. | FreshBooks (Add description, Add taxes, Add Merchant) | **Yes, adopt.** | The strongest "non-accountant-friendly" pattern in the set. Reduces the cognitive load of seeing 8 fields at once. Fits Virta's "fields are optional unless needed" philosophy. |
| 2 | **Two-button save: "Save" + "Save and new"** | QBO, Zoho | **Yes, adopt.** | Patrick batch-enters transactions. "Save and new" is a meaningful productivity win for the day-to-day flow. |
| 3 | **Type-then-category filter (Type as a top-level pick that narrows the Category list)** | Virta (current), Zoho (Account Type), QBO (Transaction Type in +New menu) | **Yes, keep.** | We're already doing this and it's the right move. Zoho's pattern of showing account *type* in the chart is similar. |
| 4 | **Single Amount field with sign convention (no separate Debit/Credit)** | Virta (current), Wave, FreshBooks | **Yes, keep.** | All the "easy" apps do this. QBO/Xero/Zoho/Sage only split them on the full journal screen. The sign convention is the *only* way to make the form non-accountant-friendly. |
| 5 | **Save button at the top, sticky, primary-color** | FreshBooks (top, green), Wave (top), Zoho (top) | **Maybe adopt.** | Solves the "Save is below the fold when you have lots of optional fields" problem. Currently we have Save in the footer of the modal — moving to top makes the primary action always visible. |
| 6 | **Inline balance/warning when something is off** | Xero (running balance, blocks save), Sage (control-account warnings, doesn't block) | **Partially adopt.** | Virta already shows a soft warning at the bottom. The Sage-style *teaching* warning ("if you pick Credit Card, that account is normally driven by statement imports") is the killer idea — surface a contextual nudge for the `Matched with` field. |
| 7 | **"Save as Draft" + "Post" two-step pattern** | Xero, Zoho | **No, skip.** | This is for multi-user accountant workflows. Virta is single-user, sole-prop. D65 explicitly says "no drafts." We already made the right call. |
| 8 | **Auto-reverse on a future date** | Xero (Show reversals) | **Skip for now.** | Genuinely useful, but adds a field. Could be a v3 thing. For Patrick's "manual accounting adjustment" use case, manual reversals are fine for now. |
| 9 | **Save and clone / "do the same thing again"** | Xero, Zoho (Clone), QBO (Save and new) | **Yes, adopt via #2.** | Save-and-new covers the common case (different amount, same vendor). Clone is for the rare case (same everything). One button gets you 80% of the value. |
| 10 | **Hide the journal view; offer "Show me the journal" on the detail page** | Zoho (View Journal link on every transaction) | **Yes, adopt for v3.** | Zoho's "show me the double-entry behind this" pattern is great for transparency without scary default UI. Low effort, high value for the curious. |
| 11 | **Date defaults to today** | All six | **Yes, keep.** | Universal pattern. We're doing it. |
| 12 | **Receipt attachment** | FreshBooks, QBO, Zoho | **Skip for now.** | Important, but a separate feature. Note for the receipt-upload roadmap. |

## Anti-patterns to avoid

- **Showing the Journal Entry screen as the default "new entry" path.** QBO has two paths, and most non-accountants end up on the Expense screen, not the Journal screen — but QBO doesn't *nudge* you that way. If we show the debits/credits screen as the default, we've failed. Virta's current design (no debits/credits visible) is correct.
- **Hiding the offsetting account entirely (Wave/FreshBooks).** Wave and FreshBooks skip the "Matched with" field because their chart of accounts implicitly handles it. Virta's setup wizard has *separate* Type→Category and "other side" pickers because Schedule C sole-prop accounting needs explicit control over which account the offsetting side goes to (Cash vs Credit Card vs Owner Equity). Don't borrow the "no other side" simplification — borrow the *small visible form* but keep the explicit "Matched with" picker.
- **"Save as Draft" as a default-present option.** Xero and Zoho put it next to Post. This is for accountant workflows where you want to hand off to a reviewer. For Patrick as the only user, it's noise. D65 (no drafts) is right.
- **Required asterisks on every required field.** Sage and QBO do this. It works, but it implies the form is asking you for a lot. FreshBooks and Wave's approach — only one or two required fields, the rest opt-in — is friendlier. We have 8 fields visible, which is too many. Pattern #1 above fixes this.
- **Reversal date, recurring schedule, batch-class, projects — at modal-open time.** All six apps let you configure these, but most of them bury the config under Expense Settings or make them expandable links. Don't surface them on the main "new entry" modal.
- **The "Transaction Type: Withdrawal / Deposit" radio.** Wave has it on every expense. It's redundant — if you clicked "Add Expense" you mean a withdrawal, and if you clicked "Add Income" you mean a deposit. The button you used to get here is the answer. Don't add a redundant control.
- **Jargon in labels.** All six apps use `Ledger Account`, `Narration`, `Reference`. The first time a non-accountant hits those, they bounce. We should keep `Category`, `Name`, `Description` (or even better words). Zoho's "Notes" and QBO's "Memo" are both vague — `Description` is fine.

## Quick recommendations (ordered by impact)

1. **Collapse the optional fields behind "Add X" links** (FreshBooks pattern). Show by default: Date, Type, Category, Amount, Name, Save. Hide behind links: Description, Matched with, Notes. This is the single biggest win — it gets the form from 8 visible fields to 5, while keeping every field available. Use this for round 25 wireframe.

2. **Add "Save and new"** alongside Save (QBO + Zoho pattern). For batch entry days (quarter-end, weekly catch-up), this is the highest-frequency productivity win. Keep Save as primary on the right; put Save and new to the left of it as secondary. Still no drafts.

3. **Add a contextual warning under the "Matched with" field** (Sage pattern). When the user picks an account that's normally driven by imports (Credit Card, Bank, Stripe), show: *"This account is usually updated by statement imports. A manual entry will create a separate transaction that you'll need to reconcile against the import later."* Teaches the consequence in context.

4. **Move the Save/Cancel button row to the top of the modal, sticky**. FreshBooks and Wave both do this. The "Matched with" warning text makes the modal longer; Save at the top means it's always visible. Cancel goes left, Save goes right, both as plain buttons. (The infobox at the top stays — it's part of the content area, not a sticky header.)

5. **Add a "Show me the journal" link inside transaction details** (Zoho pattern, deferred to v3). For the rare case where Patrick wants to understand or audit what his entry produced, the link expands the double-entry view without exposing it in the new-entry modal. Notes this is a v3 thing — wireframe it in but don't ship in v2.

---

## Appendix: Quick field-count comparison

| App | Visible-by-default fields on "new entry" | Total possible fields | Special |
|-----|----------------------------------------|----------------------|---------|
| QBO (Expense) | ~5 (Payee, Date, Category, Amount, Memo) | 7 (Payment acct, Class/Location) | "Save and new" |
| QBO (Journal Entry) | 3 header + 2-line grid | 5 + attachments | Auto-mirrors debit/credit |
| Xero (Manual Journal) | 3 header + 4-col line grid | 6 + reversal | Running balance, Save as Draft |
| Zoho (Expense) | 6 (Date, Account, Amount, Paid Through, Vendor, Customer) | 10+ | Save as Draft, Save and Publish, itemize |
| Zoho (Manual Journal) | 5 header + 6-col line grid | 8 + tags | Approval workflow |
| Sage (Journal) | 3 header + 5-col line grid | 4 + attachments | Control-account warnings |
| Wave (Expense) | 5 (Description, Account, Date, Type, Amount, Category) | 6 (tax) | One-account mental model |
| FreshBooks (Expense) | **2** (Category, Grand Total) | 10+ (all behind "Add X" links) | "Add X" link expansion, drag-drop receipt |
| **Virta (current)** | **8** | 8 | Type-then-category filter, sign convention |

FreshBooks is the clear winner on field-count minimalism. Wave and Sage are the runners-up. Virta is the highest of the easy-path apps (8 fields) and is on par with the journal-entry screens — which suggests we're accidentally showing users an accountant-flavored form.
