/**
 * GOFRUGAL "auth" helpers.
 *
 * GOFRUGAL's eCommerce Integration API does NOT use OAuth — it's a static
 * `X-Auth-Token` API key configured inside the merchant's own RetailEasy
 * installation, plus the merchant's own WebReporter base URL (there is no
 * single GOFRUGAL-hosted host; every deployment is on-premises). The
 * adapter therefore:
 *
 *  - Points `getAuthUrl` at the integration docs (informational only).
 *  - Throws from `exchangeCode` with clear instructions so ambiguous
 *    callers fail loudly instead of pretending to support OAuth.
 *
 * Real credentials are collected via the Connect Link credential form
 * (./connect-form.ts) and passed to `POST /v1/connections` as
 * `{ platform: 'gofrugal', credentials: { apiKey, baseUrl } }`.
 *
 * Docs: https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/api-integration
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  // Informational redirect — NOT a functional OAuth authorize URL.
  return 'https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/api-integration'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'GOFRUGAL does not use OAuth code exchange. ' +
      "Configure an X-Auth-Token API key inside the merchant's RetailEasy " +
      'installation, then POST it and the WebReporter base URL to /v1/connections ' +
      'with body `{platform: "gofrugal", credentials: {apiKey, baseUrl}}`.',
  )
}
