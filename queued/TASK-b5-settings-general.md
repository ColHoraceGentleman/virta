# TASK — B5: Settings → General (business name, EIN, currency, locale)

**Status:** READY — spawn after B4 demos cleanly
**Phase:** v2 Settings → General (per `SETUP_AND_CATEGORIES.md` §9 Settings → Categories; General section per §4.3 settings table)
**Author:** Rusty (per Patrick's "build everything in the wireframes" call 2026-07-13 10:39 MDT; locale toggle added 2026-07-13 13:57 MDT)
**Date:** 2026-07-13 13:58 MDT
**Branch:** `main`

---

## Why this is a separate build

Settings surfaces are independently demoable. Splitting each tab into its own build per §5.11 cadence.

---

## Prerequisites

- B1a/B1b landed: Transactions polish + Categories CRUD working.
- B2a/B2b landed: Setup Wizard complete; `businesses` row exists.
- B3a/B3b landed: Categories Wizard complete; `accounts` populated.
- B4 landed: Categories Management post-wizard CRUD working.

**Read those reports first** to confirm prerequisites.

---

## Scope of THIS build (B5 only)

### 1. Settings → General section

Per `SETUP_AND_CATEGORIES.md` §9 + §4.3 (settings table).

The Settings page exists as a stub today (uses `ComingSoonStub` from B1 round 1's rewrite). For B5:

- Activate the Settings page route (`/books/settings`) with **two tabs**: General (B5) and Categories (B6). For B5, render Categories tab as a "Coming in B6" placeholder.
- **General tab** contents:
  - Business name (text, from `businesses.business_name`)
  - EIN (text, masked display, editable, from `businesses.ein`)
  - Currency (single-select dropdown, USD only in v2 — other currencies v3+)
  - **Date format locale** (single-select: `MM/DD/YYYY` (US, default) | `YYYY/MM/DD` (ISO) | `DD/MM/YYYY` (European)). Per Patrick's call 2026-07-13 13:57 MDT — default US, user can switch in Settings. Writes to `settings.date_format` via PUT /settings/date_format.
  - **Restart setup wizard** button (per Patrick's call 2026-07-13 14:01 MDT). Visible only when `setupCompletedAt !== null` (i.e., setup is done — the user is past first-run). Click → confirmation modal "Restart the setup wizard? Your current business data will be kept, but you'll be asked to walk through the steps again." On confirm: clear `localStorage` wizard state, navigate to `/books/setup`.
  - **Note:** this "Restart wizard" affordance is **temporary**. Patrick flagged (2026-07-13 14:01 MDT) that it should be removed once the full Books surface is built (post-B8+). Track as a v3 cleanup task. Don't add a separate TODO file for this — keep a note in the B5 report's "out-of-scope future cleanup" section.
  - Save / Cancel buttons (the Restart button is separate, doesn't go through the Save flow)
  - All form fields write through to `PATCH /businesses/current`

### 2. Locale-aware date parsing

The Transactions page's flexible date parser currently assumes US M/D/Y order. Per Patrick's call 2026-07-13 13:57 MDT, this is correct as the v1 default but must respect a user-configurable locale setting.

- New setting: `settings.date_format`. Values: `'MDY'` (US, default) | `'YMD'` (ISO) | `'DMY'` (European).
- Transactions.jsx reads this setting on mount and stores it in component state.
- The `parseFlexibleDate(input)` function takes the locale as a parameter (instead of hardcoding US) and parses accordingly.
- The placeholder text on the date inputs updates to match the locale: "MM/DD/YYYY" / "YYYY/MM/DD" / "DD/MM/YYYY".
- When the user changes the locale in Settings, the next time they mount Transactions, the parser uses the new locale.

**Edge cases:**
- Locale change while the user has invalid partial input typed → field clears on locale change (otherwise ambiguity is dangerous).
- Locale change while user has a valid date in the field → field re-renders in the new locale's format.

### 3. Files to touch / create

- `client/src/books/Settings.jsx` — replace `ComingSoonStub` with real Settings implementation (tabs).
- `client/src/books/SettingsGeneral.jsx` (new) — the General tab.
- `client/src/books/Transactions.jsx` — read date_format setting on mount, thread locale into parseFlexibleDate.
- `client/src/books/api.js` — add `updateCurrentBusiness`, `getSetting`, `updateSetting` methods.
- `client/src/books/SetupWizard.jsx` — verify the wizard clears localStorage correctly when navigated-to via the Restart button. If the wizard's mount logic doesn't already check for clear-on-entry, add that.

### 4. Don't break

- B1a Transactions polish (default locale = MDY preserves existing behavior).
- B1b Categories CRUD
- B2a/B2b Setup Wizard (note: B2a removed Setup Wizard from sidebar; B5 doesn't add it back).
- B3a/B3b Categories Wizard
- B4 Categories Management post-wizard CRUD
- Wireframe smoke (255/255)
- The `_stub-template.jsx` file (still used by other pages if any).

### 5. Build behaviors (Test coverage)

| Behavior ID | Name | Verifies |
|---|---|---|
| VB-SET-GEN-01 | Settings page renders with General + Categories tabs | ✓ |
| VB-SET-GEN-02 | General tab shows business name field populated from /businesses/current | ✓ |
| VB-SET-GEN-03 | General tab shows EIN field (masked) populated from /businesses/current | ✓ |
| VB-SET-GEN-04 | General tab shows currency dropdown (USD only for v2) | ✓ |
| VB-SET-GEN-05 | Save button PATCHes /businesses/current | ✓ |
| VB-SET-GEN-06 | Cancel button reverts unsaved changes | ✓ |
| VB-SET-GEN-07 | Date format dropdown shows MDY / YMD / DMY options | ✓ |
| VB-SET-GEN-08 | Default date format = MDY (US) | ✓ |
| VB-SET-GEN-09 | Save persists date format to settings.date_format via PUT | ✓ |
| VB-SET-DATE-LOCALE-01 | Transactions page reads date_format setting on mount | ✓ |
| VB-SET-DATE-LOCALE-02 | MDY locale parses `5/8/26` as May 8 | ✓ |
| VB-SET-DATE-LOCALE-03 | YMD locale parses `26/5/8` as May 8 | ✓ |
| VB-SET-DATE-LOCALE-04 | DMY locale parses `8/5/26` as May 8 | ✓ |
| VB-SET-DATE-LOCALE-05 | Date input placeholder updates to match locale | ✓ |
| VB-SET-RESTART-01 | "Restart setup wizard" button visible only when setupCompletedAt !== null | ✓ |
| VB-SET-RESTART-02 | Restart button shows confirmation modal before clearing state | ✓ |
| VB-SET-RESTART-03 | Confirmed restart clears localStorage wizard state and navigates to /books/setup | ✓ |

### 6. Definition of done

- [ ] Read prior build reports first.
- [ ] Settings page renders General + Categories tabs (Categories as B6 placeholder).
- [ ] All 17 behavior IDs in Test coverage.
- [ ] Demo recorded: `demos/2026.07.13-b5-settings-general.mp4` (silent 5-8 min walkthrough including date format switching + parsing verification on Transactions page).
- [ ] Committed in logical chunks.
- [ ] Wren + Echo ready.

### 7. Out of scope

- Settings → Categories tab (B6).
- Settings → Other tab (deferred; spec §11 sketches but no v2 scope).
- Multi-currency / currency conversion (v3).
- Locale-specific number formats (thousand separators, decimal points) — v3.
- Locale-aware validation messages (date input rejects the same way regardless of locale — just parses differently).

### 8. When done

Push a completion event with:
- 2-3 line summary
- Commit hash(es)
- Demo path
- Anything to flag for Wren
- Any judgement calls
- Any out-of-scope findings

### 9. Hard rules

- `trash` > `rm`. Backup DB if you touch schema (you shouldn't — B2a did the schema).
- No edits to B2a, B2b, B3a, B3b, B1a, B1b, or B4 code.
- No edits to wireframe HTML, spec, or smoke test.
- No pushing to origin.
- No sub-agent spawns.
- Visual check in dark mode.

## Why this is a focused build

~250 lines: one Settings page replacement + 1 new tab component + locale-aware parser refactor in Transactions.jsx. The Categories tab in B6 will share the same shell.

If you finish well under 2 min, **stop and report done**. Don't start B6 scope.
