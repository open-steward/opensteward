/**
 * Centra Order API auth helpers.
 *
 * Centra does NOT use OAuth2 / authorization-code flow. Credentials are API
 * keys generated in the Centra backend under System → Plugins → Order API.
 * The merchant copies the key and the base URL from that plugin page.
 *
 * The adapter therefore:
 *  - Points `getAuthUrl` at the Centra backend API plugin page (informational).
 *  - Throws from `exchangeCode` with clear instructions so ambiguous callers
 *    fail loudly instead of pretending to support the flow.
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Return an informational URL pointing the user to Centra's API plugin page.
 * `baseUrl` should be the Centra backend URL (e.g. `https://myshop.centra.com`).
 */
export function buildAuthUrl(baseUrl?: string): string {
  const host = (baseUrl ?? 'https://your-store.centra.com').replace(/\/$/, '')
  return `${host}/admin/plugin/order-api`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Centra does not use OAuth code exchange. ' +
      'Create an Order API plugin in the Centra backend (System → Plugins → Order API), ' +
      'copy the API Key and Base URL, then POST them to /v1/connections with body ' +
      '`{platform: "centra", credentials: {accessToken: "<api-key>", extra: {baseUrl: "<base-url>"}}}`.',
  )
}
