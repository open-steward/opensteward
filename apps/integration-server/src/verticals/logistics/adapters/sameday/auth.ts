import type { Credentials } from '../../adapter/interface'
import { SAMEDAY_DASHBOARD_URL } from './constants'

/**
 * Sameday uses username + password credentials, NOT OAuth2.
 *
 * Authentication flow:
 *   POST /api/authenticate
 *     Headers: X-Auth-Username, X-Auth-Password
 *     Body: remember_me=true
 *     Response: { token: string, expire_at: string }
 *
 * The returned JWT token is stored as `accessToken` and sent as the
 * `X-Auth-Token` header on every subsequent request. Tokens expire after
 * a short period; the client handles re-authentication transparently.
 *
 * We encode the raw credentials as `username:password` in `refreshToken`
 * so the client can re-authenticate when the JWT expires without prompting
 * the user again.
 */

export function buildAuthUrl(_state: string): string {
  // Sameday has no OAuth2 redirect flow — direct users to the dashboard.
  return SAMEDAY_DASHBOARD_URL
}

/**
 * Called during Connect-Link setup. The user supplies username and password
 * via the credential form; we store them so the client can obtain a JWT.
 */
export async function exchangeCredentials(
  username: string,
  password: string,
): Promise<Credentials> {
  return {
    accessToken: '',             // populated after first authenticate() call
    refreshToken: `${username}:${password}`,
  }
}

/**
 * Build the Authorization header value for authenticated requests.
 * Sameday uses the JWT token in the X-Auth-Token header.
 */
export function authTokenHeader(token: string): string {
  return token
}
