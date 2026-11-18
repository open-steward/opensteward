/**
 * SCAYLE Admin API constants.
 *
 * Base URL format: https://{tenant-space}.admin.api.scayle.cloud/api/admin/v1
 * where tenant-space is e.g. "acme-live" (tenant + environment slug).
 *
 * Authentication: X-Access-Token header with a tenant API key generated in
 * the SCAYLE Panel.
 *
 * Docs: https://scayle.dev/en/api-guides/admin-api
 */

export const API_VERSION = 'v1'

/** Path prefix used after the tenant base URL. */
export const API_PATH_PREFIX = `/api/admin/${API_VERSION}`

/**
 * Build the fully-qualified Admin API base URL for a given tenant space.
 * Example: tenantSpace="acme-live" → "https://acme-live.admin.api.scayle.cloud/api/admin/v1"
 */
export function buildBaseUrl(tenantSpace: string): string {
  return `https://${tenantSpace}.admin.api.scayle.cloud${API_PATH_PREFIX}`
}

/** Default number of entities to fetch per page. SCAYLE default is 100. */
export const DEFAULT_PAGE_SIZE = 100

/** Maximum page size accepted by the SCAYLE Admin API. */
export const MAX_PAGE_SIZE = 100

/**
 * Documented `limit` maxima per endpoint. Products, product variants, shop
 * categories, warehouses, customers and promotions: "(max. 1000)". Orders:
 * "(max. 100)". With `with=variants` the limit counts parent products, and
 * the spec asks for "the default limit of **100** or a value significantly
 * lower than 1000".
 * https://scayle.dev/open_api_specs/admin-api-latest/products_get.json
 * https://scayle.dev/open_api_specs/admin-api-latest/shops_shopKey_countries_countryCode_orders_get.json
 */
export const MAX_LIST_PAGE_SIZE = 1000
export const MAX_ORDER_PAGE_SIZE = 100
export const NESTED_PAGE_SIZE = 100
