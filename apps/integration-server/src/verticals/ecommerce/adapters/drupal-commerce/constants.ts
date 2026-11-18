/**
 * Drupal Commerce JSON:API constants.
 *
 * Drupal Commerce exposes a JSON:API endpoint at `/jsonapi/` on the self-hosted
 * Drupal site. Content-Type follows the JSON:API spec.
 *
 * Auth: Bearer token via Drupal's `simple_oauth` module or a static user token.
 * Token refresh: POST to `{baseUrl}/oauth/token` with grant_type=refresh_token.
 * Base URL: stored in credentials.extra.baseUrl (site-specific).
 */

export const CONTENT_TYPE = 'application/vnd.api+json'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50

/** JSON:API resource types used by Drupal Commerce */
export const RESOURCE_TYPES = {
  PRODUCT: 'commerce_product--default',
  PRODUCT_VARIATION: 'commerce_product_variation--default',
  ORDER: 'commerce_order--default',
  ORDER_ITEM: 'commerce_order_item--default',
  USER: 'user--user',
  SHIPMENT: 'commerce_shipment--default',
  STORE: 'commerce_store--online',
} as const

/** JSON:API base path */
export const JSONAPI_PATH = '/jsonapi'

/** OAuth2 token path (simple_oauth module) */
export const TOKEN_PATH = '/oauth/token'

/** Token lifetime in seconds (Drupal simple_oauth default is 300s; set conservatively) */
export const TOKEN_LIFETIME_SECONDS = 270
