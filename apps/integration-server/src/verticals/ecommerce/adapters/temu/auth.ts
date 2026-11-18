/**
 * Temu Open Platform auth helpers.
 *
 * Temu uses a simple API key model: sellers generate an `app_key` +
 * `app_secret` pair in the Seller Center, then obtain a long-lived
 * `access_token` by authorizing the app. There is no OAuth2
 * authorization-code redirect flow for third-party integrators.
 *
 * Credentials are passed to the adapter via
 * `POST /v1/connections` with
 * `{ platform: 'temu', credentials: { accessToken, appKey, appSecret } }`.
 *
 * The `access_token` is valid for 90 days. Refresh is not supported through
 * the public API (sellers re-authorize via Seller Center when tokens expire).
 *
 * Docs: https://partner.temu.com/documentation
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Returns a URL pointing to the Temu Seller Center authorization page for
 * the given region. This is informational — not a functional OAuth redirect.
 */
export function buildAuthUrl(region: 'us' | 'eu' | 'global' = 'us'): string {
  const host =
    region === 'eu' ? 'partner-eu.temu.com' :
    region === 'global' ? 'partner.temu.com' :
    'partner-us.temu.com'
  return `https://${host}/login`
}

/**
 * Temu does not support an OAuth authorization-code exchange.
 * Calling this throws a descriptive error.
 */
export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Temu does not use OAuth code exchange. ' +
      'Generate an app_key/app_secret in Temu Seller Center → Open Platform → App Management, ' +
      'authorize the app to obtain an access_token, then POST to /v1/connections with ' +
      '`{ platform: "temu", credentials: { accessToken, extra: { appKey, appSecret } } }`.',
  )
}
