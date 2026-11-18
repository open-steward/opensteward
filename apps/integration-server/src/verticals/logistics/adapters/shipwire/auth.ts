import type { Credentials } from '../../adapter/interface'
import { SHIPWIRE_DASHBOARD_URL } from './constants'

/**
 * Shipwire uses Basic authentication with email:password.
 *
 * getAuthUrl:          Returns the Shipwire developer portal (no OAuth flow).
 * exchangeApiKey:      Stores the email:password pair.
 * refreshCredentials:  Basic auth keys don't expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return SHIPWIRE_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey is expected to be "email:password"
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Basic auth credentials do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Shipwire requests.
 * Shipwire uses Basic auth with base64-encoded email:password.
 */
export function authHeader(accessToken: string): string {
  const encoded = Buffer.from(accessToken).toString('base64')
  return `Basic ${encoded}`
}
