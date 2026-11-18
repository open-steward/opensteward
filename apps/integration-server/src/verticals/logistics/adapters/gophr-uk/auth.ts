import type { Credentials } from '../../adapter/interface'
import { GOPHR_UK_DASHBOARD_URL } from './constants'

/**
 * Gophr UK uses API-key authentication.
 * The key is passed as-is via the `API-KEY` request header — no OAuth exchange needed.
 */

export function buildAuthUrl(_state: string): string {
  return GOPHR_UK_DASHBOARD_URL
}

/**
 * For the Connect Link simple-API-key flow the raw key is the "code".
 */
export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

/**
 * API keys do not expire — return the credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
