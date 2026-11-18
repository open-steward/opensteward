import type { Credentials } from '../../adapter/interface'
import { SHYPLITE_DASHBOARD_URL } from './constants'

/**
 * Shyplite uses API key authentication — not OAuth2.
 *
 * buildAuthUrl:        Returns the Shyplite API settings page (no redirect flow).
 * exchangeApiKey:      Treats the "code" parameter as the API key and stores it
 *                      directly as the access token.
 * refreshCredentials:  API keys never expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return SHYPLITE_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
