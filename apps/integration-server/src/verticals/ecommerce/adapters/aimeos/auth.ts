/**
 * Aimeos auth helpers.
 *
 * Aimeos REST API is authenticated via a static Bearer token generated in the
 * Aimeos admin panel (or via OAuth2 if configured on the host application).
 *
 * This adapter does NOT support the authorization-code OAuth flow because
 * Aimeos token generation is an admin-side action. Credentials are configured
 * directly via POST /v1/connections:
 *
 *   {
 *     platform: "aimeos",
 *     credentials: {
 *       accessToken: "<api-token>",
 *       extra: { baseUrl: "https://myshop.example.com" }
 *     }
 *   }
 *
 * `refreshCredentials` is a no-op — static tokens do not expire unless
 * revoked in the admin panel.
 */

import type { Credentials } from '@opensteward/shared'

export function getAuthUrl(_state: string): string {
  throw new Error(
    'Aimeos uses Bearer token auth — configure via /v1/connections. ' +
      'Generate an API token in the Aimeos admin panel and POST it to ' +
      '/v1/connections with body ' +
      '`{platform: "aimeos", credentials: {accessToken, extra: {baseUrl}}}`.',
  )
}

export function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'Aimeos uses Bearer token auth — no authorization code exchange. ' +
      'POST credentials directly to /v1/connections.',
  )
}

/**
 * Static Aimeos tokens do not need refresh. Returns credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
