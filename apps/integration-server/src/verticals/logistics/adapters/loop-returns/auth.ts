import type { Credentials } from '../../adapter/interface'
import { LOOP_RETURNS_DASHBOARD_URL } from './constants'

/**
 * Loop Returns uses API key authentication — not OAuth2.
 *
 * getAuthUrl:           Returns the Loop Returns API keys settings page (no redirect flow).
 * exchangeApiKey:       Treats the "code" parameter as the API key and stores it
 *                       directly as the access token.
 * refreshCredentials:   API keys never expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // Loop Returns has no OAuth2 flow — direct users to their API keys page.
  return LOOP_RETURNS_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Loop Returns API keys do not expire.
  return credentials
}

/**
 * Build the auth header value for Loop Returns requests.
 * Loop Returns uses a custom `X-Authorization` header.
 */
export function authHeader(apiKey: string): string {
  return apiKey
}
