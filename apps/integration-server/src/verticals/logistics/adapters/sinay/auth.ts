import type { Credentials } from '../../adapter/interface'
import { SINAY_DASHBOARD_URL } from './constants'

/**
 * Build the auth URL for Connect Link.  Sinay uses a direct API-key flow,
 * so we return the dashboard sign-up page so users can obtain their key.
 */
export function buildAuthUrl(_state: string): string {
  return SINAY_DASHBOARD_URL
}

/**
 * Convert a raw API-key string into a Credentials object.
 * Called by the simpleApiKey() exchange path.
 */
export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

/**
 * API keys do not expire — return them as-is.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
