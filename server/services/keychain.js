import { execSync } from 'child_process';

// macOS Keychain storage for Google OAuth tokens.
// Why Keychain: tokens are secrets, they shouldn't live in a sqlite file that gets
// backed up, gitignored-but-still-on-disk, and potentially copied around.

const SERVICE = 'virta';
const ACCOUNT = 'google-oauth';

function shellEscape(value) {
  // Escape single quotes for safe inclusion in a single-quoted shell argument.
  // 'foo' -> 'foo';  foo's -> 'foo'\''s'
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * Store Google OAuth tokens in macOS Keychain.
 * Accepts: { access_token, refresh_token, expiry_date } where expiry_date is ms or ISO string.
 * Uses -U to upsert, so updating an existing entry doesn't prompt the user.
 */
export function storeTokens(tokens) {
  const value = JSON.stringify({
    access_token: tokens.access_token || null,
    refresh_token: tokens.refresh_token || null,
    expiry_date: tokens.expiry_date
      ? (typeof tokens.expiry_date === 'number'
          ? new Date(tokens.expiry_date).toISOString()
          : tokens.expiry_date)
      : null
  });

  try {
    execSync(
      `security add-generic-password -a ${shellEscape(ACCOUNT)} -s ${shellEscape(SERVICE)} -w ${shellEscape(value)} -U`,
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
  } catch (err) {
    throw new Error(`Failed to store tokens in Keychain: ${err.message}`);
  }
}

/**
 * Read Google OAuth tokens from macOS Keychain.
 * Returns: { access_token, refresh_token, expiry_date } | null
 */
export function readTokens() {
  try {
    const raw = execSync(
      `security find-generic-password -a ${shellEscape(ACCOUNT)} -s ${shellEscape(SERVICE)} -w`,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Delete the Keychain entry. Idempotent — succeeds even if nothing is stored.
 */
export function clearTokens() {
  try {
    execSync(
      `security delete-generic-password -a ${shellEscape(ACCOUNT)} -s ${shellEscape(SERVICE)}`,
      { stdio: ['ignore', 'ignore', 'ignore'] }
    );
  } catch {
    // Not found is fine.
  }
}
