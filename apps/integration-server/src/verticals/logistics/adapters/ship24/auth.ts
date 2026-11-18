import type { Credentials } from '../../adapter/interface'
import { SHIP24_DASHBOARD_URL } from './constants'

/**
 * Ship24 uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Ship24 API keys page (no redirect flow).
 * exchangeCode:        Treats the "code" parameter as the API key and stores it
 *                      directly as the access token.
 * refreshCredentials:  API keys never expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // Ship24 has no OAuth2 flow — direct users to their API keys page.
  return SHIP24_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Ship24 API keys do not expire.
  return credentials
}
