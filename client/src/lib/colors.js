// Shared category color palette — muted, post-it style, dark text on all
export const CATEGORY_COLORS = [
  { id: 'yellow',  label: 'Yellow',  hex: '#fef9c3' },
  { id: 'orange',  label: 'Orange',  hex: '#fed7aa' },
  { id: 'pink',    label: 'Pink',    hex: '#fbcfe8' },
  { id: 'rose',    label: 'Rose',    hex: '#fecaca' },
  { id: 'purple',  label: 'Purple',  hex: '#ddd6fe' },
  { id: 'blue',    label: 'Blue',    hex: '#bfdbfe' },
  { id: 'sky',     label: 'Sky',     hex: '#bae6fd' },
  { id: 'teal',    label: 'Teal',    hex: '#99f6e4' },
  { id: 'green',   label: 'Green',   hex: '#bbf7d0' },
  { id: 'lime',    label: 'Lime',    hex: '#d9f99d' },
];

// Dark-mode category color palette — Tailwind 600-level. Pairs roughly with the
// 300-level palette above (same color name = same family, just darker). These are
// the values TaskCard uses when the project is in dark mode AND the category has a
// `dark_color` set. The Rusty project registry pins the 5 active categories to
// specific values from this palette (see projects/rusty-task-colors.md).
export const DARK_CATEGORY_COLORS = [
  { id: 'yellow',  label: 'Yellow',  hex: '#ca8a04' },
  { id: 'orange',  label: 'Orange',  hex: '#ea580c' },
  { id: 'pink',    label: 'Pink',    hex: '#db2777' },
  { id: 'rose',    label: 'Rose',    hex: '#dc2626' },
  { id: 'purple',  label: 'Purple',  hex: '#7c3aed' },
  { id: 'blue',    label: 'Blue',    hex: '#2563eb' },
  { id: 'sky',     label: 'Sky',     hex: '#0284c7' },
  { id: 'teal',    label: 'Teal',    hex: '#0d9488' },
  { id: 'green',   label: 'Green',   hex: '#16a34a' },
  { id: 'lime',    label: 'Lime',    hex: '#65a30d' },
  { id: 'zinc',    label: 'Zinc',    hex: '#71717a' },
];

// Default card color when no category is assigned
export const DEFAULT_CARD_DARK  = '#1e293b'; // slate-800
export const DEFAULT_CARD_LIGHT = '#f8fafc'; // slate-50
