/**
 * Shuup "auth" helpers.
 *
 * Shuup does NOT use an OAuth2 authorization-code flow. The store owner
 * obtains a DRF token from `POST /api/v1/auth/` (or a JWT from
 * `POST /api/v1/auth/jwt/`) and supplies it once when registering the
 * connection. The adapter therefore:
 *
 *  - Throws descriptively from `getAuthUrl` — there is no OAuth authorize
 *    URL to redirect to.
 *  - Throws from `exchangeCode` with clear instructions for callers that
 *    try the OAuth flow.
 *  - Returns credentials unchanged from `refreshCredentials` — DRF tokens
 *    are static and do not expire.
 *
 * Credentials are passed to the adapter via `POST /v1/connections` with:
 * ```json
 * {
 *   "platform": "shuup",
 *   "credentials": {
 *     "accessToken": "<drf-token>",
 *     "extra": { "baseUrl": "https://myshop.example.com" }
 *   }
 * }
 * ```
 *
 * Docs: https://shuup.readthedocs.io/en/latest/api/
 */

import type { Credentials } from '@opensteward/shared'

export function getAuthUrl(_state: string): string {
  throw new Error(
    'Shuup uses DRF token auth — there is no OAuth authorize URL. ' +
      'Obtain a token via POST /api/v1/auth/ on your Shuup installation and POST it to ' +
      '/v1/connections with body `{ platform: "shuup", credentials: { accessToken: "<token>", ' +
      'extra: { baseUrl: "https://myshop.example.com" } } }`.',
  )
}

export async function exchangeCode(
  _code: string,
  _redirectUri: string,
): Promise<Credentials> {
  throw new Error(
    'Shuup uses DRF token auth — exchangeCode is not applicable. ' +
      'POST your static DRF token directly to /v1/connections.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // DRF tokens are static and never expire.
  return credentials
}
