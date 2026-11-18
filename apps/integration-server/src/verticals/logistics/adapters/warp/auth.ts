import type { Credentials } from '../../adapter/interface'
import { WARP_DASHBOARD_URL } from './constants'

/**
 * Warp uses static API key auth — no OAuth flow.
 * The API key (wak_live_* or wak_test_*) is stored in credentials.accessToken.
 * There is no token expiry or refresh for API keys.
 */

export function buildAuthUrl(_state: string): string {
  // Warp does not have an OAuth flow — direct users to the dashboard to obtain an API key.
  return `${WARP_DASHBOARD_URL}/settings/api`
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error('warp: OAuth code exchange is not supported — use API key auth')
}

/**
 * API keys do not expire; return credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * API keys never expire — always return false.
 */
export function isTokenExpired(_credentials: Credentials): boolean {
  return false
}

/**
 * Build the Bearer authorization header value from an API key.
 */
export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
