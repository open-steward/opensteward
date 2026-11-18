/**
 * IONOS auth helpers.
 *
 * IONOS uses API key authentication for its ecommerce REST API. There is no
 * OAuth2 authorization-code flow — API keys are generated from the IONOS
 * developer portal or admin panel.
 *
 * Credentials are passed to the adapter via `POST /v1/connections` with:
 *   `{ platform: 'ionos', credentials: { accessToken: '<api-key>' } }`
 *
 * Docs: https://developer.hosting.ionos.com/
 */

import type { Credentials } from '@opensteward/shared'

export function getAuthUrl(_state: string): string {
  throw new Error(
    'IONOS does not use an OAuth authorization URL. ' +
      'Generate an API key from the IONOS developer portal or admin panel, ' +
      'then POST it to /v1/connections with body ' +
      '`{ platform: "ionos", credentials: { accessToken: "<api-key>" } }`.',
  )
}

export function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'IONOS does not use OAuth code exchange. ' +
      'Generate an API key from the IONOS developer portal, ' +
      'then POST it to /v1/connections with body ' +
      '`{ platform: "ionos", credentials: { accessToken: "<api-key>" } }`.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // IONOS API keys do not expire — return credentials unchanged.
  return credentials
}
