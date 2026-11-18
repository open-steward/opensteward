/**
 * Sapo Admin REST API constants.
 *
 * Sapo is a Vietnamese e-commerce platform whose REST API closely mirrors
 * Shopify's Admin REST API in structure, but uses different field names
 * (e.g. `name` instead of `title`, `created_on`/`modified_on` instead of
 * `created_at`/`updated_at`) and page-based (not cursor-based) pagination.
 *
 * Base URL: https://{store}.mysapo.net/admin
 * Auth (public OAuth app): X-Sapo-Access-Token header
 * Auth (private app): HTTP Basic auth — apiKey:apiSecret
 *
 * Docs: https://support.sapo.vn/gioi-thieu-api
 */

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250

/**
 * Default OAuth scopes for a full-featured install.
 */
export const DEFAULT_SCOPES = [
  'read_products',
  'write_products',
  'read_orders',
  'write_orders',
  'read_customers',
  'write_customers',
  'read_fulfillments',
  'write_fulfillments',
]
