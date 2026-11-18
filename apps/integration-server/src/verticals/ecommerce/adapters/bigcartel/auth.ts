/**
 * Big Cartel auth helpers.
 *
 * Big Cartel uses API key authentication for its REST API. Store owners
 * generate an API key from their Big Cartel admin panel. There is no
 * OAuth2 authorization-code flow for basic API access.
 *
 * For app developers, Big Cartel supports OAuth2, but for self-hosted
 * single-store usage, API key auth is the standard path.
 *
 * Credentials are passed to the adapter via `POST /v1/connections` with
 * `{ platform: 'bigcartel', credentials: { apiKey, accountId } }`.
 *
 * Docs: https://developers.bigcartel.com/
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  return 'https://my.bigcartel.com/account'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Big Cartel does not use OAuth code exchange for single-store API access. ' +
      'Generate an API key from your Big Cartel admin panel, ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "bigcartel", credentials: {apiKey, accountId}}`.',
  )
}
