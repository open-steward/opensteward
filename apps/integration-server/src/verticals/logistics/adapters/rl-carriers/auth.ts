import type { Credentials } from '../../adapter/interface'
import { RL_CARRIERS_DASHBOARD_URL, RL_CARRIERS_API_KEY_HEADER } from './constants'

export interface RlCarriersAuthConfig {
  apiKey: string
}

/**
 * R+L Carriers uses static API key authentication.
 * The key is issued through the MyRLC Account portal and never expires.
 * We store the API key as the accessToken so the credential store works uniformly.
 */
export function buildAuthUrl(_state: string): string {
  return RL_CARRIERS_DASHBOARD_URL
}

/**
 * For API key auth, "exchanging" a code just wraps the already-known key
 * into a Credentials object.  The caller is expected to pass the raw apiKey
 * as the `code` argument.
 */
export function exchangeApiKey(apiKey: string): Credentials {
  return {
    accessToken: apiKey,
    // API keys do not expire
    expiresAt: undefined,
  }
}

/**
 * API keys never expire, so a refresh is a no-op that returns the credentials
 * unchanged.
 */
export function refreshCredentials(credentials: Credentials): Credentials {
  return credentials
}

/**
 * Build the Authorization headers required by R+L Carriers REST API.
 * The API expects a single header: `apiKey: <value>`
 */
export function authHeaders(accessToken: string): Record<string, string> {
  return {
    [RL_CARRIERS_API_KEY_HEADER]: accessToken,
  }
}
