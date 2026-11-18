import type { Credentials } from '../../adapter/interface'
import { GLS_DASHBOARD_URL } from './constants'

/**
 * GLS uses Basic authentication with contactId:password.
 *
 * getAuthUrl:          Returns the GLS API portal (no OAuth flow).
 * exchangeApiKey:      Stores the contactId:password pair.
 * refreshCredentials:  Basic auth keys don't expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return GLS_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey is expected to be "contactId:password"
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Basic auth credentials do not expire.
  return credentials
}

/**
 * Build the Authorization header value for GLS requests.
 * GLS uses Basic auth with base64-encoded contactId:password.
 */
export function authHeader(accessToken: string): string {
  const encoded = Buffer.from(accessToken).toString('base64')
  return `Basic ${encoded}`
}
