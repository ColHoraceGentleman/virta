// Virta Books — Phase C: Vendor normalization.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5 Vendor normalization (R2).
//
// Contract: "no garbage characters in the vendor name."
// - Lowercase, trim, collapse whitespace.
// - Strip common prefixes/suffixes from the STRIP_PREFIXES list (implementation-defined).
// - Pure function — no DB calls.
//
// The strip list is implementation-defined. Add prefixes here as we encounter them.
// Order matters: longer/specific prefixes first.

// Strip prefixes. Each entry: { prefix, mode }.
// Modes:
//   'always'        — always strip. Use for payment-processor pass-throughs that always
//                      wrap a merchant name (PAYPAL *, SQ *, UBER *, GOOGLE *, etc.).
//                      Even if the remainder is a normal-looking string, the prefix
//                      itself is metadata, not part of the merchant.
//   'garbage_only'  — only strip if remainder is empty, very short, or looks like a TXN id.
//                      Use when the prefix could be either metadata OR part of the
//                      merchant name (e.g. ETSY vs ETSY INC).
//   'whole_string'  — the entire input matches the prefix; return it as-is (don't strip).
//                      Use for "apple.com/bill" — that's the entire merchant ID.
const STRIP_PREFIXES = [
  // Payment-processor + cloud-platform pass-throughs — always strip.
  { prefix: 'paypal *',        mode: 'always' },
  { prefix: 'sq *',            mode: 'always' },
  { prefix: 'tst*',            mode: 'always' },
  { prefix: 'uber *',          mode: 'always' },
  { prefix: 'lyft *',          mode: 'always' },
  { prefix: 'doordash*',       mode: 'always' },
  { prefix: 'microsoft*',      mode: 'always' },
  { prefix: 'msft*',           mode: 'always' },
  { prefix: 'intuit *',        mode: 'always' },
  { prefix: 'google *',        mode: 'always' }, // GCP / Google Cloud pass-through

  // Card-issuer + bank code prefixes — always strip.
  { prefix: 'cardmember xx-xxxx', mode: 'always' },
  { prefix: 'cardmember',         mode: 'always' },
  { prefix: 'amzn mktp us*',   mode: 'always' },
  { prefix: 'amzn mkt us*',    mode: 'always' },
  { prefix: 'amzn mktp*',      mode: 'always' },
  { prefix: 'amzn.com*',       mode: 'always' },
  { prefix: 'amzn',            mode: 'always' },

  // Whole-string merchant IDs.
  { prefix: 'apple.com/bill',  mode: 'whole_string' },
  { prefix: 'apple.com',       mode: 'garbage_only' },

  // Brand names that double as prefix substrings — strip only when remainder is garbage.
  { prefix: 'google',          mode: 'garbage_only' },
  { prefix: 'etsy inc',        mode: 'garbage_only' },
  { prefix: 'etsy',            mode: 'garbage_only' },
  { prefix: 'stripe',          mode: 'garbage_only' },
  { prefix: 'target t-',       mode: 'garbage_only' },
  { prefix: 'wal-mart',        mode: 'garbage_only' },
  { prefix: 'walmart',         mode: 'garbage_only' },
  { prefix: 'canva',           mode: 'garbage_only' },
  { prefix: 'figma',           mode: 'garbage_only' },
  { prefix: 'notion',          mode: 'garbage_only' }, // avoids stripping "notion labs" → "labs"
];

// Trailing junk that some banks append (TXN IDs, store numbers, ref codes).
const STRIP_SUFFIXES = [
  /\s+#\d{4,}.*$/,        // " #1234 ..."
  /\s+\d{4,}.*$/,         // " 1234 5678 ..."
  /\s+[a-z]{2}$/,         // " ca" trailing state (some CC exports)
];

// Bank-style transaction IDs sometimes appear as trailing codes anywhere.
const TRAILING_TXN_ID = /\s+#?\d{6,}\s*$/;

// Looks like a transaction id (mostly digits with maybe a letter)
const TXN_ID_RE = /^[a-z]*\d+[a-z0-9]*(\s+\d+)*$/i;

/**
 * Normalize a vendor description into a canonical short string.
 * Pure function. No DB calls.
 *
 * @param {string} description - raw description from the CSV row.
 * @returns {string} normalized vendor name (empty string if input is empty).
 */
export function normalizeVendor(description) {
  if (!description) return '';
  let s = String(description);

  // Lowercase + trim + collapse whitespace.
  s = s.toLowerCase().trim();
  s = s.replace(/\s+/g, ' ');

  // Track the matched prefix so we can keep the brand name if the remainder is pure garbage.
  let matchedPrefix = null;

  // Strip prefixes. Iterate in declared order (longest/specific first).
  for (const { prefix, mode } of STRIP_PREFIXES) {
    if (s.startsWith(prefix)) {
      matchedPrefix = prefix;
      const remainder = s.slice(prefix.length).trim();
      if (mode === 'whole_string') {
        // Whole input matches the prefix; treat the whole thing as the merchant id.
        return s;
      }
      if (mode === 'always') {
        s = remainder;
        break;
      }
      if (mode === 'garbage_only') {
        if (!remainder) {
          // Nothing left after stripping — the prefix was the whole merchant.
          return s;
        }
        // Strip only if remainder is short or looks like a TXN id.
        const looksLikeGarbage = remainder.length <= 3 || TXN_ID_RE.test(remainder);
        if (looksLikeGarbage) {
          s = remainder;
        } else {
          // Prefix doesn't fit (e.g. "notion labs"); discard match so we don't keep the prefix.
          matchedPrefix = null;
        }
        break;
      }
    }
  }

  // Strip suffixes (regex).
  for (const re of STRIP_SUFFIXES) {
    s = s.replace(re, '').trim();
  }

  // If, after all stripping, what's left is a pure transaction-id (digits + spaces only),
  // fall back to the matched prefix (e.g. "target t-1234 5678" → matched prefix "target t-"
  // would also need trimming, so use the prefix without its trailing marker).
  if (matchedPrefix && /^[\d\s]+$/.test(s) && s.replace(/\s/g, '').length >= 3) {
    // Return the prefix as the brand name (trimmed of trailing markers like " t-").
    let brand = matchedPrefix.replace(/[\s*]+$/, '').replace(/\s*t-$/, '').trim();
    return brand || s;
  }

  // Strip trailing transaction IDs.
  s = s.replace(TRAILING_TXN_ID, '').trim();

  // Collapse again after all the cutting.
  s = s.replace(/\s+/g, ' ');

  return s;
}

// Exported for testing and introspection.
export const _INTERNAL = { STRIP_PREFIXES, STRIP_SUFFIXES, TRAILING_TXN_ID, TXN_ID_RE };