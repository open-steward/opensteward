/**
 * Central Transport — auth helpers.
 *
 * Central Transport integrates via Piyovi's unified carrier platform.
 * Authentication is done with an API key passed as the `X-API-KEY` header.
 * The key is issued by Piyovi (App → Configuration → API KEY) and does not
 * expire on a fixed schedule, so refreshCredentials is a no-op passthrough.
 */
import type { Credentials } from '../../adapter/interface'
import { CENTRAL_TRANSPORT_DASHBOARD_URL } from './constants'

/**
 * Returns the Piyovi API-key configuration URL.
 * Central Transport has no OAuth redirect flow; the user copies the key
 * from the Piyovi dashboard.
 */
export function buildAuthUrl(_state: string): string {
  return CENTRAL_TRANSPORT_DASHBOARD_URL
}

/**
 * Store an API key as credentials.
 * The key is stored in `accessToken`; no expiry is set.
 */
export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey.trim() }
}

/**
 * API keys issued by Piyovi do not expire.
 * This function is provided for interface compliance and returns the
 * existing credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * Build the authorization header value.
 * Piyovi's REST API accepts the key via `X-API-KEY`; this helper returns
 * the raw key value to be set on that header.
 */
export function apiKeyHeader(accessToken: string): string {
  return accessToken
}
