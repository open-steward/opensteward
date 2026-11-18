import type { Credentials } from '../../adapter/interface'
import { SHIPTHEORY_DASHBOARD_URL } from './constants'

/**
 * Shiptheory uses an email + password pair to obtain a short-lived JWT bearer
 * token (60-minute TTL). The token endpoint is POST /token.
 *
 * In the Connect-Link / simple-API-key flow we treat the concatenated
 * "email:password" string as the stored credential and re-authenticate on
 * every token refresh. The accessToken field holds the live JWT; the
 * refreshToken field holds the raw "email:password" needed to re-issue it.
 *
 * getAuthUrl:          Returns the Shiptheory login page (no OAuth redirect).
 * exchangeApiKey:      Accepts the "email:password" credential and issues an
 *                      initial JWT by POSTing to /token.
 * refreshCredentials:  Re-issues the JWT using the stored refreshToken.
 */

export function buildAuthUrl(_state: string): string {
  return SHIPTHEORY_DASHBOARD_URL
}

/**
 * The credential string is "email:password".
 * Returns credentials with accessToken = JWT, refreshToken = "email:password".
 */
export async function exchangeApiKey(emailPassword: string): Promise<Credentials> {
  // Defer actual network call to the client. Here we just store the raw
  // credential so the adapter can call authenticate() on first use.
  return {
    accessToken: '',
    refreshToken: emailPassword,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Credentials object retains the refreshToken (email:password).
  // The adapter will call authenticate() when it detects an expired token.
  return credentials
}

/**
 * Build the Authorization header value for Shiptheory requests.
 */
export function authHeader(token: string): string {
  return `Bearer ${token}`
}

/**
 * Parse "email:password" from the refreshToken field.
 * The colon separator is safe because email addresses cannot contain colons.
 */
export function parseEmailPassword(refreshToken: string): { email: string; password: string } {
  const idx = refreshToken.indexOf(':')
  if (idx === -1) {
    return { email: refreshToken, password: '' }
  }
  return {
    email: refreshToken.slice(0, idx),
    password: refreshToken.slice(idx + 1),
  }
}
