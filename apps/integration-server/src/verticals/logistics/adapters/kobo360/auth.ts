import type { Credentials } from '../../adapter/interface'

/**
 * Kobo360 uses API key authentication.
 * The API key is passed in the Authorization header as "Bearer <key>"
 * or via the X-API-Key header, depending on the endpoint.
 * Credentials are static — no token exchange or refresh required.
 */

export function buildCredentialsFromApiKey(apiKey: string): Credentials {
  return {
    accessToken: apiKey,
    expiresAt: undefined,
    scope: undefined,
    extra: { apiKey },
  }
}

/**
 * API-key credentials do not expire; return them unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

export function isTokenExpired(_credentials: Credentials): boolean {
  return false
}

export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
