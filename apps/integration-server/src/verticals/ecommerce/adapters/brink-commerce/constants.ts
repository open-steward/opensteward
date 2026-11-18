/**
 * Brink Commerce API constants.
 *
 * Every Management and Order service lives on ONE host per merchant, with the
 * service as the first path segment. Each first-party API reference page
 * embeds an OpenAPI whose server is, verbatim:
 *
 *   "servers":[{"url":"https://management.{REGION}.{ACCOUNT_NAME}.brinkcommerce.io/order"}]
 *   (…/product, …/stock, …/discount, …/price, …/store likewise)
 *
 * e.g. https://docs.brinkcommerce.com/technical/api-references/order/orders.md
 * and https://docs.brinkcommerce.com/technical/api-references/management/product/product-parents.md.
 * The adapter once built `https://{service}.{region}.{account}.brinkcommerce.io`,
 * a host the docs never name.
 *
 * Auth ("Management & Order APIs: OAuth 2.0 (Bearer token) + x-api-key header",
 * https://docs.brinkcommerce.com/getting-started/essentials/authentication.md):
 * a client-credentials token from `POST /oauth2/token` on the `/auth` service
 * of the same host, then `Authorization: Bearer {access_token}` and
 * `x-api-key: {api_key}` on every call.
 */

/** Default OAuth scopes requested during token acquisition. */
export const DEFAULT_SCOPES = [
  'product-management/product:read',
  'product-management/product:write',
  'stock-management/stock:read',
  'stock-management/stock:write',
  'price-management/price:read',
  'price-management/price:write',
  'discount-management/discount:read',
  'discount-management/discount:write',
  'store-management/store:read',
  'order-management/order:read',
  'order-management/order:write',
]

/**
 * Base URL of one Brink service: `https://management.{region}.{account}.brinkcommerce.io/{service}`.
 *
 * @param service  `product`, `stock`, `discount`, `order`, …
 * @param region   e.g. `eu-west-1`
 * @param account  Merchant account name, e.g. `mycompany`
 */
export function managementBaseUrl(service: string, region: string, account: string): string {
  return `https://management.${region}.${account}.brinkcommerce.io/${service}`
}

/**
 * Base URL of the token endpoint's service (`/auth`); the token path is
 * `/oauth2/token` under it.
 */
export function authBaseUrl(region: string, account: string): string {
  return managementBaseUrl('auth', region, account)
}
