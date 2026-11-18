import type { Credentials } from '../../adapter/interface'
import { QUADIENT_DASHBOARD_URL } from './constants'

/**
 * Quadient Parcel Pending uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Parcel Pending developer portal (no redirect flow).
 * exchangeApiKey:      Treats the "key" parameter as the API key and stores it
 *                      directly as the access token.
 * refreshCredentials:  API keys do not expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // Quadient has no OAuth2 flow — direct users to their developer portal.
  return QUADIENT_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no token exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Quadient API keys do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Quadient Parcel Pending requests.
 * The API uses the key as a Bearer token.
 */
export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
