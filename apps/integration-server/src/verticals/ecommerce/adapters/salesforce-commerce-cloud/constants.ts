/**
 * Salesforce Commerce Cloud B2C Commerce API (SCAPI) constants.
 *
 * SCAPI uses a host-routed base URL scheme keyed on the merchant's `shortCode`
 * (an eight-character realm identifier) plus the per-API `apiFamily` and
 * `apiName` segments.
 *
 * Base URL template:
 *   https://{shortCode}.api.commercecloud.salesforce.com/{apiFamily}/{apiName}/v1/organizations/{organizationId}
 *
 * Shopper APIs require `?siteId={siteId}` on every request.
 * Admin APIs omit `siteId`.
 *
 * Auth:
 *   Shopper APIs → SLAS (Shopper Login and Authorization Service).
 *   Admin APIs   → Account Manager (account.demandware.com), client_credentials.
 *
 * Docs: https://developer.salesforce.com/docs/commerce/commerce-api/guide/scapi-get-started.html
 */

/** Default maximum results per page (SCAPI default is 25, max is 200). */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 200

/** SCAPI API version (all current Shopper/Admin endpoints use v1). */
export const API_VERSION = 'v1'

/**
 * Account Manager OAuth2 token endpoint.
 * Used for Admin API client_credentials grants.
 */
export const ACCOUNT_MANAGER_TOKEN_URL =
  'https://account.demandware.com/dwsso/oauth2/access_token'

/**
 * SLAS OAuth2 token endpoint template.
 * Used for Shopper API tokens (guest or registered shopper).
 * `{shortCode}` and `{organizationId}` are replaced at runtime.
 */
export const SLAS_TOKEN_URL_TEMPLATE =
  'https://{shortCode}.api.commercecloud.salesforce.com/shopper/auth/v1/organizations/{organizationId}/oauth2/token'

/**
 * Admin API OAuth2 scopes required for a full integration.
 *
 * Reference: https://developer.salesforce.com/docs/commerce/commerce-api/guide/authorization-scopes-catalog.html
 */
export const DEFAULT_ADMIN_SCOPES = [
  'sfcc.catalogs',
  'sfcc.catalogs.rw',
  'sfcc.inventory.impex-inventory',
  'sfcc.inventory.impex-inventory.rw',
  'sfcc.orders',
  'sfcc.orders.rw',
  'sfcc.customers',
  'sfcc.customers.rw',
  'sfcc.products',
  'sfcc.products.rw',
  'sfcc.promotions',
  'sfcc.promotions.rw',
]

/**
 * Shopper API OAuth2 scopes (used with SLAS client_credentials or
 * authorization_code flows for storefront integrations).
 */
export const DEFAULT_SHOPPER_SCOPES = [
  'sfcc.shopper-products',
  'sfcc.shopper-orders',
  'sfcc.shopper-customers',
  'sfcc.shopper-customers.register',
  'sfcc.shopper-search',
  'sfcc.shopper-promotions',
  'sfcc.shopper-stores',
]
