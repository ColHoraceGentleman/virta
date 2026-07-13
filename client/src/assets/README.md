# NAICS 2022 data — bundled for the Setup Wizard

This folder holds the offline NAICS 2022 dataset used by the Setup Wizard's
NAICS picker modal (`SetupWizardNaicsModal.jsx`).

## Files

| File | Purpose |
|---|---|
| `naics-2022.json` | Bundled JSON the modal consumes at runtime. Shape: `[{ code, title, sector, sector_code, keywords }, ...]` (1,012 entries, ~180 KB). |
| `naics-build.mjs` | Build script that converts the source CSV into `naics-2022.json`. |
| `_source/naics-2022.csv` | Bundled source CSV from U.S. Census Bureau (~49 KB). |

## Source of truth

The source is the **U.S. Census Bureau 2022 NAICS release**:

- **Download URL (XLSX):** <https://www.census.gov/naics/2022NAICS/6-digit_2022_Codes.xlsx>
- **Reference page:** <https://www.census.gov/naics/?58967?yearbcktrk=2022>

The XLSX contains 1,016 rows: a 2-row header + 1,014 entries. Of those, **1,012
are 6-digit national industry codes** (the others are blank/padding rows).
This matches the spec's "for all ~1,000 6-digit codes" promise.

## Regenerating `naics-2022.json`

The bundled source CSV is the default. To regenerate from it:

```bash
node client/src/assets/naics-build.mjs
```

Expected output:

```
Wrote 1012 6-digit NAICS codes to .../naics-2022.json (~180 KB).
Sectors: 11, 21, 22, 23, 31, 32, 33, 42, 44, 45, 48, 49, 51, 52, 53, 54, 55, 56, 61, 62, 71, 72, 81, 92
```

### Re-downloading from Census (optional)

If you want to refresh the bundled CSV from upstream:

1. Download the XLSX:
   ```bash
   curl -sL "https://www.census.gov/naics/2022NAICS/6-digit_2022_Codes.xlsx" -o /tmp/naics.xlsx
   ```
2. Convert XLSX → CSV. The script reads a CSV with columns `level,code,name,notes`
   (where `level` is the numeric depth and is filtered to `6`). A one-liner with
   Python + `openpyxl`:
   ```python
   import openpyxl
   wb = openpyxl.load_workbook('/tmp/naics.xlsx')
   ws = wb.active
   with open('_source/naics-2022.csv', 'w') as f:
       f.write('level,code,name,notes\n')
       for i, (code, title, _) in enumerate(ws.iter_rows(values_only=True)):
           if i < 2 or code is None or len(str(code)) != 6: continue
           f.write(f'6,{code},{title or ""},\n')
   ```
3. Re-run the build:
   ```bash
   node client/src/assets/naics-build.mjs
   ```

You can also pass an explicit source path to the script:

```bash
node client/src/assets/naics-build.mjs /path/to/other-naics.csv
```

## Sectors

The picker modal renders a fixed list of 20 sector labels (defined inline in
`SetupWizardNaicsModal.jsx`) — these are the 20 official 2022 NAICS sectors per
the U.S. Census Bureau:

| Code | Title |
|---|---|
| 11 | Agriculture, Forestry, Fishing and Hunting |
| 21 | Mining, Quarrying, and Oil and Gas Extraction |
| 22 | Utilities |
| 23 | Construction |
| 31-33 | Manufacturing |
| 42 | Wholesale Trade |
| 44-45 | Retail Trade |
| 48-49 | Transportation and Warehousing |
| 51 | Information |
| 52 | Finance and Insurance |
| 53 | Real Estate and Rental and Leasing |
| 54 | Professional, Scientific, and Technical Services |
| 55 | Management of Companies and Enterprises |
| 56 | Administrative and Support and Waste Management |
| 61 | Educational Services |
| 62 | Health Care and Social Assistance |
| 71 | Arts, Entertainment, and Recreation |
| 72 | Accommodation and Food Services |
| 81 | Other Services (except Public Administration) |
| 92 | Public Administration |

**Note:** The Canadian NAICS 2022 release (used in earlier versions of this
dataset) includes sector codes `41` (Wholesale Trade, Canadian) and `91`
(Public Administration, Canadian). These are **not** valid U.S. Census 2022
NAICS codes and have been intentionally excluded.

## History

- **2026-07-13** — Re-sourced from `https://www.census.gov/naics/2022NAICS/6-digit_2022_Codes.xlsx`
  after Wren review (B2a-prime) flagged that the prior dataset included
  Canadian sectors `41` and `91`. Replaced with U.S. Census data: 1,012 6-digit
  codes across 20 official sectors. Source CSV bundled for reproducibility.