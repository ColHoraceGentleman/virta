# Wren Code Review — Round 26 (Manual-Entry Modal Redesign)

**Commit:** `e84f780a9b236705ac8c185859fdb0fd1721463b`
**Reviewer:** Wren
**Verdict: FAIL — one BLOCKER. D70 (Sage warning) does not fire from real user interaction. Everything else is solid and can ship once the blocker is fixed.**

The collapse/expand pattern (D62), the footer redesign (D71), and the spec/doc updates are all well executed and match the brief. But the headline new feature of this round — the Sage-style import warning — is dead code from the user's perspective. It only "works" in the smoke test because the test calls the internal function directly with a string, bypassing the actual DOM wiring a real user goes through. I verified this by driving the modal exactly the way a browser would (`select.value = code; dispatchEvent('change')`) and the warning never appears.

---

## BLOCKER

### 1. `__jeCheckMatched` reads `<option value>` (the account **code**), but the token match is against the account **name** — the warning never fires for a real user

**File:** `docs/books/setup-wizard/WIREFRAMES.html`, lines 302–307, 1107, 1159–1169

The `<select id="je-other">` options are built by `accountOptionList()`:

```js
// line 302-307
function accountOptionList(opts){
  const filterType = opts && opts.filterType;
  let all = [...state.income,...state.expenses,...state.other].filter(a=>!a.system);
  if(filterType) all = all.filter(a => a.type === filterType);
  return all.map(a=>`<option value="${esc(a.code)}" data-type="${esc(a.type)}">${esc(accountLabel(a))}</option>`).join('');
}
```

`value` is `a.code` (e.g. `"1010"`), the visible **text** is `accountLabel(a)` (e.g. `"Business Checking"`). The `onchange` handler passes the raw select element:

```js
// line 1107
<select id="je-other" onchange="window.__jeCheckMatched(this)">${accountOptionList()}</select>
```

And the handler reads `.value`:

```js
// lines 1159-1168
window.__jeCheckMatched = (arg)=>{
  let value = '';
  if (typeof arg === 'string') value = arg;
  else if (arg && typeof arg.value === 'string') value = arg.value;
  ...
  const lower = (value || '').toLowerCase();
  const isImport = !!lower && tokens.some(t => lower.includes(t));
  warnEl.style.display = isImport ? '' : 'none';
};
```

So on a real `onchange`, `arg.value` is `"1010"` — a numeric code, never a string containing `checking`, `bank`, `stripe`, etc. `isImport` is always `false` for any real selection. I reproduced this directly in jsdom by picking the "Business Checking" option and firing a genuine `change` event through `dispatchEvent` — the exact code path a browser triggers — and the warning stayed hidden:

```
After REAL user pick of "Business Checking" via dispatchEvent(change):
  select.value = 1010
  warning display = none   <-- should be "" (visible)
```

**Why the smoke test passed:** the R26 assertions (smoke test lines ~739–758) never touch the `<select>` element at all for the positive/negative cases. They call `window.__jeCheckMatched('Business Checking')` — a raw **string**, not the DOM element — which takes the `typeof arg === 'string'` branch and matches the token directly. That branch has no code-vs-name mismatch because it skips the DOM lookup entirely. The test is exercising a code path (`__jeCheckMatched(string)`) that production markup never calls. `__jeToggleField('matched', true)` (line 1145–1146) also calls `__jeCheckMatched(sel)` with the real select — same bug on expand.

**Impact:** D70, the actual point of this round along with D62, silently does nothing for every real user. Nobody will ever see the warning by picking an account from the dropdown. This is the single most novel/user-facing piece of this commit and it's non-functional.

**Fix options (either is small):**
- (a) In `__jeCheckMatched`, when `arg` is an element, resolve the **selected option's text**, not `.value`: `arg.options[arg.selectedIndex]?.text` (or `accountLabel` lookup by code against `state.income/expenses/other`), then run the token match against that string. Also fix `__jeToggleField`'s internal call at line 1145-1146 to pass the same resolved text (or just pass the element and let `__jeCheckMatched` resolve it internally, which is what should happen).
- (b) Add `data-name="${esc(a.name)}"` to each `<option>` in `accountOptionList()` and read `arg.options[arg.selectedIndex].dataset.name` in `__jeCheckMatched`.

Either fix needs a **smoke test rewrite** for the positive-case assertions: they must pick a real `<option>` in the DOM and fire (or simulate) `onchange`, not call the string-argument branch. As written, that branch also validates nothing about production correctness and should probably be removed or clearly marked test-only once the element-based path is fixed.

---

## SIGNIFICANT

### 2. `Save (primary)` button label is user-visible, literal text

**File:** `docs/books/setup-wizard/WIREFRAMES.html`, line 1127

```js
{'Save (primary)':'window.__jeSave(false)'}
```

`__openModal` (line 1021) renders the object key as the visible button label verbatim (`esc(label)`), so the button reads **"Save (primary)"** on screen, not "Save". This is a real UI regression, not a naming nit — a live user will see `(primary)` printed in the footer. Cinder flagged this exact tradeoff in the FEEDBACK doc (item 1 under "Decisions / deviations") and offered the fix: add an explicit `primary: true` flag read by `__openModal` instead of regex-matching the label text. That's the right call — do it now rather than defer, since it's currently shipping visibly-wrong copy. Every other button in the file (`Delete`, `Cancel`, `Save`, `Next →`, etc.) uses clean, literal, user-facing text; this is the only button anywhere in the file whose key encodes styling instructions into the display string. Should be fixed before this goes to Patrick/Echo — it will read as an obvious bug the moment anyone opens the modal in a browser.

### 3. Reset-to-blank on `<select id="je-other">` doesn't select a "none picked" state — it silently falls through to whatever the browser index-0-defaults to

**File:** `docs/books/setup-wizard/WIREFRAMES.html`, lines 1173–1188 (`__jeSave`), combined with line 1107 (no blank `<option>` in `accountOptionList()`)

```js
const setVal = (id, v)=>{ const el = document.getElementById(id); if (el) el.value = v; };
...
setVal('je-other', '');
```

There is no `<option value="">` in the Matched-with select, so `el.value = ''` doesn't match any option; jsdom (and real browsers) leave `selectedIndex = -1` with `.value === ''` reported, but the **rendered UI shows the browser's fallback behavior for an unmatched value**, which in most real browsers actually snaps back to selecting index 0 (`"Sales"`, an unrelated Income account) rather than showing blank. I confirmed the `.value` after `__jeSave(true)` reports `""` and `selectedIndex === -1` in jsdom's headless model, but this is exactly the kind of state that renders inconsistently across real browsers versus jsdom — Chrome will typically re-select index 0 visually once the element is next interacted with or re-rendered, because there's no actual blank option to bind `-1`/`""` to. On the **next** expand of "Matched with" for the next entry (a very likely flow given "Save and new" exists specifically to speed up multi-entry sessions), the user has no way to tell the field wasn't explicitly picked — it may visually show "Sales" or another non-cash account with no warning and no indication it's a leftover/default state, when the actual intended default per D62/the field's own helper text is "your default cash account from Setup Wizard." That default-cash-account behavior isn't implemented anywhere in this file (see NIT 3), so today it just reads whatever ends up at index 0.

**Recommendation:** add a real placeholder option (`<option value="" disabled selected>Choose an account…</option>`) to the Matched-with select so `setVal('je-other','')` actually clears the visible selection instead of falling back to an arbitrary account.

### 4. Warning does not persist across expand → remove → re-expand of the *same* import-driven account

**File:** `docs/books/setup-wizard/WIREFRAMES.html`, lines 1136–1157

Verified directly: expand Matched with, pick "Business Checking" (warning shows via forced test call), click remove (warning correctly hides — that's fine, field is gone), click "+ Add Matched with" again. The select retains its prior value (`1010`, good — value isn't cleared by toggle), and `__jeToggleField` does re-run `__jeCheckMatched(sel)` on re-expand (line 1145-1146, so the *intent* is right) — but because of BLOCKER #1, the warning still doesn't come back even though the same import-driven account is still selected. This is really BLOCKER #1's downstream symptom, not a separate bug, but it's worth calling out because it's one of the specific edge cases in the review brief ("expand Matched with, picks a non-import account, then changes Type — does the warning clear?" and the remove/re-add case) — the answer today is "yes it clears, but it also never comes back correctly," which is a worse experience than either fully-broken or fully-working.

---

## Edge cases checked (per review brief)

| Scenario | Result |
|---|---|
| Expand Matched with, pick non-import account, then change Type — does warning clear? | **Yes**, correctly. `__jeRenderBody` doesn't touch `#je-matched-warn` directly, and since the warning was never showing in the first place (BLOCKER #1), it stays hidden — technically "clears" but only because it was never lit. Also note: `#je-other`'s **selected value is not reset or re-validated** when Type changes (line 1049-1053, `render(type)` only touches `#je-account`, not `#je-other`) — the Matched-with selection is Type-independent by design (it's "the other side," can be any account), so this is correct, not a bug. |
| Add description → fill → remove → add description again — value gone or restored? | **Value is restored** (verified: typed "test value 123", removed, re-expanded, value still "test value 123"). This is because `__jeToggleField` only toggles `display`, it never clears the `<input>`'s value or removes the DOM node. **This is very likely the correct/expected behavior** for a "remove" link in this pattern (FreshBooks-style collapse is a visibility toggle, not a delete-and-recreate) — a user who fat-fingers "remove" and immediately re-expands would be annoyed to lose their typed text. Not calling this a bug, but it is worth confirming intent: if "remove" is meant to *discard* the value (matching the word "remove" literally), this is a mismatch. Given D71 elsewhere explicitly clears fields only on Save-and-new (not on remove), I read this as intentional — but the brief listed it as "might be a bug," so flagging as a judgment call for Rusty/Patrick, not Wren's call to make. |
| Click Save and new rapidly twice — clean reset? | **Yes.** No exceptions, no stale state; `je-change`, `je-name`, `je-desc`, `je-other`, `je-note` are all blanked, fields re-collapse, no double-fire issues since `closeModal()` isn't involved in this path and there's no async work to race. |
| `__jeSave({keepOpen:false})` placeholder clearly marked? | **Yes** — inline comment block at lines 1170-1172 explicitly says "Placeholder until Phase 2 GL architecture lands" and "posts (no-op for now)" for both branches. Commit message and FEEDBACK doc both call this out too. No concern here. Minor: the function signature is actually `__jeSave(keepOpen)` (a plain boolean), not `__jeSave({keepOpen})` as the review brief's phrasing suggested — the brief's wording doesn't match the code, but the code itself is fine and consistently invoked as `__jeSave(true)` / `__jeSave(false)` everywhere (footer buttons, comments, FEEDBACK doc). Not a code issue, just noting for anyone tracing this from the brief text. |

---

## Smoke test quality

- **255/255 confirmed** by running `node docs/books/setup-wizard/tests/wf-smoke.mjs` directly.
- **The 3 warning assertions (positive/negative/bonus, smoke test lines ~741–758) are false positives relative to production behavior.** They call `window.__jeCheckMatched('Business Checking')`, `('Office Supplies')`, `('Stripe')` — raw strings — instead of driving the actual `<select>` element the way `onchange="window.__jeCheckMatched(this)"` does in production. This is the root reason BLOCKER #1 shipped with a green test suite. The test *validates the token-matching logic in isolation* (which is fine and correct), but does **not** validate that a real user interaction reaches that logic with the right input. This is the most important smoke-test gap in the round.
- Assertion 12 ("Account dropdown is populated... >=10 options... got 33") is a reasonable sanity check but is loose enough (`>=10`) that it wouldn't have caught a filtering regression; not a blocker, just noting it's a weak assertion, consistent with how loose some of the pre-existing counts checks are elsewhere in the file (e.g. R15 dedupe checks) — not a new problem introduced this round.
- Assertion 6/7/8 (footer buttons) correctly regex-match the actual rendered HTML including the `class="primary"` attribute — these are good, and they're exactly what caught (for me, manually) the literal "(primary)" text problem: the regex only checks for the class attribute and the onclick handler, never the label text, so a human reviewer has to actually read the rendered HTML to catch SIGNIFICANT #2. Recommend a smoke-test assertion that the Save button's **visible text** is exactly `"Save"` (not `"Save (primary)"`), which would have caught #2 automatically.
- Assertions 9–11 (expand/remove Description) are solid and match real DOM structure/behavior as I independently verified.
- The R19-move (Description placeholder check moved to after expansion, smoke test lines ~712–716) is done correctly and is exactly what the task brief asked for.
- No untested behaviors that I'd call must-fix beyond the warning gap above. The double-Save-and-new and Type-switch-preserves-Date/Type paths aren't explicitly asserted in the smoke test, but I verified them manually and they're correct — recommend adding them as regression coverage given "Save and new" is a new stateful button, but not blocking.

---

## Style / structure

- Follows existing file conventions well: `id="je-*"` naming matches the pre-existing `je-date`/`je-type`/`je-account`/`je-change`/`je-desc`/`je-other`/`je-note` scheme from earlier rounds. New helper functions (`__jeToggleField`, `__jeCheckMatched`, `__jeSave`) are attached to `window` exactly like every other modal helper in the file (`__openEdit`, `__openMerge`, `__commitAdd`, etc.) — consistent.
- CSS additions (`.je-add-link`, `.je-remove-link`, `.je-field-head`, lines 67–72) are scoped, minimal, and reuse existing custom properties (`var(--info)`, `var(--muted)`, `var(--ink-soft)`) rather than introducing new colors — good, matches the file's existing pattern of theming through CSS vars.
- Reuse of `.softwarn` for the new Sage warning (line 1109) is the right call — same visual language as the existing "manual accounting adjustment" box at the bottom of the modal, no new visual pattern introduced for no reason.
- Comment style at the top of `__openManualEntry` (lines 1028–1035) follows the file's existing convention of a block comment documenting the "why" above a function — consistent with round 18/24/25's comments already in the file.
- `__jeToggleField`'s dual role (toggling any of 3 fields via a string param, plus special-casing `'matched'` to also fire the warning check) is a reasonable amount of shared logic for 3 near-identical fields; not overengineered, not a hack.
- One structural nit: `__jeCheckMatched` accepting either a string or an element (lines 1159–1162) is flagged by Cinder themselves in the FEEDBACK doc as intentional for testability, but it's exactly what let the smoke test bypass the real bug (BLOCKER #1). Dual-mode functions like this are a code smell specifically because they let tests exercise a path production code never takes — worth remembering for future rounds: test the actual call site's argument shape, not a convenience overload.

---

## Spec doc changes

- **D62 revision** (SETUP_AND_CATEGORIES.md, diff lines around the `D62` row) is accurate and matches the implementation: 8 fields total, 5 default-visible, 3 collapsed behind `+ Add X`, remove links, Type-picker-first preserved, D63/D64 references intact. No conflicts with prior rounds' text.
- **D65 reword** ("single Save action" replacing "single Save button", with a parenthetical carving out Save-and-new as a fast-path variant) correctly resolves what would otherwise be a direct contradiction between D65 ("single Save button") and the new D71 (3-button footer). Good catch by Cinder — this is exactly the kind of spec-consistency issue Wren should be checking for, and it's already handled correctly.
- **D70** locks the token list, copy, and onchange-recheck behavior precisely as implemented (matches lines 1159–1168 word for word on the copy string). No drift between spec and code on the *text* of the feature — the drift is purely in the *wiring* (BLOCKER #1), which the spec doesn't and can't capture.
- **D71** locks button order (Save and new / Cancel / Save), reset field list, and the `class="primary"` convention — all match the implementation, including the literal `(primary)` label quirk (the spec doesn't call out the visible-label issue, which is fair since that's an implementation detail, not a decision).
- No conflicts found against D59 (GL columns), D63 (sign convention, untouched), D65 (resolved above), D66 (audit — not implicated by this round, `__jeSave` is still a no-op so nothing to audit yet, consistent with "Phase 2" framing).
- `VIRTA_BOOKS_V2.md` counts are accurate: I confirmed `wc -l` gives 1554 (wireframe) and 872 (spec) lines, matching the commit message and the artifact table exactly.

---

## What passed

- `git show e84f780` diff matches the commit message claims (file list, line deltas) exactly.
- `node docs/books/setup-wizard/tests/wf-smoke.mjs` → **255/255 passing**, confirmed independently.
- 5-field default view (Date, Type, Category, Name, Amount) renders correctly; the 3 optional fields are genuinely `display:none` at modal-open, confirmed via jsdom `getComputedStyle`.
- `+ Add description` / `+ Add Matched with` / `+ Add note` expand/collapse correctly toggles the field wrapper and the link wrapper in both directions.
- "Remove" link is present and functional on all 3 expandable fields; collapsing back to the `+ Add X` link works.
- Footer button order matches D71 exactly: Save and new (left) → Cancel (middle) → Save (right), verified via rendered HTML.
- Save button correctly gets `class="primary"` via the existing `__openModal` label-regex convention (mechanism works; only the visible text is wrong — see SIGNIFICANT #2).
- Type-picker-first / Category-filtered-by-Type is untouched and still works after this round's changes (verified Liability/Income/Asset/Equity switches all correctly re-filter the Category dropdown).
- Sign convention (D63) and Amount helper copy are untouched, exactly as the "Don't do" list in the task brief required.
- `Save and new` correctly resets Amount/Name/Description/Matched-with/Notes, collapses optional fields, and **preserves Type and Date** — verified this explicitly by setting Type=Liability and Date=2020-01-01, calling Save-and-new, and confirming both values survive (matches D71's exact wording).
- Rapid double-click on Save and new is safe — no exceptions, no double-application bugs, clean idempotent reset.
- `__jeSave` is clearly marked as a Phase 2 placeholder in both code comments and the FEEDBACK doc; no real GL posting logic was added, matching the "Don't do" constraint.
- No untracked debug files left in the repo from this round (checked `git status` implicitly via the diff stat matching exactly 5 files).
- Spec/doc consistency (D62/D65/D70/D71) is well-handled with no contradictions against prior decisions.

---

## Recommendations (ordered by severity)

1. **[BLOCKER]** Fix `__jeCheckMatched` (and its caller in `__jeToggleField`) to resolve the **selected option's display text or account name**, not `.value` (the numeric code), before running the token match. Add `data-name` to the `<option>` elements in `accountOptionList()` as the cleanest fix. Then rewrite the 3 warning-related smoke test assertions to drive the actual `<select>` element (set `.value` to a real option's value and either call `__jeCheckMatched(select)` or dispatch a real `change` event) instead of calling the function with a bare string. This must be fixed before Echo/QA — right now the round's signature new feature is inert for every real user.
2. **[SIGNIFICANT]** Change `{'Save (primary)':'window.__jeSave(false)'}` to a clean `Save` label. Either hardcode `class="primary"` directly on this one footer button bypassing `__openModal`'s regex convention, or (better, since Cinder already proposed it) add a `primary: true` flag to the button-object convention in `__openModal` and update this one call site. Small change, should happen before ship — otherwise "Save (primary)" is going to be the first thing anyone testing this notices.
3. **[SIGNIFICANT]** Add a real blank/placeholder `<option>` to the Matched-with select so `__jeSave(true)`'s `setVal('je-other','')` clears the visible selection instead of leaving the select in an ambiguous unmatched-value state that browsers may render as "first option selected" with no visual cue it's a leftover.
4. **[SIGNIFICANT]** Once #1 is fixed, re-verify the expand→remove→re-expand-same-account case actually re-shows the warning (currently masked by #1; should self-resolve but worth a manual re-check after the fix lands).
5. **[NIT]** Confirm with Patrick/Rusty whether "remove" on Description/Matched with/Notes is intended to *clear the value* or just *hide the field* (currently: hide only, value persists on re-expand). Current behavior seems reasonable but doesn't literally match the word "remove."
6. **[NIT]** Add smoke-test coverage for: (a) Save-and-new preserving Type/Date across a reset, (b) double-click Save-and-new safety. Both currently pass but aren't explicitly asserted — worth locking in as regression tests given this is new stateful behavior.
7. **[NIT]** Add a smoke-test assertion on the Save button's exact **visible text** (`"Save"`, not `"Save (primary)"`) — this specific class of bug (styling-token leaking into display text) is exactly what a text-content assertion would catch that the current `class="primary"` regex assertion doesn't.

---

## Ready to advance to Echo (QA)?

**No — not yet.** Fix BLOCKER #1 (and ideally SIGNIFICANT #2, since it's a one-line, ~10-minute fix) first, re-run the smoke test with corrected assertions, then it's ready for Echo. Everything else (D62 collapse pattern, D71 footer, spec docs) is solid and doesn't need another full review pass — just confirm the fix and the updated smoke-test assertions actually exercise the real DOM interaction path before handing off.
