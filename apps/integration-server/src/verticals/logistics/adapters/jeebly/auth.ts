import type { Credentials } from '../../adapter/interface'
import { JEEBLY_DASHBOARD_URL } from './constants'

/**
 * Jeebly uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Jeebly API settings page (no redirect flow).
 * exchangeApiKey:      Treats the "code" parameter as the API key and stores it
 *                      directly as the access token.
 * refreshCredentials:  API keys never expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // Jeebly has no OAuth2 flow — direct users to their API settings page.
  return JEEBLY_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Jeebly API keys do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Jeebly requests.
 * Jeebly uses the API key as a Bearer token.
 */
export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
