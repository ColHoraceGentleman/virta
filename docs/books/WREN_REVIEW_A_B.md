# WREN_REVIEW_A_B.md — Virta Books Phase A+B Code Review

**Reviewer:** Wren 🪶
**Date:** 2026-06-29
**Phases reviewed:** A (Foundation) + B (Invoicing)
**Model:** anthropic/claude-sonnet-4-6 reviewing minimax/MiniMax-M3 output

---

## Verdict

**PASS WITH CONDITIONS**

Solid work overall — no SQL injection, no plaintext passwords, no schema corruption risk. Foreign keys are on, migrations are idempotent, status transitions are guarded. Four issues need fixing before Phase C can land safely: one is a genuine security hole (shell injection via SMTP password), one is a correctness bug (payment race condition), and two are data integrity gaps that will silently corrupt bookkeeping. None require a redesign.

---

## BLOCKER findings

### B1 — Shell injection in `setSmtpPassword` (email.js line ~43)

**File:** `server/services/email.js`

```js
execSync(
  `security add-generic-password -s "${keychainService}" -a "smtp" -w "${String(password).replace(/"/g, '\\"')}" -U`,
  ...
)
```

The escape is `replace(/"/g, '\\"')` — double-quote escaping only. Any password containing `$`, backtick, `\`, or `!` will be interpreted by the shell. Example: a password of `pa$$word` expands `$$` to the current PID; a backtick in the password executes arbitrary commands as the Node process user.

`execSync` with a template-string command always runs through `/bin/sh`. The fix is to pass arguments as an **array via `spawn`/`execFile` with `shell: false`**, or use the `security` CLI's `-w` flag with a separate argument array so the shell never sees the raw password.

Severity: **BLOCKER** — shell injection on a user-supplied string in a server-side settings endpoint.

---

### B2 — Payment INSERT is not atomic with transition check (payments.js)

**File:** `server/routes/books/payments.js`, POST handler, lines ~67–82

```js
db.prepare(`INSERT INTO payments ...`).run(...);   // ← payment persisted

const tx = db.transaction(() => {
  maybeTransitionToPaid(body.invoice_id);          // ← transition check runs after
});
tx();
```

The INSERT happens outside the transaction. Between the INSERT and the `tx()` call, `maybeTransitionToPaid` reads the sum — which now includes the new payment row. That part is fine for single-threaded Node. But if the INSERT succeeds and then `tx()` throws (e.g., DB lock from the WAL writer or a rare SQLite error), you have a recorded payment with no status transition and no error surfaced to the client, leaving `invoice.status` stale.

The full operation — INSERT payment + status update — should be **a single `db.transaction(() => { ... })` block**. The cron is also in the same process, so the WAL lock scenario is uncommon but possible (node-cron fires async during an active write).

Severity: **BLOCKER** — can leave payments and invoice status inconsistent.

---

### B3 — `overdue` → `paid` transition bypasses the `draft` guard silently (invoices.js + overdueCron.js)

**File:** `server/routes/books/invoices.js`, `maybeTransitionToPaid`:

```js
if (inv.status !== 'sent' && inv.status !== 'overdue') return inv.status;
```

This is correct — `overdue` → `paid` is intended. The blocker is the **overdue cron** at `overdueCron.js`:

```js
UPDATE invoices SET status='overdue' WHERE status='sent' AND due_date < ?
```

And `runOverdueNotifications` then emails every invoice currently `overdue` — **not just the ones flipped this run**. If an invoice was already `overdue` from a previous sweep, it gets a new email every time the cron fires while `auto_mark_overdue = 1`. For a daily cron this means Chantelle's customers receive daily nagging emails until she manually marks the invoice paid or void. There is no `last_notified_at` guard.

This is called out in Cinder's report as a known v1 limitation ("v2 could track `last_notified_at`"), but it's misclassified. Sending repeated unwanted email to third-party customers is a **blocker**: it can damage Chantelle's business relationships and potentially violate spam regulations.

The fix before Phase C: track `notified_at` on the invoice (or a separate column), or limit `runOverdueNotifications` to invoices whose `status` just changed in this sweep (pass the list of changed IDs from `runOverdueSweep` to `runOverdueNotifications`).

Severity: **BLOCKER** — repeated automated email to customers is a deliverability/relationship risk.

---

### B4 — `PRAGMA foreign_keys = ON` is set — but only on the module-level singleton connection

**File:** `server/db.js`, line 18

```js
db.pragma('foreign_keys = ON');
```

This is correct. `better-sqlite3` uses a single persistent connection, and `PRAGMA foreign_keys = ON` is set at connection open. **This one is CLEAN** — I'm flagging it as reviewed and confirmed safe. No action needed.

---

### B5 — Invoice number generation: atomicity gap under restart, not under concurrency

**File:** `server/routes/books/invoices.js`, `generateNextInvoiceNumber`

The Cinder report claims this is safe because "single Node process." That's true for concurrency, but there's a window: `generateNextInvoiceNumber` runs **before** the outer `tx()` call that inserts the invoice. The number is computed and returned, then the invoice INSERT happens inside a separate transaction:

```js
const number = generateNextInvoiceNumber(year2);  // tx 1: reads MAX, returns number
const id = generateId();
const tx = db.transaction(() => {                  // tx 2: INSERT uses that number
  db.prepare(`INSERT INTO invoices (..., number, ...) ...`).run(id, ..., number, ...);
  ...
});
tx();
```

Between tx1 ending and tx2 starting, a concurrent caller (hypothetically) could grab the same number. In practice, single-process Node with synchronous `better-sqlite3` makes this effectively zero-risk. However, the `UNIQUE` constraint on `invoices.number` saves correctness — the INSERT would throw a UNIQUE violation and the caller gets a 409 retry hint. The `catch` block handles this:

```js
if (err.message && err.message.includes('UNIQUE')) {
  return res.status(409).json({ error: 'Invoice number collision; please retry', code: 'CONFLICT' });
}
```

**Assessment: safe for this single-user, single-process deployment.** The UNIQUE constraint is the backstop. Flagging for documentation clarity, not a code change. Not a blocker.

---

## SIGNIFICANT findings

### S1 — `PATCH /invoices/:id` silently ignores fields when status blocks them (invoices.js)

**File:** `server/routes/books/invoices.js`, PATCH handler, ~lines 183–215

For a `sent` or `overdue` invoice, if the client sends `{ issue_date: '2026-01-01' }` in the body, the handler checks `if (body.issue_date !== undefined && fullyEditable)` — fullyEditable is false — so the field is just skipped. No error, no warning. The client gets a 200 response with the unchanged value and no indication the field was ignored.

This is different from `paid`/`void` where rejected fields get an explicit 409. Inconsistent behavior will confuse future Cinder runs when implementing the edit UI. Should return 409 with a list of rejected fields (matching the paid/void guard pattern already in the code).

Severity: **SIGNIFICANT** — silent data loss from the client's perspective.

---

### S2 — Overdue cron errors are partially swallowed (overdueCron.js)

**File:** `server/services/overdueCron.js`

```js
cron.schedule(TASK_LABEL, async () => {
  try {
    ...
    runOverdueSweep();          // synchronous — no await, no return value check here
    await runOverdueNotifications();
  } catch (err) {
    console.error('[Books/OverdueCron] tick failed:', err.message);
  }
});
```

`runOverdueSweep()` is synchronous and doesn't throw under normal conditions, but if `db.prepare(...).run()` throws (e.g., DB locked during a concurrent write), the error propagates to the outer `catch` and is only logged — no alert, no retry. The DB lock case is rare with WAL mode but not impossible during a concurrent PATCH or backup.

More importantly: `runOverdueNotifications` catches per-invoice email failures with `console.warn` (correct), but if `getSmtpSettings()` or the transporter setup throws (misconfigured SMTP), the entire notification batch fails silently with only a `console.error` at the cron level.

Verdict: acceptable for a personal app with local access, but should add a daily-digest log line that summarizes sweep results (even on success) so there's something to grep if Chantelle asks "did the overdue email go out?"

Severity: **SIGNIFICANT** — silent failure path for overdue notifications.

---

### S3 — PDF route has no error boundary for `renderInvoicePdf` throwing (invoices.js)

**File:** `server/routes/books/invoices.js`, `GET /:id/pdf` route

```js
router.get('/:id/pdf', async (req, res) => {
  try {
    ...
    const buffer = await renderInvoicePdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    ...
    res.send(buffer);
  } catch (err) {
    console.error('[Books/Invoices] PDF render failed', err);
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});
```

The `catch` is there and correct. However, `renderInvoicePdf` itself does two DB reads (invoice + customer) and then calls `@react-pdf/renderer`'s `renderToBuffer`. If `renderToBuffer` throws — which it does on certain font/layout edge cases (extremely long description strings, null values in React elements, etc.) — the error message from `@react-pdf/renderer` is typically not user-friendly ("cannot read property of undefined" style).

The specific risk: the invoice's `notes` or a line item `description` containing a null character or certain Unicode sequences has been known to trip up react-pdf's text renderer. Since the catch returns JSON on a PDF content-type-prefixed response (the headers haven't been sent yet, so this is fine), the client side needs to handle a non-PDF response from the PDF URL. The `InvoiceView.jsx` opens the PDF in a new tab via `<a href=...>` — if the server returns JSON 500, the browser will display raw JSON in the tab. Not a crash, but confusing.

More importantly: the `/send` route also calls `renderInvoicePdf` and has the same catch — but if the PDF render fails after SMTP is verified and before `sendMail` is called, the invoice status does NOT get flipped to `sent` (the UPDATE is after the await). That's actually correct behavior. ✓

Severity: **SIGNIFICANT** — user-hostile error UX on PDF failure, but correctness is maintained.

---

### S4 — `sendInvoice` can flip draft→sent even if `sendMail` throws (invoices.js)

**File:** `server/routes/books/invoices.js`, POST `/:id/send`

```js
const pdfBuffer = await renderInvoicePdf(req.params.id);   // step 1
await sendInvoiceEmail({ ... });                            // step 2 — throws on SMTP failure
db.prepare(`UPDATE invoices SET status='sent' ...`).run(); // step 3 — only reached if step 2 succeeds
```

The ordering is correct — the UPDATE is after the await. If `sendInvoiceEmail` throws, the invoice stays `draft`. Good.

BUT: nodemailer's `sendMail` resolves successfully (doesn't throw) even if the mail is accepted by the SMTP server but ultimately bounces or is rejected post-acceptance. This is an SMTP protocol limitation, not a code bug — the app correctly models "sent" as "handed off to SMTP server." Documenting this so Phase C/E doesn't try to build "email delivered" semantics on top.

**Assessment: correct as implemented.** Not a bug.

---

### S5 — `DELETE /payments/:id` revert logic double-queries the invoice total (payments.js)

**File:** `server/routes/books/payments.js`, DELETE handler, ~lines 120–133

```js
db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);

const inv = db.prepare('SELECT id, status FROM invoices WHERE id = ?').get(existing.invoice_id);
if (inv && inv.status === 'paid') {
  const { total } = sumPayments(existing.invoice_id);
  if (total + 0.0001 < Number(db.prepare('SELECT total FROM invoices WHERE id = ?').get(existing.invoice_id).total)) {
    db.prepare(`UPDATE invoices SET status='sent' ...`).run(...);
  }
}
```

There are two separate queries for the invoice: one that fetches `status`, and another inside the conditional that re-fetches `total`. The `total` should be fetched in the first query. Minor inefficiency and readability issue, but not a correctness bug because `total` is immutable once an invoice is non-draft. Still: this entire block should be wrapped in a `db.transaction()` alongside the DELETE — same atomicity concern as B2.

Severity: **SIGNIFICANT** — atomicity gap (DELETE + revert should be one transaction).

---

### S6 — PATCH `/payments/:id` recomputes status outside a transaction (payments.js)

**File:** `server/routes/books/payments.js`, PATCH handler

Same pattern as B2/S5: the `UPDATE payments SET ...` runs, then `maybeTransitionToPaid` runs as a separate call (not inside a transaction). If anything throws between them, payment data and invoice status diverge.

Severity: **SIGNIFICANT** — same family as B2.

---

## DEBT findings

### D1 — Dashboard makes 3 API calls on load where 1 would do (Dashboard.jsx)

**File:** `client/src/books/Dashboard.jsx`

```js
const [accounts, customers, invoices] = await Promise.all([
  booksApi.listAccounts(),
  booksApi.listCustomers(),
  booksApi.listInvoices(),
]);
```

The health endpoint already returns `{ accounts: N, customers: N, invoices: N }`. For a count-only tile, this is 2 unnecessary full-list fetches. The existing `/api/v1/books/health` endpoint is perfect for the dashboard KPI tiles. Switch to `booksApi.health()` for the counts. Keep `listInvoices()` only if the dashboard eventually needs the actual rows (Phase F).

At Chantelle's scale (dozens of invoices) this is imperceptible, but it'll fetch every account and customer row on every dashboard load.

Severity: **DEBT**

---

### D2 — `InvoiceForm.jsx` `addDays` uses local time instead of UTC (InvoiceForm.jsx)

**File:** `client/src/books/InvoiceForm.jsx`, line ~14

```js
function addDays(yyyy_mm_dd, days) {
  const d = new Date(yyyy_mm_dd + 'T00:00:00');   // ← LOCAL time midnight
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}
```

The server's `addDaysToDate` correctly appends `'T00:00:00Z'` (UTC). The client version uses local time midnight (`'T00:00:00'` without `Z`), which means during DST transitions the computed due date in the UI can differ from what the server will compute on save. For a Mac in MDT (UTC-6), a `Net 30` invoice created at midnight would compute `issue_date + 30` correctly, but the sliced ISO string could be off by one day at DST boundaries.

The mismatch resolves on save (server recomputes and stores the authoritative value), but the preview in the form will show the wrong due date for a moment.

Fix: use `yyyy_mm_dd + 'T00:00:00Z'` to match the server.

Severity: **DEBT** — cosmetic/UX only; server value is authoritative.

---

### D3 — `BooksShell.jsx` routing: `path.split('/')[3]` is fragile for invoice IDs (BooksShell.jsx)

**File:** `client/src/books/BooksShell.jsx`, lines ~83–90

```js
} else if (path.startsWith('/books/invoices/') && path.endsWith('/edit')) {
  const id = path.split('/')[3];
  page = <InvoiceForm navigate={navigate} invoiceId={id} />;
} else if (path.startsWith('/books/invoices/')) {
  const id = path.split('/')[3];
  page = <InvoiceView navigate={navigate} invoiceId={id} />;
```

`path.split('/')[3]` for `/books/invoices/<uuid>/edit` gives `<uuid>` ✓. For `/books/invoices/<uuid>` it also gives `<uuid>` ✓. But for any sub-path like `/books/invoices/<uuid>/something-new` added in a later phase, `split('/')[3]` still gives `<uuid>` and the route match falls through to InvoiceView silently. This is fine now; it becomes a maintenance trap as routes accumulate.

Consider using URL pattern matching (or at minimum a regex) rather than positional split. Not urgent for Phase C since no new sub-routes are planned.

Severity: **DEBT**

---

### D4 — No index on `payments(invoice_id)` enforced with FK (db.js)

**File:** `server/db.js`

```sql
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id)
```

This index IS present. ✓

Also confirmed: `line_items(invoice_id)` index is present. ✓
`invoices(customer_id)` index is present. ✓

What's missing: there is **no index on `invoices(number)`** beyond the UNIQUE constraint. SQLite implements UNIQUE via a B-tree that is effectively an index, so lookups by `number` are covered by the UNIQUE constraint index. **This is fine.** Confirming clean.

One gap: `payments` has no FK cascade (`ON DELETE CASCADE` or `ON DELETE RESTRICT`). If a payment's invoice is deleted (currently blocked for non-drafts, and drafts have a payment guard), orphaned payment rows would not be detected at the DB layer. At Chantelle's scale this is purely academic, but worth noting for Phase C when the schema gets more complex.

Severity: **DEBT**

---

### D5 — `2200 Owner Draws / Equity` is classified as `liability` but belongs in equity (db.js seed)

**File:** `server/db.js`, seed accounts

```js
{ code: '2200', name: 'Owner Draws / Equity', account_type: 'liability', irs_line: 'n/a' },
```

Owner draws are a reduction of equity, not a liability. Classifying as `liability` means Phase E's Schedule C export and Phase F's balance sheet will show owner draws on the wrong side. The spec's table also lists it under Liabilities (it's a spec error, not a Cinder error), but it will cause incorrect financial reporting.

The account should be `account_type: 'equity'`. This is a seed-time-only issue — easy to fix before any real data is entered.

Severity: **DEBT** (but worth fixing before Chantelle enters any real draws, since it affects Schedule C correctness)

---

### D6 — `PaymentsIn.jsx` candidate match logic has an O(n²) `invoices.find` inside a loop (PaymentsIn.jsx)

**File:** `client/src/books/PaymentsIn.jsx`, `candidatesByPayment` useMemo

```js
.filter(i => Math.abs(Number(i.total) - Number(p.amount)) < 0.01
          || (Number(i.total) - (Number(invoices.find(x => x.id === i.id)?.payments_total || 0))) >= Number(p.amount))
```

`invoices.find(x => x.id === i.id)` inside a filter that's already iterating `openInvoices` (which is a subset of `invoices`) does a linear scan of `invoices` for every open invoice per payment. At Chantelle's scale (say 50 payments × 20 open invoices = 1000 linear scans) this is fine. But it's also self-defeating: `i` IS already the invoice being examined, so `invoices.find(x => x.id === i.id)` just returns `i` itself. The `payments_total` would need to come from a separate source (not available in the list endpoint which doesn't hydrate payments). This condition will always use 0 for `payments_total` and thus always pass for any invoice with a total >= payment amount — the match is broader than intended.

Fix: either accept the approximation (fine for v1), or change the list endpoint to include `payments_total` in the lightweight response.

Severity: **DEBT**

---

### D7 — `CustomersList.jsx` triggers a full reload on every keystroke of the search input

**File:** `client/src/books/CustomersList.jsx`

```js
useEffect(load, [q]);
```

`q` changes on every keystroke, so each character fires a new fetch to the server. The customers list is small (< 100 rows), so this works, but it should be debounced (300ms) before Phase C when the transaction list could be much larger. Not a problem now.

Severity: **DEBT**

---

### D8 — `accounts.js` PATCH allows changing `account_type` on an existing account (accounts.js)

**File:** `server/routes/books/accounts.js`, PATCH handler

```js
if (account_type !== undefined) {
  if (!['income','expense','asset','liability','equity'].includes(account_type)) { ... }
  updates.push('account_type = ?'); values.push(account_type);
}
```

The spec says "`account_type` is immutable after creation" (implied by the merge cross-type block). Allowing type changes on an existing account means a user could reclassify `6000 Advertising & Marketing` from `expense` to `income`, silently changing every journal entry that references it. The UI doesn't expose this field on edit (AccountForm only edits code/name/irs_line), but the API allows it. Should add a guard: if account has any dependents, reject `account_type` change; if no dependents, allow but warn.

Severity: **DEBT**

---

## Clean areas

**`foreign_keys = ON` is set correctly** — confirmed in `db.js` line 18. SQLite's foreign key enforcement is opt-in per connection; getting this right from the start is non-obvious and Cinder nailed it.

**SMTP password isolation is solid** — password never touches the DB, logs, or wire. The `smtp_password_set` boolean pattern (check presence without revealing the value) is the right design. The `actuallyCheckPasswordIsSet` function correctly calls `getSmtpPassword` on GET to give the UI an accurate "is it set?" signal without caching.

**All SQL uses parameterized queries** — reviewed every `db.prepare(...).run(...)` and `db.prepare(...).get(...)` call across all five route files. Zero instances of string interpolation into SQL. The dynamic `UPDATE SET ${updates.join(', ')}` pattern builds column names from allowlisted arrays (`ALLOWED_FIELDS`), not from user input, so no injection surface there either.

**Migration idempotency is genuine** — `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` + the seed count-guard (`if (accountCount.count === 0)`) mean the db.js initialization block can run on every boot without corrupting data. The Phase A → Phase B transition adds new tables without touching existing ones.

**Status machine guards are thorough** — void→paid is blocked (B4 confirmed clean), draft→anything requires explicit send/void, the `maybeTransitionToPaid` function correctly handles both `sent` and `overdue` as valid predecessor states. The `0.0001` epsilon for floating-point comparison is appropriate given that totals are computed as `REAL` in SQLite.

**React components are free of key prop bugs** — all list renders use stable keys (account IDs, customer IDs, payment IDs, invoice IDs). Line items in InvoiceForm use array index as key, which is acceptable here because items are only reordered/removed (no async identity mismatch risk in this use case).

**`BooksShell.jsx` routing correctly handles the `popstate` event** — the `usePath` hook listens for back/forward navigation and re-renders. The 100ms polling approach from Phase A is gone in Phase B (replaced by the `popstate` listener + direct `setPath` on `navigate`). Clean.

---

## Recommendation

**Fix B1, B2, B3 before Phase C. Fix S5 and S6 alongside B2 (same transaction pattern — one pass fixes all three). Then spawn Echo for QA.**

Specific fix order:
1. **B1** (shell injection): swap `execSync` with template string → `execFile`/`spawnSync` with args array, `shell: false`. ~10 lines in `email.js`.
2. **B2 + S5 + S6** (atomicity): wrap payment INSERT + transition, payment DELETE + revert, and payment PATCH + transition each into a single `db.transaction()`. ~20 lines total across `payments.js`.
3. **B3** (repeated overdue email): pass the list of newly-flipped invoice IDs from `runOverdueSweep()` into `runOverdueNotifications()` and filter to only those IDs. ~15 lines across `overdueCron.js`.

DEBT items D1–D8 are fine to defer to Phase C cleanup or their natural phase (D5 should go before any real owner draw entries). None of them block Phase C correctness.

**Do not hold Phase C** for the SIGNIFICANT findings (S1, S2, S3) — they are real but survivable in a single-user personal app context. Fix them in the Phase C pass alongside new code.

**Spawn Echo for QA after the B-series fixes are applied**, not before. The current build is functionally correct enough for a first pass, but Echo testing against B2-unfixed code would be testing a race condition that will be gone in an hour.

---

*Review complete. Path: `/Users/colonelhoracegentleman/clawd/projects/accounting-app/WREN_REVIEW_A_B.md`*
