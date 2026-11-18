/**
 * CS-Cart "auth" helpers.
 *
 * CS-Cart does NOT use OAuth2. Authentication is HTTP Basic auth built from
 * the admin email address and an API key generated in the CS-Cart back-end
 * under My profile → API access.
 *
 * Credentials are passed to the adapter via `POST /v1/connections` with:
 * ```json
 * {
 *   "platform": "cscart",
 *   "credentials": {
 *     "accessToken": "<api-key>",
 *     "extra": {
 *       "baseUrl": "https://mystore.example.com",
 *       "email": "admin@mystore.example.com"
 *     }
 *   }
 * }
 * ```
 *
 * Docs: https://docs.cs-cart.com/4.16.x/developer_guide/api/
 */

import type { Credentials } from '@opensteward/shared'

/**
 * CS-Cart has no OAuth authorize URL. This throws a descriptive error so
 * callers that try the code-exchange flow fail loudly.
 */
export function getAuthUrl(_state: string): string {
  throw new Error(
    'CS-Cart uses API key auth — no OAuth URL. ' +
      'Generate an API key in the CS-Cart back-end under My profile → API access, ' +
      'then POST credentials to /v1/connections with ' +
      '`{ accessToken: "<api-key>", extra: { baseUrl, email } }`.',
  )
}

export function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'CS-Cart uses API key auth — exchangeCode is not applicable. ' +
      'Supply credentials directly via POST /v1/connections.',
  )
}

export function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // CS-Cart API keys do not expire.
  return Promise.resolve(credentials)
}

/**
 * Build the HTTP Basic auth header value from email + apiKey.
 * CS-Cart uses `email:apiKey` as the credential pair.
 */
export function buildBasicAuth(email: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`
}
