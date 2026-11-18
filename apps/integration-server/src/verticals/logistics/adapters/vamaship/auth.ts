import type { Credentials } from '../../adapter/interface'
import { VAMASHIP_DASHBOARD_URL } from './constants'

/**
 * Vamaship uses a static API key (token) issued per seller account.
 * The key is sent in every request via the `X-Api-Token` header.
 * There is no OAuth exchange or token refresh required.
 */

export function buildAuthUrl(_state: string): string {
  return VAMASHIP_DASHBOARD_URL
}

/**
 * For API-key auth the "code" is the raw API token.
 * We store it as accessToken with no expiry.
 */
export async function exchangeCredentials(apiKey: string): Promise<Credentials> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Vamaship: API key must not be empty')
  }
  return {
    accessToken: apiKey.trim(),
    expiresAt: undefined,
    extra: {},
  }
}

/**
 * API keys do not expire — return credentials as-is.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

export function isTokenExpired(_credentials: Credentials): boolean {
  return false
}

