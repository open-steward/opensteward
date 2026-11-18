import type { Credentials } from '../../adapter/interface'
import { CHRONOPOST_DASHBOARD_URL } from './constants'

/**
 * Chronopost uses Basic authentication with accountNumber:password.
 *
 * getAuthUrl:          Returns the Chronopost dashboard page (no OAuth flow).
 * exchangeApiKey:      Stores the accountNumber:password pair as accessToken.
 * refreshCredentials:  API keys never expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return CHRONOPOST_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey is expected to be "accountNumber:password"
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Chronopost API keys do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Chronopost requests.
 * Chronopost uses Basic auth with base64-encoded accountNumber:password.
 */
export function authHeader(accessToken: string): string {
  const encoded = Buffer.from(accessToken).toString('base64')
  return `Basic ${encoded}`
}
