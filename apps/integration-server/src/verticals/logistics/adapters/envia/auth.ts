import type { Credentials } from '../../adapter/interface'
import { ENVIA_DASHBOARD_URL } from './constants'

/**
 * Envia uses Bearer token authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Envia API tokens page (no redirect flow).
 * exchangeApiKey:      Treats the "code" parameter as the API token and stores
 *                      it directly as the access token.
 * refreshCredentials:  Envia tokens do not expire automatically; returns the
 *                      existing credentials unchanged.
 */

export function buildAuthUrl(_state: string): string {
  // Envia has no OAuth2 flow — direct users to their API tokens page.
  return ENVIA_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The Bearer token IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Envia tokens do not expire; return as-is.
  return credentials
}

/**
 * Build the Authorization header value for Envia requests.
 * Envia uses Bearer token authentication.
 */
export function authHeader(token: string): string {
  return `Bearer ${token}`
}
