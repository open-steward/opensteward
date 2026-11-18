import type { Credentials } from '../../adapter/interface'
import { SHIPSGO_DASHBOARD_URL } from './constants'

/**
 * Returns the ShipsGo dashboard URL where the user can retrieve their API key.
 * ShipsGo uses a simple API-key flow (no OAuth), so we direct users to the
 * dashboard and let them paste the key into the Connect Link form.
 */
export function buildAuthUrl(_state: string): string {
  return SHIPSGO_DASHBOARD_URL
}

/**
 * Wraps a raw API key into the standard Credentials envelope.
 * The `accessToken` field stores the ShipsGo `authCode` API key.
 */
export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

/**
 * API keys do not expire — no-op refresh.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
