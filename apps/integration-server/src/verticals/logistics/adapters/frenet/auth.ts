import type { Credentials } from '../../adapter/interface'
import { FRENET_DASHBOARD_URL } from './constants'

/**
 * Frenet uses API key (token) authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Frenet settings page (no redirect flow).
 * exchangeApiKey:      Treats the provided key as the credential directly.
 * refreshCredentials:  Tokens do not expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  return FRENET_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
