import type { Credentials } from '../../adapter/interface'
import { SHIPENGINE_DASHBOARD_URL } from './constants'

/**
 * ShipEngine uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the ShipEngine API management page (no redirect flow).
 * exchangeApiKey:      Treats the key as the credential and stores it directly.
 * refreshCredentials:  API keys never expire; returns the existing credentials.
 */

export function buildAuthUrl(_state: string): string {
  // ShipEngine has no OAuth2 flow — direct users to their API management page.
  return SHIPENGINE_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // ShipEngine API keys do not expire.
  return credentials
}

/**
 * Build the API-Key header value for ShipEngine requests.
 * ShipEngine uses a custom `API-Key` request header.
 */
export function apiKeyHeader(apiKey: string): string {
  return apiKey
}
