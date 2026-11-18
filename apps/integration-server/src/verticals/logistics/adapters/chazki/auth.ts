import type { Credentials } from '../../adapter/interface'
import { CHAZKI_DASHBOARD_URL } from './constants'

/**
 * Chazki uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Chazki homepage (no redirect flow; keys
 *                      are provisioned directly by Chazki sales/onboarding).
 * exchangeApiKey:      Stores the enterprise API key directly as the access token.
 * refreshCredentials:  Enterprise keys do not expire; returns existing credentials.
 *
 * The key is sent as the `enterprise-key` request header (UUID format).
 */

export function buildAuthUrl(_state: string): string {
  // Chazki has no OAuth2 flow — direct users to chazki.com to contact sales.
  return CHAZKI_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The enterprise key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Chazki enterprise keys do not expire.
  return credentials
}

/**
 * Return the enterprise API key for use as a request header value.
 * The key is sent as-is in the `enterprise-key` header (UUID format).
 */
export function enterpriseKeyHeader(apiKey: string): string {
  return apiKey
}
