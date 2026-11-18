import type { Credentials } from '../../adapter/interface'
import { DHL_DASHBOARD_URL } from './constants'

/**
 * DHL Express uses HTTP Basic authentication with apiKey:apiSecret.
 *
 * getAuthUrl:          Returns the DHL Developer portal (no OAuth flow).
 * exchangeApiKey:      Stores the apiKey:apiSecret pair. The "code" parameter
 *                      is expected to be "apiKey:apiSecret".
 * refreshCredentials:  API keys never expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return DHL_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey is expected to be "apiKey:apiSecret"
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // DHL API keys do not expire.
  return credentials
}

/**
 * Build the Authorization header value for DHL Express requests.
 * DHL uses Basic auth with base64-encoded apiKey:apiSecret.
 */
export function authHeader(accessToken: string): string {
  const encoded = Buffer.from(accessToken).toString('base64')
  return `Basic ${encoded}`
}
