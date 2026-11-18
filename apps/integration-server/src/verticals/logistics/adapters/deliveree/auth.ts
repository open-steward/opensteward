import type { Credentials } from '../../adapter/interface'
import { DELIVEREE_DASHBOARD_URL } from './constants'

/**
 * Deliveree uses API key authentication — not OAuth2.
 *
 * getAuthUrl:        Returns the Deliveree developer dashboard (no redirect flow).
 * exchangeApiKey:    Treats the supplied key as the credential directly.
 * refreshCredentials: API keys do not expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return DELIVEREE_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Deliveree API keys do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Deliveree requests.
 * Deliveree uses the raw API key as the Authorization header value (no "Bearer" prefix).
 */
export function authHeader(apiKey: string): string {
  return apiKey
}
