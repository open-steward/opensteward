/**
 * Ecwid "auth" helpers.
 *
 * Ecwid uses a secret API token (store token) for authentication.
 * The token is generated in the Ecwid admin under
 * Apps → My Apps → the app's "Secret Token". There is no OAuth
 * code-exchange flow for self-hosted usage — tokens are long-lived.
 *
 * Credentials are passed to the adapter via
 * `POST /v1/connections` with
 * `{ platform: 'ecwid', credentials: { accessToken: '<token>', storeId: '<id>' } }`.
 *
 * Docs: https://developer.ecwid.com/
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  return 'https://my.ecwid.com/cp/#develop-apps'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Ecwid does not use OAuth code exchange for self-hosted usage. ' +
      'Create an API token in Ecwid admin → Apps → My Apps, ' +
      'then POST to /v1/connections with body ' +
      '`{platform: "ecwid", credentials: {accessToken: "<token>", storeId: "<id>"}}`.',
  )
}
