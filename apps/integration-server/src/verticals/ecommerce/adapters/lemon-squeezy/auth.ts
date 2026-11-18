/**
 * Lemon Squeezy auth helpers.
 *
 * Lemon Squeezy uses long-lived API keys issued in the dashboard
 * (Settings → API). There is no OAuth authorization-code flow. The adapter
 * therefore:
 *
 *  - Points `getAuthUrl` at the Lemon Squeezy API settings page (informational).
 *  - Throws from `exchangeCode` with clear instructions so callers fail loudly.
 *  - Exposes `credentialFields` / `exchangeCredentials` for the Connect Link
 *    flow (single API key field).
 *
 * Auth header format: `Authorization: Bearer <api_key>`
 * Required headers:   `Accept: application/vnd.api+json`
 *
 * Docs: https://docs.lemonsqueezy.com/api/getting-started/requests
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  // Informational redirect — not a functional OAuth authorize URL.
  return 'https://app.lemonsqueezy.com/settings/api'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Lemon Squeezy does not use OAuth code exchange. ' +
      'Generate an API key at https://app.lemonsqueezy.com/settings/api, ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "lemon-squeezy", credentials: {accessToken: "<api_key>"}}`.',
  )
}
