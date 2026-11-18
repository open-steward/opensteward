import type { Credentials } from '../../adapter/interface'
import { JADLOG_DASHBOARD_URL } from './constants'

/**
 * Jadlog uses Bearer-token authentication — there is no OAuth2 flow.
 *
 * getAuthUrl:          Directs users to the Jadlog Embarcador portal where
 *                      they can retrieve their integration token.
 * exchangeApiKey:      Treats the supplied token string directly as the
 *                      access credential (no exchange step).
 * refreshCredentials:  Jadlog tokens do not expire; returns as-is.
 */

export function buildAuthUrl(_state: string): string {
  // No OAuth flow — send users to their Jadlog portal page.
  return JADLOG_DASHBOARD_URL
}

export async function exchangeApiKey(token: string): Promise<Credentials> {
  // The bearer token IS the credential; nothing to exchange.
  return { accessToken: token }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Jadlog tokens do not expire.
  return credentials
}

/**
 * Build the Authorization header value.
 * Jadlog expects `Bearer <token>` format.
 */
export function authHeader(token: string): string {
  return `Bearer ${token}`
}
