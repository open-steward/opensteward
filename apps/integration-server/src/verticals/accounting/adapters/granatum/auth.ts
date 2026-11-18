/**
 * Granatum auth — API key (access_token query param).
 *
 * The token is a static secret obtained from the Granatum dashboard:
 * Settings → My Company → API section (Super Admin only).
 *
 * There is no OAuth flow for Granatum. The Credentials object carries the
 * key in `accessToken`; no refresh is needed.
 */
import type { Credentials } from '../../adapter/interface'

/**
 * Granatum uses a static API key — no OAuth redirect URL exists.
 * Returns '#' to satisfy the BaseAdapter interface without throwing.
 */
export function getAuthUrl(_state: string): string {
  return '#'
}

/**
 * Builds a Credentials object from a raw Granatum API key.
 * Use this when bootstrapping credentials from a connection form.
 */
export function buildCredentials(apiKey: string): Credentials {
  return { accessToken: apiKey }
}

export async function exchangeCode(_code: string): Promise<Credentials> {
  // No OAuth code exchange for Granatum — credentials come via the Connect
  // Link form through exchangeCredentials(). This is a no-op placeholder.
  return { accessToken: '' }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys do not expire.
  return credentials
}
