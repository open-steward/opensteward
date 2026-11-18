import type { Credentials } from '../../adapter/interface'
import { TRACK17_DASHBOARD_URL } from './constants'

/**
 * 17TRACK uses API key authentication — not OAuth2.
 *
 * getAuthUrl:           Returns the 17TRACK API settings page (no redirect flow).
 * exchangeApiKey:       Treats the API key as the access token directly.
 * refreshCredentials:   API keys never expire; returns existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // 17TRACK has no OAuth2 flow — direct users to their API settings page.
  return TRACK17_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // 17TRACK API keys do not expire.
  return credentials
}
