import type { Credentials } from '../../adapter/interface'
import { OMNIVA_DASHBOARD_URL } from './constants'

/**
 * Omniva uses Basic authentication with username:password.
 *
 * getAuthUrl:          Returns the Omniva developer portal (no OAuth flow).
 * exchangeApiKey:      Stores the username:password pair.
 * refreshCredentials:  Basic auth keys don't expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return OMNIVA_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey is expected to be "username:password"
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Basic auth credentials do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Omniva requests.
 * Omniva uses Basic auth with base64-encoded username:password.
 */
export function authHeader(accessToken: string): string {
  const encoded = Buffer.from(accessToken).toString('base64')
  return `Basic ${encoded}`
}
