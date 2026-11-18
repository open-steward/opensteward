import type { Credentials } from '../../adapter/interface'

/**
 * Mothership uses static Bearer tokens (api_key auth).
 * Tokens are obtained from https://dashboard.mothership.build/settings/api
 * and do not expire — no refresh mechanism needed.
 */

export function buildAuthHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}

export function credentialsFromApiKey(apiKey: string): Credentials {
  return {
    accessToken: apiKey,
    // Static tokens do not expire
    expiresAt: undefined,
  }
}

export function isTokenExpired(_credentials: Credentials): boolean {
  // Mothership tokens are long-lived; no expiry management required
  return false
}
