import type { Credentials } from '../../adapter/interface'
import { ESHIPZ_DASHBOARD_URL, ESHIPZ_AUTH_HEADER } from './constants'

/**
 * eShipz uses a static API token — no OAuth exchange needed.
 * The "code" passed to exchangeCode is the raw API token string.
 */
export function buildAuthUrl(_state: string): string {
  return ESHIPZ_DASHBOARD_URL
}

export function exchangeApiKey(apiKey: string): Credentials {
  return {
    accessToken: apiKey,
    // Static API tokens do not expire
    expiresAt: undefined,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Static key — nothing to refresh
  return credentials
}

export function isTokenExpired(_credentials: Credentials): boolean {
  return false
}

export function authHeaders(accessToken: string): Record<string, string> {
  return {
    [ESHIPZ_AUTH_HEADER]: accessToken,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}
