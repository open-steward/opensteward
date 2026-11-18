import type { Credentials } from '../../adapter/interface'
import { INNOSHIP_DASHBOARD_URL } from './constants'

/**
 * Innoship uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Innoship settings page (no redirect flow).
 * exchangeApiKey:      Treats the "code" parameter as the API key and stores it
 *                      directly as the access token.
 * refreshCredentials:  API keys never expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return INNOSHIP_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
