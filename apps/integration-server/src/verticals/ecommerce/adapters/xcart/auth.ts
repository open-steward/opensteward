/**
 * X-Cart "auth" helpers.
 *
 * X-Cart does NOT use an OAuth2 authorization-code flow. The store owner
 * generates a static API key in the X-Cart admin panel and supplies it
 * once when registering the connection. The adapter therefore:
 *
 *  - Throws descriptively from `getAuthUrl` — there is no OAuth authorize
 *    URL to redirect to.
 *  - Throws from `exchangeCode` with clear instructions for callers that
 *    try the OAuth flow.
 *  - Returns credentials unchanged from `refreshCredentials` — the key
 *    does not expire.
 *
 * Credentials are passed to the adapter via `POST /v1/connections` with
 * `{ platform: 'xcart', credentials: { accessToken: '<api-key>', extra: { baseUrl: 'https://mystore.example.com' } } }`.
 *
 * Docs: https://kb.x-cart.com/en/developer_guide/rest_api/
 */

import type { Credentials } from '@opensteward/shared'

export function getAuthUrl(_state: string): string {
  throw new Error(
    'X-Cart uses API key auth — there is no OAuth authorize URL. ' +
      'Generate an API key in your X-Cart admin panel and POST it to /v1/connections ' +
      'with body `{ platform: "xcart", credentials: { accessToken: "<api-key>", extra: { baseUrl: "https://mystore.example.com" } } }`.',
  )
}

export async function exchangeCode(
  _code: string,
  _redirectUri: string,
): Promise<Credentials> {
  throw new Error(
    'X-Cart uses API key auth — exchangeCode is not applicable. ' +
      'POST your static API key directly to /v1/connections.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // X-Cart API keys are static and never expire.
  return credentials
}
