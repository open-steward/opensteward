import type { Credentials } from '../../adapter/interface'
import { SHIPPIFY_DASHBOARD_URL } from './constants'

/**
 * Shippify uses HTTP Basic Auth — no OAuth2 redirect flow.
 *
 * getAuthUrl:          Points users to the Shippify merchant dashboard where
 *                      they can retrieve their API credentials.
 * exchangeBasicAuth:   Accepts apiId + apiSecret, encodes them as a Base64
 *                      Basic Auth token, and stores it on accessToken.
 *                      The raw values are kept in credentials.extra so the
 *                      client can reconstruct the Authorization header.
 * refreshCredentials:  Basic Auth credentials do not expire; returns as-is.
 */

export function buildAuthUrl(_state: string): string {
  return SHIPPIFY_DASHBOARD_URL
}

export async function exchangeBasicAuth(
  apiId: string,
  apiSecret: string,
): Promise<Credentials> {
  const token = Buffer.from(`${apiId}:${apiSecret}`).toString('base64')
  return {
    accessToken: token,
    extra: { apiId, apiSecret },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Basic Auth credentials do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Shippify requests.
 * accessToken is already the Base64-encoded "apiId:apiSecret" string.
 */
export function authHeader(credentials: Credentials): string {
  return `Basic ${credentials.accessToken}`
}
