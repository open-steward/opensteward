/**
 * VTEX "auth" helpers.
 *
 * VTEX uses application key + token pairs for server-to-server REST access.
 * These are created in the VTEX Admin under Account Management → API Keys and
 * passed as `X-VTEX-API-AppKey` / `X-VTEX-API-AppToken` HTTP headers on every
 * request. There is no OAuth authorization-code flow.
 *
 * Credentials flow:
 *  - `getAuthUrl` points the user at the VTEX Admin API Keys page.
 *  - `exchangeCode` throws with a descriptive error — callers must POST
 *    `{ accountName, appKey, appToken }` to `/v1/connections` directly.
 *  - Keys do not expire, so `refreshCredentials` is a no-op.
 *
 * Docs: https://developers.vtex.com/docs/guides/api-authentication-using-api-keys
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(accountName: string): string {
  // Informational redirect — NOT a functional OAuth authorize URL.
  return `https://${accountName}.myvtex.com/admin/account#/api-keys`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'VTEX does not use OAuth code exchange. ' +
      'Create an AppKey + AppToken pair in VTEX Admin → Account Management → API Keys, ' +
      'then POST them to /v1/connections with body ' +
      '`{platform: "vtex", credentials: {accessToken: "<appToken>", extra: {appKey: "<appKey>", accountName: "<accountName>"}}}`.',
  )
}
