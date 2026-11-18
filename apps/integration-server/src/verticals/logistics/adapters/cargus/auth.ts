import type { Credentials } from '../../adapter/interface'
import { CARGUS_DASHBOARD_URL } from './constants'

/**
 * Cargus uses a two-layer auth scheme:
 *
 *  1. Every request carries `Ocp-Apim-Subscription-Key: <apiKey>` (the
 *     Azure API Management subscription key issued at sign-up).
 *  2. Mutating endpoints additionally require a short-lived Bearer token
 *     obtained by calling POST /LoginUser with the operator's username and
 *     password.  We model the apiKey as the `accessToken` field on
 *     Credentials and store the optional session token as `refreshToken` so
 *     that the client can re-use it across calls within the same adapter
 *     instance.
 *
 * getAuthUrl:        Points the user to the developer portal (no OAuth flow).
 * exchangeApiKey:    Stores the raw API key as the credential.
 * refreshCredentials: API keys do not expire; session tokens are refreshed on
 *                     demand by the client; this function is a no-op pass-through.
 */

export function buildAuthUrl(_state: string): string {
  return CARGUS_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API subscription keys do not expire.
  return credentials
}

/**
 * Returns the Ocp-Apim-Subscription-Key header value (the raw API key).
 */
export function subscriptionKeyHeader(apiKey: string): string {
  return apiKey
}

/**
 * Returns the Bearer token Authorization header value, or undefined when no
 * session token is available (read-only endpoints that accept key-only auth).
 */
export function bearerHeader(sessionToken: string | undefined): string | undefined {
  if (!sessionToken) return undefined
  return `Bearer ${sessionToken}`
}
