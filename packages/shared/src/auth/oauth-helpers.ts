/**
 * Shared OAuth2 token-endpoint helpers.
 *
 * Replaces per-adapter copies of two utilities that are byte-identical across
 * dozens of `auth.ts` files:
 *
 *   - basicAuth — build the `Authorization: Basic <base64>` value from
 *     `clientId:clientSecret` for the standard RFC 6749 § 2.3.1 client-secret
 *     basic auth used by every OAuth2 token endpoint.
 *
 *   - parseTokenResponse — turn the standard token-endpoint JSON body
 *     (RFC 6749 § 5.1) into the canonical `Credentials` shape. Tolerates
 *     missing fields: refresh_token is optional on many providers, expires_in
 *     is sometimes absent, scope is often empty.
 *
 * Adapters that need bespoke fields (Salesforce instance_url, Sage firmId,
 * Xero tenant_id) keep their own helpers — these two cover the common case.
 */
import type { Credentials } from './store'

export function basicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

/**
 * Parse an RFC 6749 § 5.1 token-endpoint response into `Credentials`.
 * Robust to missing optional fields. Returns `accessToken` typed as string
 * because every standard-compliant provider returns one — if it doesn't, the
 * caller has bigger problems than this helper.
 */
export function parseTokenResponse(data: Record<string, unknown>): Credentials {
  const expiresIn = typeof data['expires_in'] === 'number' ? data['expires_in'] : undefined
  return {
    accessToken: data['access_token'] as string,
    refreshToken:
      typeof data['refresh_token'] === 'string' ? (data['refresh_token'] as string) : undefined,
    expiresAt: expiresIn !== undefined ? new Date(Date.now() + expiresIn * 1000) : undefined,
    scope: typeof data['scope'] === 'string' ? (data['scope'] as string) : undefined,
  }
}
