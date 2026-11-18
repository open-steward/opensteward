/**
 * Cafe24 REST API constants.
 *
 * Cafe24 is a Korean e-commerce platform with a per-mall subdomain API.
 * All API calls go to `https://{mallId}.cafe24api.com/api/v2/admin/`.
 *
 * Versioning: Cafe24 supports dated API versions via the
 * `X-Cafe24-Api-Version` header (YYYY-MM-DD format). We pin a
 * known-good version here.
 *
 * Docs: https://developers.cafe24.com/docs/en/api/admin/
 */

export const API_VERSION = '2024-06-01'

/** Header to pin the API version. */
export const API_VERSION_HEADER = 'X-Cafe24-Api-Version'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Default OAuth scopes for a full-featured install.
 * Cafe24 scopes follow the pattern `mall.{read|write}_{resource}`.
 */
export const DEFAULT_SCOPES = [
  'mall.read_product',
  'mall.write_product',
  'mall.read_order',
  'mall.write_order',
  'mall.read_customer',
  'mall.write_customer',
  // GET /customersprivacy lists scope READ_PRIVACY; GET /shippingorigins lists
  // read_shipping (apidocs.cafe24.com/en/docs/admin/cafe-24-admin-api: "read_privacy:
  // Privacy Retrieval", "read_shipping: Shipping Retrieval").
  'mall.read_privacy',
  'mall.read_shipping',
  'mall.read_supply',
  'mall.write_supply',
  'mall.read_store',
  'mall.write_store',
  'mall.read_promotion',
  'mall.write_promotion',
  'mall.read_application',
  'mall.write_application',
]

/**
 * Build the Cafe24 API base URL for a given mall.
 * @param mallId - The mall subdomain (e.g. `mystore` from `mystore.cafe24.com`)
 */
export function apiBaseUrl(mallId: string): string {
  return `https://${mallId}.cafe24api.com/api/v2/admin`
}

/**
 * Build the OAuth2 base URL for a given mall.
 */
export function oauthBaseUrl(mallId: string): string {
  return `https://${mallId}.cafe24api.com/api/v2/oauth`
}
