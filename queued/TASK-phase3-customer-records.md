# TASK — Phase 3 Build: Customer Records

**Status:** Ready for Cinder (Builder) — queue after Phase 1+2 build ships
**Phase:** v2 Phase 3 (Customer records) — greenfield, no v1 carryover
**Estimated scope:** 8-12 hours of build work
**Author:** Rusty (per Patrick's call 2026-07-09 15:30-15:32 MDT)
**Date:** 2026-07-09 15:35 MDT
**Branch:** TBD (Rusty decides)

---

## Goal

Build the v2 Customer Records feature into the running Books app. Customers are the people/entities you invoice and receive payments from. The v2 design is greenfield — no styling, layout, or component reuse from v1's Customers page (per Patrick's "we shouldn't really be incorporating v1 into this" call at 2026-07-09 15:13 MDT).

The data model + list page + detail page are designed in this task. The connection to the manual-entry modal (auto-suggest + auto-create prompt) is also built here so the Phase 1+2 modal can use it. The deeper connection to invoicing (Phase 4) is deferred — the customer record exists, but invoicing against it is a separate task.

## What to build

### Data model

`customers` table with the following fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | text (PK) | yes | generated UUID |
| `name` | text | yes | Single field. "Little Pine Quilt Co." or "John Smith" — covers both |
| `company` | text | no | Separate from `name` for B2B cases |
| `email` | text | no | For invoicing |
| `phone` | text | no | Single field, no format enforcement |
| `address_billing` | object | no | `{street1, street2, city, state, postal, country}` — all optional, all fields are optional |
| `address_shipping` | object | no | Same shape as billing. **Defaults to "same as billing"** — stored as a separate object only if the user explicitly opts out of "same as billing" |
| `payment_terms` | enum | no | One of: `Net 15`, `Net 30`, `Net 60`, `Due on receipt`, `Custom`. Default: `Net 30` |
| `payment_terms_custom` | text | no | Only if `payment_terms = 'Custom'`. Free text description (e.g., "Net 45 from invoice date") |
| `is_tax_exempt` | boolean | no | Default `false`. If `true`, show a `tax_exempt_number` field |
| `tax_exempt_number` | text | no | Resale certificate number, only relevant if `is_tax_exempt = true` |
| `notes` | text | no | Free text, internal-only |
| `status` | enum | yes | `active` or `archived`. Default `active`. Archived customers don't appear in the Name dropdown but their historical invoices/payments still link to them |
| `created_at` | timestamp | yes | |
| `updated_at` | timestamp | yes | |

No "is_deleted" flag. Archiving is the only soft-delete mechanism. Hard delete is admin-only and out of scope for Phase 3.

### List page (`/books/customers`)

- **Header**: "Customers" page title + "New customer" button (primary action, top-right)
- **Search bar**: free-text search across name, company, email. Case-insensitive substring. Debounce 300ms.
- **Status filter chip**: "Active" / "Archived" / "All". Default: Active.
- **Table columns**:
  - Name (sortable, default sort)
  - Company (sortable)
  - Email (sortable)
  - Phone
  - Payment Terms
  - Last Invoice (date, formatted; "—" if no invoices yet — but invoices aren't built in Phase 3, so this column shows "—" until Phase 4)
  - Status (small badge: "Active" sage, "Archived" muted)
- **Row actions**: click row → detail page. Right-side has Edit and Archive (or Unarchive) buttons.
- **Empty state**: centered text + "New customer" button. No illustrations (per Lore's Direction B).
- **Pagination**: client-side-of-the-API with 100-row cap initially. Server-side cursor pagination deferred until we have >1000 customers.

### Detail page (`/books/customers/:id`)

Single page, no tabs. **Transactions (invoices + payments) are listed alongside the customer data** — either below or to the side (Cinder's call, but I suggest below for a v2 read-the-document feel). One scroll.

Layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Customers                                            │
│                                                                 │
│  Little Pine Quilt Co.                          [Edit] [Archive] │
│  Wholesale buyer, Net 30                                         │
│  📧 billing@littlepine.com  📞 +1 555 123 4567                  │
│                                                                 │
│  ┌── Billing Address ──────────────────────────────────────┐   │
│  │  123 Main St                                             │   │
│  │  Asheville, NC 28801                                     │   │
│  │  United States                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌── Shipping Address ──┐  Same as billing? [✓]                 │
│  │  (collapsed — same as billing)                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Payment terms: Net 30                                           │
│  Tax status: Taxable                                            │
│  Notes: Started ordering Q2 2026. Prefers earth-tone palettes.  │
│                                                                 │
│  ─── Transactions ───────────────────────────────────────────── │
│                                                                 │
│  Date        Type       Amount     Status         Reference    │
│  2026-07-09  Invoice    $1,200.00  Sent           INV-1001     │
│  2026-07-09  Payment    $1,200.00  Reconciled     PAY-0044     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The Transactions section is rendered empty in Phase 3 (no invoices or payments data yet). Phase 4 wires up the Invoice entity; Phase 5 (or wherever Payments lands) wires up the Payment entity. Both will populate this section. For now, show "No transactions yet."

### Create / Edit form

Modal or full-page? **Modal** for both create and edit. Same modal, different states.

Fields (in order):

1. Name * (required)
2. Company (optional)
3. Email (optional, with format check: must contain `@` and `.` after the `@`. Don't be strict about the rest.)
4. Phone (optional, free text)
5. Billing address (collapsible section; all fields optional; collapses if empty)
6. Shipping address — with "Same as billing?" toggle at the top. If toggle is on, the shipping fields are hidden and we copy from billing on save. If toggle is off, fields are shown and stored separately.
7. Payment terms (dropdown: Net 15 / Net 30 / Net 60 / Due on receipt / Custom)
8. Custom terms text field (only shown if Custom is picked)
9. Tax-exempt checkbox + number field (number shown only if checkbox is on)
10. Notes (textarea, optional)
11. Status (active / archived, default active; for new customers, only "active" is selectable; for edits, both are)

Modal footer: Cancel / Save. No "Save and new" — customers are slow-moving, not batch-entered.

### Auto-suggest + auto-create in manual entry modal

The Phase 1+2 manual entry modal's **Name** field is currently free-text. Phase 3 adds:

- **As the user types in the Name field**, an auto-suggest dropdown appears below the field showing customers whose name OR company contains the typed string, case-insensitive. Max 8 suggestions shown.
- **Each suggestion** shows: customer name (bold), company (muted), email (smaller, muted). Clicking a suggestion fills the Name field with the customer's name (or company if that's what they typed).
- **If the user types a string with no match**, a small prompt appears below the field: *"No match. Create '[typed text]' as a new customer?"* with a single "Create" link.
  - The prompt debounces — appears ~500ms after typing stops (not per-keystroke).
  - The prompt is small and inline, not a modal popup.
  - **Clicking "Create"** opens the New Customer modal with the Name field pre-filled with the typed text. The user fills in the rest of the customer details and saves. After save, the new customer is selected in the Name field of the manual entry modal (or, if they cancel the customer creation, the typed text remains as a name in the manual entry).
  - **The prompt does NOT block Save on the manual entry.** A user can save the manual entry with a name that has no match, prompt is advisory. The unlinked name is fine — the entry is posted, no customer is required.
- Same auto-suggest + auto-create prompt in the **Create Invoice** screen (when that ships in Phase 4). Same behavior. Single component, two surfaces.

### List page API

- `GET /api/v1/books/customers?search=&status=active&limit=100&offset=0` — returns `{data: [...], total: N}`.
- `GET /api/v1/books/customers/:id` — full record.
- `POST /api/v1/books/customers` — create.
- `PATCH /api/v1/books/customers/:id` — update (only the fields the user can change).
- `POST /api/v1/books/customers/:id/archive` — soft archive.
- `POST /api/v1/books/customers/:id/unarchive` — restore.
- `GET /api/v1/books/customers/search?q=...&limit=8` — for the auto-suggest. Returns minimal records (id, name, company, email). Optimized for fast response.

## Files to create / modify

### Server

- `server/db.js` — new `customers` table. Migration is additive (no changes to existing tables).
- `server/routes/books/customers.js` (new) — REST routes. 6 endpoints.
- `server/services/customerService.js` (new) — business logic, validation, search indexing.
- `server/scripts/test-customers-phase3.mjs` (new) — unit tests. Mirror the discipline of `test-gl-phase1-2.mjs`.
- `server/scripts/smoke-customers-api.sh` (new) — API smoke. Mirror the discipline of `smoke-phase1-2-api.sh`.

### Client

- `client/src/books/CustomersList.jsx` (replace existing) — new list page per the design above.
- `client/src/books/CustomerDetail.jsx` (new) — detail page.
- `client/src/books/CustomerFormModal.jsx` (new) — create / edit modal.
- `client/src/books/CustomerSuggest.jsx` (new) — auto-suggest dropdown component (used in manual entry modal AND in Phase 4 invoice form).
- `client/src/books/ManualEntryModal.jsx` (modify) — wire in `CustomerSuggest` for the Name field. Add the "Create [name]?" inline prompt.
- `client/src/books/api.js` (modify) — add `customersApi` with the 6 new methods.

### Tests

- `client/src/books/__tests__/CustomersList.test.jsx` (new) — list rendering, search, status filter, empty state.
- `client/src/books/__tests__/CustomerSuggest.test.jsx` (new) — auto-suggest debounce, max 8 results, no-match prompt shows.
- Playwright e2e: open manual entry modal → type a name with no match → see "Create" prompt → click it → modal opens with name pre-filled → save customer → new customer appears as a suggestion.

### Don't touch

- v1's existing `CustomerForm.jsx` and `CustomersList.jsx` are being replaced. The new files live at the same paths. Old v1 components can be deleted.
- Don't touch Phase 1+2 manual entry modal logic. Only modify the Name field to add the auto-suggest component. The sign convention, save logic, and 5-field default view stay untouched.
- The Phase 7 manual-entry layout polish is still deferred. Don't try to fix the layout here.
- Lore B's "Direction B: Settled Library" visual design is documented but not yet applied. Don't apply it here. Phase 3 ships with the current app's chrome; visual design overhaul is a separate future round.

## Definition of done

- [ ] Migration runs cleanly. Existing v1 customer data is migrated to the new schema (any v1 customer with a `name` becomes a v2 customer; missing fields stay null; `is_active` in v1 maps to `status='active'` if true, `status='archived'` if false).
- [ ] List page: search works, status filter works, sort works, pagination works, row click goes to detail, edit/archive actions work.
- [ ] Detail page: shows all customer fields, billing address, shipping address (collapsed if "same as billing"), payment terms, tax status, notes. Transactions section shows "No transactions yet" placeholder.
- [ ] Create / Edit modal: validates required fields, validates email format, hides custom-terms field unless Custom is picked, hides tax-exempt number unless checkbox is on, hides shipping fields when "same as billing" is on.
- [ ] Auto-suggest in manual entry modal: shows up to 8 matches, debounced 300ms, picks populate the field, no-match shows "Create" prompt.
- [ ] "Create [name]?" prompt: debounced 500ms, links to New Customer modal with name pre-filled, after save the new customer is selected in the Name field, cancel leaves the typed text as a name in the entry.
- [ ] All existing tests pass: 39+ unit (Phase 1+2), 15+ API smoke (Phase 1+2), 255 wireframe smoke. Plus new tests for Phase 3.
- [ ] Demo recorded: `demos/2026.07.XX-phase-3.mp4` covering the list page, create flow, auto-suggest in manual entry, and the create-from-prompt flow.
- [ ] Committed to `main` (or feature branch, Rusty decides). Single commit if small, logical sequence if large.

## When done

Push a completion event with:
- 2-3 line summary
- Commit hash(es) and branch
- Path to the demo
- Anything that came up that wasn't in the spec (especially around the migration of v1 customer data)
- Anything for Wren to scrutinize

## Out of scope

- Invoicing against customers (Phase 4)
- Payments against customers (Phase 5+)
- Tax calculation per customer (the tax-exempt flag is recorded but not yet enforced; that comes with invoicing)
- v2 visual design overhaul (Direction B: Settled Library) — separate future round
- Manual-entry modal layout polish (Phase 7) — separate future round
- Multi-currency (v3)
- Multi-user / permissions (v3)
