/**
 * CartPanda authentication helpers.
 *
 * CartPanda does NOT use OAuth2's authorization-code flow. Merchants
 * generate a long-lived Bearer token from their CartPanda dashboard
 * (Profile → Token) and supply it alongside their store slug. The adapter
 * therefore:
 *
 *  - Points `getAuthUrl` at the CartPanda dashboard (informational only).
 *  - Throws from `exchangeCode` with clear instructions so callers that
 *    attempt an OAuth flow fail loudly.
 *
 * Credentials are passed to the adapter via `POST /v1/connections` with:
 *   { platform: 'cartpanda', credentials: { accessToken, extra: { slug } } }
 *
 * Docs: https://dev.cartpanda.com/docs/cartx-api-doc/b6b6c2d4906e9-authentication
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Informational URL pointing the user at the CartPanda dashboard where the
 * API token can be copied from the account profile.
 */
export function buildAuthUrl(): string {
  return 'https://app.cartpanda.com/settings/profile'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'CartPanda does not use OAuth code exchange. ' +
      'Generate a Bearer token in the CartPanda dashboard (Profile → Token), ' +
      'then POST it to /v1/connections with body: ' +
      '`{ platform: "cartpanda", credentials: { accessToken: "<token>", extra: { slug: "<store-slug>" } } }`.',
  )
}
