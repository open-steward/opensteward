import type { Credentials } from '../../adapter/interface'
import { AFTERSHIP_DASHBOARD_URL } from './constants'

/**
 * AfterShip uses API key authentication — not OAuth2.
 *
 * getAuthUrl:      Returns the AfterShip API keys page (no redirect flow).
 * exchangeCode:    Treats the "code" parameter as the API key and stores it
 *                  directly as the access token.
 * refreshCredentials: API keys never expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // AfterShip has no OAuth2 flow — direct users to their API keys page.
  return AFTERSHIP_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // AfterShip API keys do not expire.
  return credentials
}

/**
 * Build the auth header value for AfterShip requests.
 * AfterShip uses a custom `as-api-key` header (not Authorization).
 */
export function authHeader(apiKey: string): string {
  return apiKey
}
