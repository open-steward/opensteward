/**
 * Dukaan auth helpers.
 *
 * Dukaan does NOT use OAuth2's authorization-code flow. Sellers generate
 * an API token (store token) directly from their Dukaan dashboard under
 * Settings → API. The adapter therefore:
 *
 *  - Points `getAuthUrl` at the seller dashboard settings page (informational).
 *  - Throws from `exchangeCode` with clear instructions so callers fail
 *    loudly instead of silently pretending to support the flow.
 *
 * Once generated, the store token is passed to the adapter via
 * `POST /v1/connections` with
 * `{ platform: 'dukaan', credentials: { accessToken: '<store_token>' } }`.
 *
 * Docs: https://documenter.getpostman.com/view/25389466/2s9Yynk3f7
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  // Informational redirect — NOT a functional OAuth authorize URL.
  return 'https://web.mydukaan.io/settings/api'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Dukaan does not use OAuth code exchange. ' +
      'Generate an API (store) token in the Dukaan seller dashboard under Settings → API, ' +
      'then POST it to /v1/connections with body ' +
      '`{ platform: "dukaan", credentials: { accessToken: "<store_token>" } }`.',
  )
}
