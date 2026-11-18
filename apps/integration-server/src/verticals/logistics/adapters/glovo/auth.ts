import type { Credentials } from '../../adapter/interface'
import { GLOVO_DASHBOARD_URL } from './constants'

/**
 * Glovo Business API uses API key authentication.
 *
 * The API key is obtained from the Credentials section of the Glovo business
 * dashboard. The key is passed in the `Authorization` header as a Bearer token.
 *
 * buildAuthUrl:        Returns the Glovo dashboard credentials page (no redirect flow).
 * exchangeApiKey:      Stores the supplied key directly as the access token.
 * refreshCredentials:  API keys do not expire; returns credentials unchanged.
 */

export function buildAuthUrl(_state: string): string {
  return GLOVO_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * Build the Authorization header value for Glovo requests.
 * Glovo uses a raw token (no "Bearer" prefix) per their API spec security scheme.
 */
export function authHeader(apiKey: string): string {
  return apiKey
}
