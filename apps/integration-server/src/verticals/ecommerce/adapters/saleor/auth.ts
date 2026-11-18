/**
 * Saleor auth helpers.
 *
 * Saleor uses long-lived App tokens (created in the dashboard or via
 * `appCreate` mutation). Tokens do not expire and there is no OAuth2
 * code-exchange flow — the token is provisioned out-of-band and stored
 * directly as `credentials.accessToken`.
 *
 * `getAuthUrl` and `exchangeCode` are provided as stubs so the adapter
 * satisfies BaseAdapter. Real installations configure the token in the
 * admin panel.
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Build a placeholder auth URL. Saleor does not use browser-redirect
 * OAuth — tokens are created in the Saleor Dashboard under
 * Configuration → Apps.
 */
export function buildAuthUrl(apiUrl: string, state: string): string {
  return `${apiUrl.replace(/\/graphql\/?$/, '')}/dashboard/apps/?state=${encodeURIComponent(state)}`
}

/**
 * Stub code exchange. Returns the code as-is since the "code" the caller
 * passes is really the pre-provisioned App token.
 */
export async function exchangeCode(
  code: string,
  apiUrl: string,
  channelSlug: string,
): Promise<Credentials> {
  return {
    accessToken: code,
    extra: { apiUrl, channelSlug },
  }
}
