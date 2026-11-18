import type { Credentials } from '../../adapter/interface'
import { FREIGHTIFY_DASHBOARD_URL } from './constants'

/**
 * Freightify uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Freightify API keys settings page.
 * exchangeApiKey:      Treats the key directly as the access token.
 * refreshCredentials:  API keys do not expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // Freightify has no OAuth2 flow — direct users to their API keys page.
  return FREIGHTIFY_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Freightify API keys do not expire.
  return credentials
}

/**
 * Build the api-key header value for Freightify requests.
 */
export function authHeader(apiKey: string): string {
  return apiKey
}
