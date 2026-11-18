import type { Credentials } from '../../adapter/interface'
import { SEAVANTAGE_DASHBOARD_URL } from './constants'

/**
 * Provides a redirect target for the Connect Link UI — opens the SeaVantage
 * developer portal so the user can copy their API key.
 */
export function buildAuthUrl(_state: string): string {
  return SEAVANTAGE_DASHBOARD_URL
}

/**
 * Wraps a raw API key string as an access token credential.
 */
export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

/**
 * API-key credentials never expire — return as-is.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
