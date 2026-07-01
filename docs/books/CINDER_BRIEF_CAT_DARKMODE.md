# Cinder Brief — Dark Mode Category Colors

**Goal:** Make task cards with category colors easier on the eyes in dark mode. Add a `dark_color` field to categories; when a card is rendered in dark mode, use `dark_color` instead of the bright 300-level color. Text colors flip to light-on-dark.

**Read first:**
1. This brief (you're here).
2. `~/clawd/projects/task-manager/qa/templates/CINDER_BRIEF_TEMPLATE.md` — 5 Hard Rules apply. Apply them.
3. `~/clawd/projects/task-manager/qa/QA.md` — don't break anything. The 62 Books behaviors don't apply here, but the *Tasks* behaviors (none in QA.md yet) will eventually cover this. Document carefully.
4. `~/Documents/Rusty Memory/projects/rusty-task-colors.md` — the registry Patrick and Rusty maintain. **This file is the canonical source for the color assignments. Your job is to wire the schema + UI to support `dark_color`; do NOT change the existing light colors.**
5. `client/src/components/TaskCard.jsx` — lines 50-90 are the relevant section. Card background is `category.color` on line 63. Text is hardcoded to dark (`text-gray-800`) when the card has a category.
6. `client/src/components/SettingsModal.jsx` line 198 — the category color picker uses `category.color`. May need a sibling `dark_color` picker.

**Authoritative code paths:**
- `~/clawd/projects/task-manager/server/db.js` — schema section for `categories`
- `~/clawd/projects/task-manager/server/routes/categories.js` — POST/PATCH handlers
- `~/clawd/projects/task-manager/server/services/taskService.js` — `createCategory` / `updateCategory` / `getCategories` (lines 192, 175, etc.)
- `~/clawd/projects/task-manager/client/src/components/TaskCard.jsx` — render path
- `~/clawd/projects/task-manager/client/src/components/SettingsModal.jsx` — category editor

**Live state (2026-07-01):**
- 5 categories in the Rusty project, all on 300-level (bright) colors
- 20 tasks in the Rusty project, all with `category_id` set
- Service on port 3001, current phase "D" or "E.1" (you're shipping E.1, so by the time you start this, phase is "E.1")
- Dark mode is a per-user toggle — search the codebase for how it propagates; should be a prop or context

---

## Scope

**Build:**
- ✅ Add `dark_color` column to `categories` table (TEXT, nullable, default NULL)
- ✅ Update `createCategory` + `updateCategory` to accept and persist `dark_color`
- ✅ Set `dark_color` for the 5 existing categories in the Rusty project (with the values below)
- ✅ Update `TaskCard.jsx`: when `darkMode` is true and the category has a `dark_color`, use it; otherwise fall back to the light color
- ✅ Update `TaskCard.jsx` text colors: when on a dark-mode category color, use light text (white / white-with-transparency)
- ✅ Update `SettingsModal.jsx`: add a `dark_color` picker next to the existing `color` picker (only for the categories user can edit; Rusty categories will be managed via API)
- ✅ Smoke test: switch a card's category between light and dark, verify card renders correctly in both modes

**Don't build:**
- ❌ Don't change the existing light colors (the 300-level values in the registry stay)
- ❌ Don't add a UI for *choosing* dark colors yet (Rusty manages them via the registry; you only wire the storage)
- ❌ Don't touch the Phase E.1 (reconciliation) code path or migration
- ❌ Don't refactor other components

---

## Migration spec

**Backup first (Hard Rule #3):**
```bash
cp ~/clawd/projects/task-manager/data/tasks.db \
   ~/clawd/projects/task-manager/data/backups/tasks-pre-darkmode-$(date +%s).db
```

**Add the column (idempotent, in `server/db.js` near the existing categories block):**
```js
{
  const catCols = db.prepare('PRAGMA table_info(categories)').all().map(c => c.name);
  if (!catCols.includes('dark_color')) {
    safeExec('ALTER TABLE categories ADD COLUMN dark_color TEXT');
  }
}
```

**Set dark_color for the 5 existing categories:**
| Category | dark_color | Tailwind |
|---|---|---|
| `Books` | `#16a34a` | green-600 |
| `Tasks` | `#2563eb` | blue-600 |
| `Lorelai` | `#7c3aed` | violet-600 |
| `Virta` | `#ea580c` | orange-600 |
| `Ops` | `#71717a` | zinc-500 (slightly muted since Ops is supposed to be quiet) |

You can set these via PATCH /api/v1/categories/:id (with `dark_color` in the body), or via a one-time sqlite UPDATE. Either way, include the script or curl commands in your report.

---

## Service + API changes

**`createCategory` and `updateCategory` in `taskService.js`:** add `darkColor` to the destructured fields. Persist to `dark_color` column. Default to null if not provided.

**`POST /api/v1/categories` and `PATCH /api/v1/categories/:id`:** accept `darkColor` in the body. No validation required beyond "is a string" — we trust the Rusty-maintained registry to be the source of truth for the actual values.

**`getCategories`:** include `dark_color` in the SELECT.

---

## UI changes

### `TaskCard.jsx` (line 50-90)

**Current logic (line 63):**
```js
const cardBg = hasCategory
  ? category.color
  : darkMode ? DEFAULT_CARD_DARK : DEFAULT_CARD_LIGHT;
```

**New logic:**
```js
const cardBg = hasCategory
  ? (darkMode && category.dark_color ? category.dark_color : category.color)
  : darkMode ? DEFAULT_CARD_DARK : DEFAULT_CARD_LIGHT;
```

**Text colors (currently hardcoded dark when hasCategory):**
```js
const titleColor   = hasCategory ? 'text-gray-800'   : ...
const bodyColor    = hasCategory ? 'text-gray-600'   : ...
const dateColor    = hasCategory ? 'text-gray-500'   : ...
const borderColor  = hasCategory ? 'border-black/10' : ...
```

**New logic** (when in dark mode AND the card has a `dark_color`, use light text):
```js
const useDarkBg = hasCategory && darkMode && category.dark_color;
const titleColor   = hasCategory ? (useDarkBg ? 'text-white'   : 'text-gray-800')   : ...
const bodyColor    = hasCategory ? (useDarkBg ? 'text-white/70' : 'text-gray-600')   : ...
const dateColor    = hasCategory ? (useDarkBg ? 'text-white/60' : 'text-gray-500')   : ...
const borderColor  = hasCategory ? (useDarkBg ? 'border-white/10' : 'border-black/10') : ...
```

Adjust the `assigneeBg` / `extraBubbleBg` similarly (currently hardcoded `bg-black/20` for category cards — on a dark category background, you'd want `bg-white/20`).

Same logic applies to `priorityColors` (currently `PRIORITY_COLORS_ON_COLOR` for both light and dark; you may need a `PRIORITY_COLORS_ON_DARK_BG` variant).

**Pragmatic test:** load any task card with `Books` category in dark mode before/after. If the text is hard to read on `#16a34a`, lighten it. If it looks great, ship.

### `SettingsModal.jsx` (around line 198)

Add a `darkColor` field to the form state. Show a color picker labeled "Dark mode color" next to the existing "Color" picker. Only render this for categories where `dark_color` is meaningful — for simplicity, always show it for all categories; users can leave it null if they don't care.

PATCH should send `darkColor: newValue` if changed. POST should send it if the user is creating a new category.

---

## Verification spec

1. **Schema check:**
   ```bash
   sqlite3 ~/clawd/projects/task-manager/data/tasks.db "PRAGMA table_info('categories');" | grep -E "color"
   ```
   Expected: two rows — `color` and `dark_color`.

2. **Categories have dark_color set:**
   ```bash
   sqlite3 -header ~/clawd/projects/task-manager/data/tasks.db "SELECT name, color, dark_color FROM categories WHERE project_id = '19050a55a7586f03aa48f163baae8535';"
   ```
   Expected: 5 rows, all with `dark_color` set to the values above.

3. **API accepts dark_color:**
   ```bash
   curl -s -X POST http://localhost:3001/api/v1/categories \
     -H "Content-Type: application/json" \
     -d '{"name":"__darkmode_debug__","color":"#86efac","darkColor":"#16a34a","projectId":"19050a55a7586f03aa48f163baae8535"}'
   ```
   Expected: 200 with the new category showing `dark_color: #16a34a`. Then DELETE it.

4. **API returns dark_color in GET:**
   ```bash
   curl -s "http://localhost:3001/api/v1/categories?projectId=19050a55a7586f03aa48f163baae8535" | python3 -m json.tool
   ```
   Expected: each category has both `color` and `dark_color`.

5. **Live UI test (manual):** Open Virta Tasks in dark mode. Confirm:
   - Books-category tasks have a darker green background
   - Text is light/white on the dark green (readable)
   - Same for Tasks (darker blue), Lorelai (darker violet), Virta (darker orange), Ops (darker gray)
   - Switching to light mode shows the original 300-level colors

6. **No-regression:** in light mode, all 20 task cards still render correctly with the original 300-level colors. (Revert any changes to the light-mode logic.)

7. **Health check:**
   ```bash
   curl -s http://localhost:3001/api/v1/books/health
   ```
   Expected: still OK.

---

## Test coverage (REQUIRED in your report)

```markdown
## Test coverage

### Behaviors added
- **VT-CAT-01** — Categories table has a `dark_color` column (nullable).
- **VT-CAT-02** — `createCategory` accepts and persists `darkColor`.
- **VT-CAT-03** — `updateCategory` accepts and persists `darkColor` changes.
- **VT-CAT-04** — TaskCard renders `category.dark_color` in dark mode when set.
- **VT-CAT-05** — TaskCard falls back to `category.color` in dark mode when `dark_color` is null.
- **VT-CAT-06** — TaskCard text is light-on-dark when on a dark-mode category color.
- **VT-CAT-07** — TaskCard text is dark-on-light when on a light-mode category color (no regression).
- **VT-CAT-08** — SettingsModal exposes a "Dark mode color" picker for category editing.
- **VT-CAT-09** — The 5 Rusty project categories have `dark_color` set to Tailwind 600-level values per the registry.

### Behaviors verified
- **VT-CAT-10** — Light mode rendering unchanged for all 20 existing Rusty tasks.
```

---

## Deliverable

`~/clawd/projects/task-manager/docs/books/CINDER_REPORT_CAT_DARKMODE.md` with:
- TL;DR
- Backup trail
- Migration diff (db.js changes + dark_color assignment script)
- Build details (TaskCard.jsx diff, SettingsModal.jsx diff, service changes)
- Smoke test transcripts (5+ tests)
- Test coverage section
- A note: **The dark_color values must match the vault registry at `~/Documents/Rusty Memory/projects/rusty-task-colors.md`. If they don't, update one or the other to match.**

Use `minimax/MiniMax-M3` (your default). Estimated time: 25-40 min. Take the backup. Stay focused.

If you hit a conflict with your Phase E.1 work (e.g., touching `db.js` while the E.1 migration is in flight), STOP and surface. Otherwise proceed.
