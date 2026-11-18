import type { Credentials } from '../../adapter/interface'
import { CURRI_DASHBOARD_URL } from './constants'

export interface CurriAuthConfig {
  userId: string
  apiKey: string
}

/**
 * Build the Basic Auth header value for Curri.
 * Curri uses HTTP Basic Auth: base64(userId + ':' + apiKey).
 */
export function buildBasicAuthHeader(userId: string, apiKey: string): string {
  const encoded = Buffer.from(`${userId}:${apiKey}`).toString('base64')
  return `Basic ${encoded}`
}

export function buildAuthUrl(_state: string): string {
  return CURRI_DASHBOARD_URL
}

/**
 * For API-key auth, the "code" is expected to be "userId:apiKey".
 * We store userId and apiKey in extras; no expiry for static API keys.
 */
export function exchangeCredentials(config: CurriAuthConfig): Credentials {
  return {
    accessToken: buildBasicAuthHeader(config.userId, config.apiKey),
    extra: {
      userId: config.userId,
      apiKey: config.apiKey,
    },
  }
}

export function refreshCredentials(credentials: Credentials): Credentials {
  // Static API keys do not expire — return as-is
  return credentials
}
