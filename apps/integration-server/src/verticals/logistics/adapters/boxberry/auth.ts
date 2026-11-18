import type { Credentials } from '../../adapter/interface'
import { BOXBERRY_DASHBOARD_URL } from './constants'

/**
 * Boxberry uses token-based API key authentication — there is no OAuth2 flow.
 *
 * getAuthUrl:         Returns the Boxberry account dashboard (no redirect flow).
 * exchangeApiKey:     Stores the token directly as the access token.
 * refreshCredentials: API tokens do not expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // No OAuth2 flow — direct users to the Boxberry account dashboard.
  return BOXBERRY_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API token IS the credential — no exchange required.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Boxberry API tokens do not expire.
  return credentials
}
