/**
 * Shift4Shop "auth" helpers.
 *
 * Shift4Shop uses static API key authentication — no OAuth code-exchange
 * flow exists. The adapter requires two values:
 *
 *   - `credentials.accessToken` — the store's Private Key (PrivateKey header)
 *   - `credentials.extra.token` — the store's Public Token (Token header)
 *
 * Keys are generated in the Shift4Shop admin under
 *   Settings → API → REST API.
 *
 * Pass credentials via `POST /v1/connections` with:
 *   `{ platform: 'shift4shop', credentials: { accessToken: '<privateKey>', extra: { token: '<publicToken>' } } }`
 */

import type { Credentials } from '@opensteward/shared'

export function getAuthUrl(_state: string): string {
  throw new Error(
    'Shift4Shop does not support OAuth. ' +
      'Generate API keys in the Shift4Shop admin under Settings → API → REST API, ' +
      'then POST them to /v1/connections with body ' +
      '`{ platform: "shift4shop", credentials: { accessToken: "<privateKey>", extra: { token: "<publicToken>" } } }`.',
  )
}

export function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'Shift4Shop does not use OAuth code exchange. ' +
      'Generate API keys in the Shift4Shop admin under Settings → API → REST API, ' +
      'then POST them to /v1/connections with body ' +
      '`{ platform: "shift4shop", credentials: { accessToken: "<privateKey>", extra: { token: "<publicToken>" } } }`.',
  )
}
