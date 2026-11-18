import type { Credentials } from '../../adapter/interface'
import { SHIPSY_DASHBOARD_URL } from './constants'

/**
 * Shipsy uses a simple API key authentication scheme.
 * The key is passed via the Authorization header without a Bearer prefix.
 *
 * buildAuthUrl:        Returns the Shipsy dashboard where users find their API key.
 * exchangeApiKey:      Stores the raw API key as the access token.
 * refreshCredentials:  Keys do not expire; returns credentials unchanged.
 */

export function buildAuthUrl(_state: string): string {
  return SHIPSY_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
