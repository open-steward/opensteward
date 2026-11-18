/**
 * Squarespace auth helpers.
 *
 * Squarespace Commerce API uses a long-lived API key — there is no OAuth
 * flow. The key is passed as a Bearer token. `getAuthUrl` and `exchangeCode`
 * are effectively no-ops (the user supplies the key directly), and
 * `refreshCredentials` returns credentials unchanged since they never expire.
 *
 * Docs: https://developers.squarespace.com/commerce-apis/authentication
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Build a "no-op" auth URL. Squarespace doesn't use OAuth — the user creates
 * an API key in Site Settings > Advanced > Developer API Keys.
 */
export function buildAuthUrl(): string {
  return 'https://account.squarespace.com/settings/advanced/developer-api-keys'
}

/**
 * Wrap a raw API key string into the Credentials shape.
 */
export function credentialsFromApiKey(apiKey: string): Credentials {
  return {
    accessToken: apiKey,
  }
}
