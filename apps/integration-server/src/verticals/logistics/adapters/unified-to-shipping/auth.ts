/**
 * Unified.to uses API key (JWT) authentication.
 *
 * getAuthUrl:           Directs users to the Unified.to dashboard.
 * exchangeApiKey:       Stores the API key as the access token.
 *                       The caller must also supply the connection_id (which
 *                       provider connection to use) via the extra.connectionId
 *                       field — set at credential-creation time.
 * refreshCredentials:   API keys do not expire; returns credentials unchanged.
 */
import type { Credentials } from '../../adapter/interface'
import { UNIFIED_TO_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return UNIFIED_TO_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Unified.to API keys do not expire.
  return credentials
}

/**
 * Returns the Authorization header value for Unified.to API requests.
 * The API key is passed as a Bearer token (JWT scheme).
 */
export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
