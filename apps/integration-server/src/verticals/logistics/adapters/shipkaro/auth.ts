import type { Credentials } from '../../adapter/interface'
import { SHIPKARO_DASHBOARD_URL } from './constants'

/**
 * ShipKaro uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the ShipKaro dashboard (no OAuth redirect flow).
 * exchangeApiKey:      Stores the API key directly as the credential.
 * refreshCredentials:  API keys never expire; returns existing credentials.
 * apiKeyHeader:        Builds the `access-key` header value.
 */

export function buildAuthUrl(_state: string): string {
  // ShipKaro has no OAuth2 flow — direct users to their dashboard.
  return SHIPKARO_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // The API key IS the credential — no exchange needed.
  return {
    accessToken: apiKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // ShipKaro API keys do not expire.
  return credentials
}

/**
 * Build the access-key header value for ShipKaro requests.
 * ShipKaro uses a custom `access-key` request header.
 */
export function apiKeyHeader(apiKey: string): string {
  return apiKey
}
