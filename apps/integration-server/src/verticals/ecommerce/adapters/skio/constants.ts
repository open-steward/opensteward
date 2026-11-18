/**
 * Skio Public REST API constants.
 *
 * Skio exposes a cursor-based REST API for bulk export of subscription,
 * order, storefront-user, and product data from Shopify-native stores.
 *
 * Docs: https://code.skio.com/rest-api/
 */

/**
 * Production REST base URL.
 * All resource endpoints are appended to this path.
 */
export const BASE_URL = 'https://api.skio.com/public-rest-api-http'

/**
 * Default page size for paginated list requests. The Skio API allows
 * 1–1000; 100 is a safe default that stays well inside rate limits while
 * minimising round-trip count.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Hard maximum the Skio API accepts for the `first` pagination parameter.
 */
export const MAX_PAGE_SIZE = 1000
