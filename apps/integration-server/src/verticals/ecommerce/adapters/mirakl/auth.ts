/**
 * Mirakl "auth" helpers.
 *
 * Mirakl uses a static API key for seller authentication. The key is sent
 * directly in the `Authorization` HTTP header — no "Bearer" prefix, no
 * Basic scheme — on every request.
 *
 * There is no OAuth2 authorization-code flow for the seller/shop API.
 * Credentials are obtained from the Mirakl back-office (Settings → API
 * Keys) and passed to this adapter via `POST /v1/connections` with body:
 *
 *   {
 *     platform: 'mirakl',
 *     credentials: {
 *       apiKey: '<seller-api-key>',
 *       baseUrl: 'https://<operator-instance>.mirakl.net',
 *     }
 *   }
 *
 * The `accessToken` field on `Credentials` carries the API key.
 * `credentials.extra.baseUrl` carries the operator instance base URL.
 *
 * Docs: https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Informational URL pointing operators at their Mirakl back-office API
 * keys page. Not a functional OAuth authorize endpoint.
 */
export function buildAuthUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/mmp/shop/account/api-key`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Mirakl does not use OAuth code exchange. ' +
      'Obtain your seller API key from the Mirakl back-office (Settings → API Keys), ' +
      'then POST to /v1/connections with body ' +
      '`{platform: "mirakl", credentials: {apiKey, baseUrl}}` ' +
      'where baseUrl is https://<your-operator>.mirakl.net.',
  )
}
