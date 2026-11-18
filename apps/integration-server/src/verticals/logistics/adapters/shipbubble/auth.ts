import type { Credentials } from '../../adapter/interface'
import { SHIPBUBBLE_DASHBOARD_URL } from './constants'

/**
 * Shipbubble uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Shipbubble API keys settings page.
 * exchangeApiKey:      Treats the "code" parameter as the API key and stores
 *                      it directly as the access token.
 * refreshCredentials:  API keys do not expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return SHIPBUBBLE_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * Build the Authorization header value for Shipbubble requests.
 * Shipbubble uses Bearer token authentication.
 */
export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
