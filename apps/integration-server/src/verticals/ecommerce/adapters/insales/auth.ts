/**
 * InSales auth helpers.
 *
 * InSales does NOT use OAuth2 authorization-code flow. Access credentials
 * are an api_id + api_secret pair created by the merchant inside the
 * InSales admin panel under Extensions → Developer. They are passed as
 * HTTP Basic auth on every request.
 *
 * `getAuthUrl` therefore returns the admin URL (informational only), and
 * `exchangeCode` throws with clear instructions so callers fail loudly
 * instead of silently doing nothing.
 *
 * Docs: https://www.insales.ru/collection/doc-rabota-s-api-i-prilozheniya/product/kak-sdelat-zapros-k-api
 */

import type { Credentials } from '@opensteward/shared'

/**
 * Return the InSales admin panel URL where the merchant creates API keys.
 * The `shop` param should be the merchant's subdomain (e.g. `myshop` for
 * `myshop.myinsales.ru`).
 */
export function buildAuthUrl(shop: string): string {
  const host = shop.endsWith('.myinsales.ru') ? shop : `${shop}.myinsales.ru`
  return `https://${host}/admin/`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'InSales does not use OAuth code exchange. ' +
      'Create an api_id / api_secret pair in the InSales admin panel under ' +
      'Extensions → Developer, then POST them to /v1/connections with body ' +
      '`{ platform: "insales", credentials: { apiId, apiSecret, shop } }`.',
  )
}
