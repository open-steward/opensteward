import type { Credentials } from '../../adapter/interface'
import { WONDERMENT_DASHBOARD_URL } from './constants'

/**
 * Wonderment uses API key authentication — not OAuth2.
 *
 * getAuthUrl:         Returns the Wonderment settings page (no redirect flow).
 * exchangeApiKey:     Treats the "code" parameter as the API key and stores it
 *                     directly as the access token.
 * refreshCredentials: API keys do not expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return WONDERMENT_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
