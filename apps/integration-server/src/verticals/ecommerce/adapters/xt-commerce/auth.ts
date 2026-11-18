/**
 * WooCommerce "auth" helpers.
 *
 * WooCommerce does NOT use OAuth2's authorization-code flow. Credentials
 * are consumer key + secret pairs generated manually by the store owner
 * under WP admin → WooCommerce → Settings → Advanced → REST API. The
 * adapter therefore:
 *
 *  - Points `getAuthUrl` at the in-admin keys page (informational only).
 *  - Throws from `exchangeCode` with clear instructions so ambiguous
 *    callers fail loudly instead of pretending to support the flow.
 *
 * Once created, credential pairs are passed to the adapter via
 * `POST /v1/connections` with
 * `{ platform: 'xt-commerce', credentials: { consumerKey, consumerSecret, site } }`.
 *
 * Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(site: string): string {
  // Informational redirect — NOT a functional OAuth authorize URL.
  return `${site.replace(/\/$/, '')}/wp-admin/admin.php?page=wc-settings&tab=advanced&section=keys`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'WooCommerce does not use OAuth code exchange. ' +
      'Create consumer keys in WP admin → WooCommerce → Settings → Advanced → REST API, ' +
      'then POST them to /v1/connections with body ' +
      '`{platform: "woocommerce", credentials: {consumerKey, consumerSecret, site}}`.',
  )
}
