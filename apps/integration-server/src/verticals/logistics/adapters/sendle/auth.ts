import type { Credentials } from '../../adapter/interface'
import { SENDLE_DASHBOARD_URL } from './constants'

/**
 * Sendle uses Basic authentication with SENDLE_ID:API_KEY.
 *
 * getAuthUrl:          Returns the Sendle API settings page (no OAuth flow).
 * exchangeApiKey:      Stores the SENDLE_ID:API_KEY pair. The "code" parameter
 *                      is expected to be "sendle_id:api_key".
 * refreshCredentials:  API keys never expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return SENDLE_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey is expected to be "sendle_id:api_key"
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Sendle API keys do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Sendle requests.
 * Sendle uses Basic auth with base64-encoded SENDLE_ID:API_KEY.
 */
export function authHeader(accessToken: string): string {
  const encoded = Buffer.from(accessToken).toString('base64')
  return `Basic ${encoded}`
}
