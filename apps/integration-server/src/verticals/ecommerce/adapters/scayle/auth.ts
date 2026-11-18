/**
 * SCAYLE Admin API auth helpers.
 *
 * SCAYLE uses API-key authentication — there is no OAuth authorization-code
 * flow. Credentials are static API keys generated in the SCAYLE Panel.
 * The key is sent as the `X-Access-Token` request header on every call.
 *
 * This adapter therefore:
 *  - Points `getAuthUrl` at the SCAYLE Panel API-keys page (informational only).
 *  - Throws from `exchangeCode` with clear instructions so ambiguous callers
 *    fail loudly instead of pretending to support the OAuth flow.
 *
 * Credentials passed to the adapter via `POST /v1/connections`:
 *   {
 *     platform: 'scayle',
 *     credentials: {
 *       accessToken: '<api-key>',
 *       extra: { tenantSpace: 'acme-live', shopKey: 'my-shop', countryCode: 'DE' }
 *     }
 *   }
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(tenantSpace: string): string {
  // Informational redirect — NOT a functional OAuth authorize URL.
  return `https://${tenantSpace}.panel.scayle.cloud/settings/api-keys`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'SCAYLE does not use OAuth code exchange. ' +
      'Create an API key in the SCAYLE Panel under Settings → API Keys, ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "scayle", credentials: {accessToken: "<key>", extra: {tenantSpace: "acme-live", shopKey: "my-shop", countryCode: "DE"}}}`.',
  )
}
