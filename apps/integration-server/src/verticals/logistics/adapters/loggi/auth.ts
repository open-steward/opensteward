import type { Credentials } from '../../adapter/interface'
import { LOGGI_DASHBOARD_URL } from './constants'

/**
 * Loggi uses a client_credentials OAuth2 flow.
 *
 * getAuthUrl:          Returns the Loggi API settings page (no redirect flow).
 * exchangeApiKey:      Treats the credential string as a pre-issued bearer
 *                      token (or raw API key) and stores it directly.
 * refreshCredentials:  Returns the token unchanged; the client layer handles
 *                      401 retries, and callers re-exchange credentials when
 *                      a 401 is encountered (bearer tokens may expire).
 */

export function buildAuthUrl(_state: string): string {
  // Loggi has no OAuth2 redirect flow for third-party apps.
  return LOGGI_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The bearer token IS the credential — no additional exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Bearer tokens from Loggi's client_credentials flow have a finite TTL.
  // A full re-authentication would require client_id + client_secret which
  // are stored in the connection's `refreshToken` / extra fields by the
  // Connect-Link wizard.  Returns credentials unchanged — consumers detect
  // 401 and re-issue credentials via the wizard.
  return credentials
}

/**
 * Build the Authorization header value for Loggi requests.
 */
export function authHeader(bearerToken: string): string {
  return `Bearer ${bearerToken}`
}
