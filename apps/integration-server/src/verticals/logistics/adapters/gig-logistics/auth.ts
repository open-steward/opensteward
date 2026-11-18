import type { Credentials } from '../../adapter/interface'
import { GIG_DASHBOARD_URL } from './constants'

/**
 * GIG Logistics uses API key authentication.
 *
 * getAuthUrl:          Returns the GIGL developer dashboard (no OAuth redirect).
 * exchangeApiKey:      Stores the provided API key as the access token directly.
 * refreshCredentials:  API keys do not expire; returns existing credentials unchanged.
 *
 * The key is sent as the `x-api-key` request header on every call.
 */

export function buildAuthUrl(_state: string): string {
  return GIG_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * Returns the header value for the GIGL API key header.
 * The caller is expected to set this as `x-api-key`.
 */
export function apiKeyHeader(apiKey: string): string {
  return apiKey
}
