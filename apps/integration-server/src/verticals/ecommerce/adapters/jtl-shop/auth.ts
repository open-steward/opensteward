/**
 * JTL-Shop auth helpers.
 *
 * JTL-Shop does NOT use an OAuth2 authorization-code flow. Authentication
 * is via a static API key generated in the JTL-Shop admin panel (Backend →
 * REST API → API-Keys). The key is sent as the `x-api-key` request header.
 *
 * Credentials are configured directly via POST /v1/connections:
 *
 *   {
 *     platform: "jtl-shop",
 *     credentials: {
 *       accessToken: "<api-key>",
 *       extra: { baseUrl: "https://myshop.example.com" }
 *     }
 *   }
 *
 * `refreshCredentials` is a no-op — static API keys do not expire unless
 * revoked in the admin panel.
 *
 * Docs: https://developer.jtl-software.com/
 */

import type { Credentials } from '@opensteward/shared'

export function getAuthUrl(_state: string): string {
  throw new Error(
    'JTL-Shop uses API key auth — configure via /v1/connections. ' +
      'Generate an API key in the JTL-Shop admin panel (Backend → REST API → API-Keys) ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "jtl-shop", credentials: {accessToken: "<api-key>", extra: {baseUrl: "https://myshop.example.com"}}}`.',
  )
}

export function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'JTL-Shop uses API key auth — no authorization code exchange. ' +
      'POST credentials directly to /v1/connections.',
  )
}

/**
 * Static JTL-Shop API keys do not expire and are not rotated. Returns
 * credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
