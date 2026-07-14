// Virta Books — Setup Wizard NAICS lookup modal.
//
// Per SETUP_AND_CATEGORIES.md §6A + TASK-b2a-wizard-b.md §4:
//   - Triggered by clicking the "Industry code (NAICS)" field in Step 2.
//   - Search box (autofocus, 200ms debounce, case-insensitive substring on
//     title + keywords + code). "No matches" when zero results.
//   - Sector filter on left: 2-digit sectors, default "All". Click to
//     narrow. 20 official 2022 sectors are rendered as a vertical list
//     (the "31-33 Manufacturing" / "44-45 Retail" / "48-49 Transportation"
//     etc. merges are display-only; the underlying data uses 2-digit codes
//     31/32/33/44/45/48/49 to match the JSON).
//   - Result list below search, scrollable. Each row: 6-digit code +
//     official title. Hover state, click → code written to field, modal
//     closes.
//   - Selected code display at top: "Selected: 111110 Soybean Farming"
//     with an "X" to clear (only when a code is already selected). Per
//     Wren B2a-wizard-B NIT F4 (landed B2b-2): Clear only clears the
//     selection — it does NOT close the modal, so the user can
//     immediately re-pick a code without reopening. Callers pass an
//     `onClear` prop for this (falls back to `onSelect('', '')` — which
//     closes — if `onClear` isn't provided, for backward compat).
//   - Footer: single "Cancel" button (no Save — selection closes the
//     modal).
//
// Backing data: client/src/assets/naics-2022.json — 1,012 entries, 20
// official 2022 sectors (US Census Bureau source). 1,012 rows is small
// enough to filter in-memory without virtualization. We re-filter from
// the raw array on every search/filter change; that's < 5ms even on a
// slow device.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import naicsData from '../assets/naics-2022.json';

// SECTORS — the 20 official 2022 NAICS sectors (US Census Bureau).
// Some are 2-digit (11, 21, …) and some are ranges (31-33, 44-45, 48-49).
// `code` is what we match against the JSON's `sector_code` field; the
// `codes` array lets one sector filter span multiple 2-digit codes.
// "All" is the default and shows every code.
const SECTORS = [
  { code: 'all',     label: 'All',                                      codes: null },
  { code: '11',      label: '11  Agriculture, Forestry, Fishing and Hunting', codes: ['11'] },
  { code: '21',      label: '21  Mining, Quarrying, and Oil and Gas Extraction', codes: ['21'] },
  { code: '22',      label: '22  Utilities',                            codes: ['22'] },
  { code: '23',      label: '23  Construction',                         codes: ['23'] },
  { code: '31-33',   label: '31-33  Manufacturing',                     codes: ['31','32','33'] },
  { code: '42',      label: '42  Wholesale Trade',                      codes: ['42'] },
  { code: '44-45',   label: '44-45  Retail Trade',                      codes: ['44','45'] },
  { code: '48-49',   label: '48-49  Transportation and Warehousing',    codes: ['48','49'] },
  { code: '51',      label: '51  Information',                          codes: ['51'] },
  { code: '52',      label: '52  Finance and Insurance',                codes: ['52'] },
  { code: '53',      label: '53  Real Estate and Rental and Leasing',   codes: ['53'] },
  { code: '54',      label: '54  Professional, Scientific, and Technical Services', codes: ['54'] },
  { code: '55',      label: '55  Management of Companies and Enterprises', codes: ['55'] },
  { code: '56',      label: '56  Administrative and Support and Waste Management', codes: ['56'] },
  { code: '61',      label: '61  Educational Services',                 codes: ['61'] },
  { code: '62',      label: '62  Health Care and Social Assistance',    codes: ['62'] },
  { code: '71',      label: '71  Arts, Entertainment, and Recreation',  codes: ['71'] },
  { code: '72',      label: '72  Accommodation and Food Services',      codes: ['72'] },
  { code: '81',      label: '81  Other Services (except Public Administration)', codes: ['81'] },
  { code: '92',      label: '92  Public Administration',                codes: ['92'] },
];

function useDebouncedValue(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function SetupWizardNaicsModal({ currentCode, onSelect, onClear, onClose }) {
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('all');
  const debouncedQuery = useDebouncedValue(query, 200);
  const searchRef = useRef(null);

  // Focus search on mount + lock body scroll while modal is open.
  useEffect(() => {
    searchRef.current && searchRef.current.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  // Esc closes the modal.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Filter pipeline — sector first (cheaper), then search. We lowercase
  // the query once and lowercase each candidate string once (via a
  // precomputed haystack would be faster, but 1k rows is fine).
  const filtered = useMemo(() => {
    const sectorDef = SECTORS.find((s) => s.code === sector);
    let rows = naicsData;
    if (sectorDef && sectorDef.codes) {
      const set = new Set(sectorDef.codes);
      rows = rows.filter((r) => set.has(r.sector_code));
    }
    const q = (debouncedQuery || '').toLowerCase().trim();
    if (q) {
      rows = rows.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        r.code.includes(q) ||
        (r.keywords || []).some((k) => k.toLowerCase().includes(q))
      );
    }
    return rows;
  }, [sector, debouncedQuery]);

  // Currently-selected row (for the "Selected: …" header). Re-derive
  // title from the bundled JSON so we don't depend on parent state.
  const selectedRow = useMemo(() => {
    if (!currentCode) return null;
    return naicsData.find((r) => r.code === currentCode) || null;
  }, [currentCode]);

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleBackdrop}
      data-testid="naics-modal"
    >
      <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-full max-w-3xl max-h-[90vh] flex flex-col my-auto" role="dialog" aria-modal="true" aria-labelledby="naics-modal-title">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between gap-3">
          <div>
            <h2 id="naics-modal-title" className="text-base font-medium text-slate-100">
              Look up NAICS code
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Search by keyword or filter by sector. Backed by an offline snapshot.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-100 text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Selected code display — only when a code is already selected. */}
        {selectedRow && (
          <div className="px-5 py-2.5 border-b border-slate-700 bg-slate-900/40 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-300">
              <span className="text-slate-500">Selected:</span>{' '}
              <span className="font-medium text-slate-100">{selectedRow.code}</span>{' '}
              <span className="text-slate-300">{selectedRow.title}</span>
            </div>
            <button
              type="button"
              onClick={() => (onClear ? onClear() : onSelect('', ''))}
              data-testid="naics-modal-clear"
              className="text-slate-500 hover:text-slate-100 text-sm"
              title="Clear selection — modal stays open so you can re-pick a code"
            >
              ✕ Clear
            </button>
          </div>
        )}

        {/* Body — search + sector list + result list, scrollable. */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Sector list (left rail). */}
          <div className="w-48 shrink-0 border-r border-slate-700 overflow-y-auto py-2">
            <button
              type="button"
              onClick={() => setSector('all')}
              data-testid="naics-sector-all"
              className={`w-full text-left px-3 py-1.5 text-xs ${
                sector === 'all'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/40'
              }`}
            >
              All
            </button>
            {SECTORS.filter((s) => s.code !== 'all').map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => setSector(s.code)}
                data-testid={`naics-sector-${s.code}`}
                className={`w-full text-left px-3 py-1.5 text-xs ${
                  sector === s.code
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/40'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Search + result list (right). */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-4 py-3 border-b border-slate-700">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search (e.g. quilting, photography, consulting)"
                data-testid="naics-search"
                className="w-full bg-slate-900 text-slate-100 text-sm rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
              />
              <div className="text-xs text-slate-500 mt-1.5">
                {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
                {debouncedQuery ? ` for "${debouncedQuery}"` : ''}
                {sector !== 'all' ? ` in ${sector}` : ''}
              </div>
            </div>
            <div
              className="flex-1 overflow-y-auto px-4 py-2"
              data-testid="naics-results"
            >
              {filtered.length === 0 ? (
                <div className="text-sm text-slate-400 py-8 text-center" data-testid="naics-no-matches">
                  No matches. Try a different keyword.
                </div>
              ) : (
                <ul className="space-y-1">
                  {filtered.map((r) => (
                    <li key={r.code}>
                      <button
                        type="button"
                        onClick={() => onSelect(r.code, r.title)}
                        data-testid={`naics-row-${r.code}`}
                        className={`w-full text-left rounded border px-3 py-2 text-sm transition-colors ${
                          currentCode === r.code
                            ? 'bg-indigo-900/30 border-indigo-600 text-slate-100'
                            : 'bg-slate-900/40 border-slate-700 hover:border-slate-500 hover:bg-slate-700/40 text-slate-200'
                        }`}
                      >
                        <span className="font-mono text-slate-300 mr-2">{r.code}</span>
                        <span>{r.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Footer — single Cancel button (no Save — selection closes the
            modal). Sticky to the bottom of the modal. */}
        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="naics-modal-cancel"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
