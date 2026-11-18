import type { Credentials } from '../../adapter/interface'
import { TRANSPORTIFY_DASHBOARD_URL } from './constants'

/**
 * Transportify / Deliveree uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Transportify API settings page (no redirect flow).
 * exchangeApiKey:      Treats the supplied string as the API key and returns Credentials.
 * refreshCredentials:  API keys do not expire; returns existing credentials unchanged.
 */

export function buildAuthUrl(_state: string): string {
  // Transportify has no OAuth2 redirect flow — send users to the API settings page.
  return TRANSPORTIFY_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no token exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Transportify API keys do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Transportify requests.
 * Transportify expects the raw API key in the Authorization header (no "Bearer" prefix).
 */
export function authHeader(apiKey: string): string {
  return apiKey
}
