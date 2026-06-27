#!/usr/bin/env node
/**
 * audit-calendar-api.js
 *
 * Hard guard rail: asserts that Virta only uses safe Calendar API operations.
 *
 * The OAuth consent screen grants the `calendar` scope, which technically
 * permits calendar-level operations (create, delete, modify whole calendars,
 * change ACLs). We MUST never call those — the scope was needed only for
 * `calendarList.list()`, which has no narrower-scope equivalent in Google's API.
 *
 * Run this in CI or before any release. If it ever fails, treat as a security
 * bug, not a refactor.
 *
 * Usage: node scripts/audit-calendar-api.js
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const SCAN_DIRS = ['server'];

// APIs we DO call. If you need to add one, justify it here in a comment.
const ALLOWED_METHODS = new Set([
  'calendarList.list',
  'events.list',
  'events.get',
  'events.insert',
  'events.delete',
  'events.update'
]);

// APIs we explicitly forbid. If you find yourself needing one of these,
// the right answer is "use a different scope or a different product",
// not "loosen this audit."
const FORBIDDEN_METHODS = [
  'calendars.delete',     // delete a whole calendar
  'calendars.insert',     // create a new calendar
  'calendars.patch',      // modify calendar metadata
  'calendars.update',     // same as patch
  'calendars.clear',      // wipe all events from a calendar
  'acl.delete',           // revoke calendar sharing
  'acl.insert',           // grant calendar sharing
  'acl.patch',            // modify sharing
  'acl.update',           // same
  'settings.list',        // enumerate user settings
  'colors.get'            // fetch palette
];

const forbiddenHits = [];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith('.js')) yield full;
  }
}

for (const sub of SCAN_DIRS) {
  const abs = join(ROOT, sub);
  for (const file of walk(abs)) {
    const src = readFileSync(file, 'utf8');
    for (const line of src.split('\n')) {
      for (const bad of FORBIDDEN_METHODS) {
        // Match bare-word reference to the method (e.g. .delete, .insert).
        // We allow these names to appear in comments / strings / scope strings,
        // so we check for a method-call pattern: .methodName(
        if (new RegExp(`\\.${bad.replace('.', '\\.')}\\s*\\(`).test(line)) {
          // Skip if it's clearly in a comment
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
          forbiddenHits.push({ file, method: bad, line });
        }
      }
    }
  }
}

if (forbiddenHits.length > 0) {
  console.error('❌ FORBIDDEN Calendar API call(s) found:\n');
  for (const hit of forbiddenHits) {
    console.error(`  ${hit.file}`);
    console.error(`    → .${hit.method}()`);
  }
  console.error('\nThe OAuth `calendar` scope was granted for `calendarList.list()` only.');
  console.error('Do NOT call calendar-management APIs. If you need this functionality,');
  console.error('use a different OAuth scope or a different product. This is a security bug.');
  process.exit(1);
}

console.log('✅ Calendar API audit clean.');
console.log(`   Scanned: ${SCAN_DIRS.join(', ')}`);
console.log(`   Forbidden methods checked: ${FORBIDDEN_METHODS.length}`);
console.log(`   Allowed: ${[...ALLOWED_METHODS].join(', ')}`);
process.exit(0);
