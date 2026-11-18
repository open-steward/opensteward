import type { Credentials } from '../../adapter/interface'
import { RETURNGO_DASHBOARD_URL } from './constants'

/**
 * ReturnGO uses API key authentication — not OAuth2.
 *
 * Credentials are stored as:
 *   accessToken  — the ReturnGO API key
 *   refreshToken — the shop name (x-shop-name header value)
 *
 * getAuthUrl:         Returns the ReturnGO API settings page (no redirect flow).
 * exchangeApiKey:     Stores the API key as the access token.
 * refreshCredentials: API keys do not expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // ReturnGO has no OAuth2 flow — direct users to their API settings page.
  return RETURNGO_DASHBOARD_URL
}

/**
 * Store the API key as the credential.
 * The shopName is passed as a second field and stored in refreshToken for
 * use as the x-shop-name header on each request.
 */
export async function exchangeApiKey(
  apiKey: string,
  shopName?: string,
): Promise<Credentials> {
  return {
    accessToken: apiKey,
    refreshToken: shopName ?? undefined,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // ReturnGO API keys do not expire.
  return credentials
}
