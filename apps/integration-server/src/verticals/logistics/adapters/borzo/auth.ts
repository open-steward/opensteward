import type { Credentials } from '../../adapter/interface'
import { BORZO_DASHBOARD_URL } from './constants'

/**
 * Borzo uses a simple API key authentication scheme.
 * The secret token is passed via the X-DV-Auth-Token request header.
 *
 * buildAuthUrl:        Returns the Borzo business dashboard where users find their token.
 * exchangeApiKey:      Stores the raw API key as the access token.
 * refreshCredentials:  Keys do not expire; returns credentials unchanged.
 */

export function buildAuthUrl(_state: string): string {
  return BORZO_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
