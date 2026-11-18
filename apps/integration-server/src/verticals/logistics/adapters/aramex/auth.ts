import type { Credentials } from '../../adapter/interface'
import { ARAMEX_DASHBOARD_URL } from './constants'

/**
 * Aramex uses Basic authentication with accountNumber:accountPin.
 * Additional context (accountEntity, countryCode) is stored in credentials.extra.
 *
 * getAuthUrl:          Returns the Aramex developer portal (no OAuth flow).
 * exchangeApiKey:      Stores the accountNumber:accountPin pair.
 * refreshCredentials:  Basic auth keys don't expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return ARAMEX_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey is expected to be "accountNumber:accountPin"
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Aramex Basic auth credentials do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Aramex requests.
 * Aramex uses Basic auth with base64-encoded accountNumber:accountPin.
 */
export function authHeader(accessToken: string): string {
  const encoded = Buffer.from(accessToken).toString('base64')
  return `Basic ${encoded}`
}
