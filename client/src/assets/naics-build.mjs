// Convert the raw 2022 NAICS CSV into a bundled JSON for the Setup Wizard's
// NAICS picker modal.
//
// Source: U.S. Census Bureau, "6-digit_2022_Codes.xlsx" (2022 NAICS release).
//   URL: https://www.census.gov/naics/2022NAICS/6-digit_2022_Codes.xlsx
//   Bundled locally at: client/src/assets/_source/naics-2022.csv (~49 KB)
//   Run `node client/src/assets/naics-build.mjs` to regenerate naics-2022.json.
//
// Output shape (consumed by SetupWizardNaicsModal.jsx):
//   [{ code: "111110", title: "Soybean Farming", sector: "11", keywords: ["soybean", "farming"] }, ...]
//
// - Only level=6 rows (the user-pickable 6-digit codes).
// - `sector` is the OFFICIAL 2022 NAICS sector label, derived from the code's
//   2- or 3-digit prefix per the 2022 NAICS manual structure.
// - `keywords` is the union of (lowercased title tokens) and (any notes field).
//   No synonym enrichment — kept minimal per brief.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = process.argv[2] || join(__dirname, '_source', 'naics-2022.csv');
const OUT = join(__dirname, 'naics-2022.json');

// Official 2022 NAICS sector labels — derive from the code's 2- or 3-digit prefix.
// Source: https://www.census.gov/naics/?58967?yearbcktrk=2022
// 20 sectors per the 2022 NAICS manual: 11, 21, 22, 23, 31-33, 42, 44-45,
// 48-49, 51, 52, 53, 54, 55, 56, 61, 62, 71, 72, 81, 92.
// NOTE: '41' (Canadian Wholesale Trade) and '91' (Canadian Public Administration)
// are NOT valid US Census 2022 sectors and are intentionally excluded.
const SECTOR_PREFIX_MAP = [
  { prefixes: ['11'],                                            label: 'Agriculture, Forestry, Fishing and Hunting' },
  { prefixes: ['21'],                                            label: 'Mining, Quarrying, and Oil and Gas Extraction' },
  { prefixes: ['22'],                                            label: 'Utilities' },
  { prefixes: ['23'],                                            label: 'Construction' },
  { prefixes: ['31', '32', '33'],                                 label: 'Manufacturing' },
  { prefixes: ['42'],                                            label: 'Wholesale Trade' },
  { prefixes: ['44', '45'],                                      label: 'Retail Trade' },
  { prefixes: ['48', '49'],                                      label: 'Transportation and Warehousing' },
  { prefixes: ['51'],                                            label: 'Information' },
  { prefixes: ['52'],                                            label: 'Finance and Insurance' },
  { prefixes: ['53'],                                            label: 'Real Estate and Rental and Leasing' },
  { prefixes: ['54'],                                            label: 'Professional, Scientific, and Technical Services' },
  { prefixes: ['55'],                                            label: 'Management of Companies and Enterprises' },
  { prefixes: ['56'],                                            label: 'Administrative and Support and Waste Management and Remediation Services' },
  { prefixes: ['61'],                                            label: 'Educational Services' },
  { prefixes: ['62'],                                            label: 'Health Care and Social Assistance' },
  { prefixes: ['71'],                                            label: 'Arts, Entertainment, and Recreation' },
  { prefixes: ['72'],                                            label: 'Accommodation and Food Services' },
  { prefixes: ['81'],                                            label: 'Other Services (except Public Administration)' },
  { prefixes: ['92'],                                            label: 'Public Administration' },
];

// Sector labels for the picker UI — 20 official 2022 NAICS sectors.
const SECTORS = [
  { code: '11', title: 'Agriculture, Forestry, Fishing and Hunting' },
  { code: '21', title: 'Mining, Quarrying, and Oil and Gas Extraction' },
  { code: '22', title: 'Utilities' },
  { code: '23', title: 'Construction' },
  { code: '31-33', title: 'Manufacturing' },
  { code: '42', title: 'Wholesale Trade' },
  { code: '44-45', title: 'Retail Trade' },
  { code: '48-49', title: 'Transportation and Warehousing' },
  { code: '51', title: 'Information' },
  { code: '52', title: 'Finance and Insurance' },
  { code: '53', title: 'Real Estate and Rental and Leasing' },
  { code: '54', title: 'Professional, Scientific, and Technical Services' },
  { code: '55', title: 'Management of Companies and Enterprises' },
  { code: '56', title: 'Administrative and Support and Waste Management' },
  { code: '61', title: 'Educational Services' },
  { code: '62', title: 'Health Care and Social Assistance' },
  { code: '71', title: 'Arts, Entertainment, and Recreation' },
  { code: '72', title: 'Accommodation and Food Services' },
  { code: '81', title: 'Other Services (except Public Administration)' },
  { code: '92', title: 'Public Administration' },
];

function deriveSector(code6) {
  // Try 2-char prefix first, then 3-char prefix (so e.g. "541" Professional Services matches before "54").
  const a = code6.slice(0, 2);
  const b = code6.slice(0, 3);
  for (const m of SECTOR_PREFIX_MAP) {
    if (m.prefixes.includes(b)) return { sector: m.label, sectorCode: b };
  }
  for (const m of SECTOR_PREFIX_MAP) {
    if (m.prefixes.includes(a)) return { sector: m.label, sectorCode: a };
  }
  return { sector: 'Other', sectorCode: '00' };
}

// Minimal CSV parser — the source CSV is simple (no embedded commas inside
// unquoted fields, only quotes for titles with commas).
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Quick split: respect quotes by manual scanning.
    const cells = [];
    let buf = '';
    let inQ = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { cells.push(buf); buf = ''; continue; }
      buf += c;
    }
    cells.push(buf);
    out.push({
      level: Number(cells[0]),
      code: cells[1],
      name: cells[2],
      notes: cells[3] || '',
    });
  }
  return out;
}

function buildKeywords(title, notes) {
  const text = `${title} ${notes}`.toLowerCase();
  return Array.from(new Set(text.split(/[^a-z0-9]+/).filter(Boolean)));
}

function main() {
  if (!existsSync(SOURCE)) {
    console.error(`Source CSV not found at ${SOURCE}.`);
    console.error(`Either:`);
    console.error(`  1. Use the bundled source at client/src/assets/_source/naics-2022.csv (default), or`);
    console.error(`  2. Re-download from US Census 2022:`);
    console.error(`     curl -sL "https://www.census.gov/naics/2022NAICS/6-digit_2022_Codes.xlsx" -o /tmp/naics.xlsx`);
    console.error(`     # then convert xlsx -> csv (e.g. with openpyxl in Python), or pass a CSV directly.`);
    console.error(`  3. Pass an explicit source path:`);
    console.error(`     node client/src/assets/naics-build.mjs /path/to/naics-2022.csv`);
    process.exit(1);
  }

  const raw = readFileSync(SOURCE, 'utf8');
  const rows = parseCsv(raw);
  const six = rows.filter(r => r.level === 6 && r.code && r.name);

  const out = six.map(r => {
    const { sector, sectorCode } = deriveSector(r.code);
    return {
      code: r.code,
      title: r.name,
      sector,
      sector_code: sectorCode,
      keywords: buildKeywords(r.name, r.notes),
    };
  });

  // Sort by code for stable output
  out.sort((a, b) => a.code.localeCompare(b.code));

  writeFileSync(OUT, JSON.stringify(out, null, 0));

  const sizeKb = Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024);
  console.log(`Wrote ${out.length} 6-digit NAICS codes to ${OUT} (${sizeKb} KB).`);
  console.log(`Sectors: ${[...new Set(out.map(r => r.sector_code))].sort().join(', ')}`);
  console.log(`Sector labels written to naics-2022.json — picker sectors defined inline in SetupWizardNaicsModal.jsx (not bundled).`);
}

// Expose SECTORS as a separate export so the build script can also produce
// a sectors.json if needed (currently the modal hardcodes them, so we skip).
export { SECTORS };

main();