import type { Credentials } from '../../adapter/interface'
import { SAMSARA_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS } from './constants'

export interface SamsaraAuthConfig {
  apiKey: string
}

/**
 * Samsara uses a static API key (Bearer token). There is no OAuth flow —
 * the key is created once in the Samsara Dashboard and never expires unless
 * the user rotates it manually. We model it as a non-expiring Credentials
 * object whose accessToken is the raw API key.
 */
export function buildCredentials(config: SamsaraAuthConfig): Credentials {
  return {
    accessToken: config.apiKey,
    // No server-side expiry for static API keys
    expiresAt: undefined,
    extra: { apiKey: config.apiKey },
  }
}

/**
 * There is no OAuth redirect for Samsara. We return the dashboard URL
 * as a convenience link for users who need to generate an API token.
 */
export function buildAuthUrl(_state: string): string {
  return SAMSARA_DASHBOARD_URL
}

/**
 * API keys are static; "refresh" simply re-wraps the same key.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const apiKey = (extra.apiKey as string | undefined) ?? credentials.accessToken
  return buildCredentials({ apiKey })
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
