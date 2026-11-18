import type { Credentials } from '../../adapter/interface'
import { VIZION_DASHBOARD_URL } from './constants'

/**
 * How many milliseconds before expiry to consider a token stale.
 * Vizion API uses static X-API-Key auth with no expiry, so this
 * buffer only applies when expiresAt is set (should be undefined).
 */
const REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 minutes

export function buildAuthUrl(_state: string): string {
  return VIZION_DASHBOARD_URL
}

/**
 * Exchange a raw API key for credentials.
 * Vizion API uses long-lived static keys (X-API-Key header) — no
 * token endpoint, no expiry, so expiresAt is intentionally omitted.
 */
export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // No token exchange endpoint exists; the API key IS the access token.
  // expiresAt is deliberately not set — static keys do not expire.
  return { accessToken: apiKey }
}

/**
 * Refresh credentials if the access token is expiring soon.
 *
 * Vizion API issues long-lived static API keys with no server-side
 * expiry. If credentials.expiresAt is undefined (the normal case),
 * the token is permanent and we return as-is. If expiresAt is somehow
 * set, we check the remaining TTL and return as-is (Vizion has no token
 * refresh endpoint — the API key is the sole credential).
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Static API keys never expire; expiresAt should always be undefined.
  if (!credentials.expiresAt) {
    return credentials
  }
  // expiresAt is set unexpectedly — check if we are still within TTL.
  const remaining = credentials.expiresAt.getTime() - Date.now()
  if (remaining > REFRESH_BUFFER_MS) {
    // Still valid with margin — nothing to refresh.
    return credentials
  }
  // Token is expired or expiring soon. Vizion has no refresh endpoint:
  // the caller supplied a static API key that is no longer valid.
  // Return as-is so the upstream error propagates to the caller.
  return credentials
}
