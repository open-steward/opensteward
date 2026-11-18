import type { Credentials } from '../../adapter/interface'
import { SHIPCLOUD_DASHBOARD_URL } from './constants'

/**
 * shipcloud uses HTTP Basic Auth — not OAuth2.
 *
 * Authentication: API key as the Basic Auth username; password is left empty.
 * The Authorization header is:  Basic <base64(apiKey + ":")>
 *
 * getAuthUrl:          Returns the shipcloud API keys page (no redirect flow).
 * exchangeApiKey:      Treats the "code" parameter as the API key and stores it
 *                      directly as the access token.
 * refreshCredentials:  API keys never expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // shipcloud has no OAuth2 flow — direct users to their API keys page.
  return SHIPCLOUD_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // shipcloud API keys do not expire.
  return credentials
}

/**
 * Build the Authorization header value for shipcloud requests.
 * shipcloud uses HTTP Basic Auth: API key as username, empty password.
 *
 * Format: Basic <base64("apiKey:")>
 */
export function authHeader(apiKey: string): string {
  const encoded = Buffer.from(`${apiKey}:`).toString('base64')
  return `Basic ${encoded}`
}
