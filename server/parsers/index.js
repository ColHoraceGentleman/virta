// Virta Books — Phase C: Parser registry.
// Source of truth: /Users/colonelhoracegentleman/clawd/projects/accounting-app/
// Spec: ACCOUNTING-v1.md §5.
//
// The importer iterates PARSERS in order, calling detect() on each. The first match wins.
// To add a new parser (CSV or PDF), drop a module into this directory with the
// `detect(buffer, filename, mimeType) → { matches, source, format }` and
// `parse(buffer) → Array<{ txn_date, description, amount }>` contract, plus a
// CANONICAL_MAPPING export, then add it to the PARSERS array below. No other code change.

import * as chase from './chase-cc.js';
import * as amex from './amex.js';
import * as paypal from './paypal.js';
import * as venmo from './venmo.js';

// Each entry exposes detect(), parse(), and CANONICAL_MAPPING.
// Order matters: more specific detectors should come first if they share signatures.
export const PARSERS = [chase, amex, paypal, venmo];

// Helper: run all detectors and return the first match with its module.
export function detectSource(buffer, filename, mimeType) {
  for (const parser of PARSERS) {
    try {
      const result = parser.detect(buffer, filename, mimeType);
      if (result && result.matches) {
        return { ...result, parser };
      }
    } catch (e) {
      // Bad CSV, etc. — skip and try next.
      // eslint-disable-next-line no-console
      console.warn('[Parsers] detect() threw for', parser.CANONICAL_MAPPING?.source_key, e.message);
    }
  }
  return null;
}