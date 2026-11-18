/**
 * IZBERG auth helpers.
 *
 * IZBERG does not use an OAuth2 authorization-code flow here. The merchant
 * spec lists "Seller(s) authorization token (Bearer)" among its integration
 * prerequisites, and the public spec secures every operation with
 * `bearerAuth` (`{ "type": "http", "scheme": "bearer" }`). The token is
 * sent on every request as:
 *
 *   Authorization: Bearer {token}
 *
 * `credentials.accessToken` carries the token.
 *
 * Docs: https://docs-api-merchant.izberg-marketplace.com/
 */

import type { Credentials } from '@opensteward/shared'

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'IZBERG does not use OAuth code exchange. ' +
      'Connect with the seller authorization token (Bearer) IZBERG issued ' +
      'for your marketplace.',
  )
}
