/**
 * nopCommerce "auth" helpers.
 *
 * nopCommerce uses API key / bearer token authentication. Store owners
 * generate a token in the admin panel under Configuration > Web API.
 * There is no OAuth2 authorization-code flow.
 *
 * The adapter therefore:
 *  - Points `getAuthUrl` at the admin API configuration page (informational only).
 *  - Throws from `exchangeCode` with clear instructions so ambiguous
 *    callers fail loudly instead of pretending to support the flow.
 *
 * Once created, credentials are passed to the adapter via
 * `POST /v1/connections` with
 * `{ platform: 'nopcommerce', credentials: { apiToken, host } }`.
 *
 * Docs: https://docs.nopcommerce.com/en/developer/web-api/index.html
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(host: string): string {
  // Informational redirect — NOT a functional OAuth authorize URL.
  return `${host.replace(/\/$/, '')}/Admin/Plugin/ConfigureMiscPlugin?systemName=Nop.Plugin.Api`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'nopCommerce does not use OAuth code exchange. ' +
      'Generate an API key in the nopCommerce admin under Configuration > Web API, ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "nopcommerce", credentials: {apiToken, host}}`.',
  )
}
