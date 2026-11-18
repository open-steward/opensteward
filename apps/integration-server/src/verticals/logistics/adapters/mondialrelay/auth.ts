import type { Credentials } from '../../adapter/interface'
import { MONDIALRELAY_DASHBOARD_URL } from './constants'

/**
 * Mondial Relay uses Basic authentication with siteId:key.
 *
 * getAuthUrl:          Returns the Mondial Relay pro portal (no OAuth flow).
 * exchangeApiKey:      Stores the siteId:key pair.
 * refreshCredentials:  Basic auth keys don't expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return MONDIALRELAY_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey is expected to be "siteId:key"
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Basic auth credentials do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Mondial Relay requests.
 * Mondial Relay uses Basic auth with base64-encoded siteId:key.
 */
export function authHeader(accessToken: string): string {
  const encoded = Buffer.from(accessToken).toString('base64')
  return `Basic ${encoded}`
}
