/**
 * Kaufland Marketplace Seller API constants.
 *
 * The Kaufland Seller API is hosted at a single versioned base URL. There is
 * no separate sandbox host; Kaufland provides a Playground environment at
 * https://sellerapi-playground.kaufland.com/v2 for testing.
 *
 * Docs: https://sellerapi.kaufland.com/?page=rest-api
 */

/** Production API base URL. */
export const API_BASE_URL = 'https://sellerapi.kaufland.com/v2'

/** Sandbox/Playground API base URL. */
export const SANDBOX_BASE_URL = 'https://sellerapi-playground.kaufland.com/v2'

/** Default page size for list endpoints (Kaufland default is 30, max 100). */
export const DEFAULT_PAGE_SIZE = 30

/** Maximum page size allowed by Kaufland list endpoints. */
export const MAX_PAGE_SIZE = 100

/** GET /warehouses documents a lower `limit` maximum (and default) of 30. */
export const MAX_WAREHOUSE_PAGE_SIZE = 30

/**
 * Default storefront (country code). Kaufland operates across several
 * storefronts: de (Germany), at (Austria), cz (Czech Republic),
 * sk (Slovakia), pl (Poland).
 */
export const DEFAULT_STOREFRONT = 'de'

/**
 * User-Agent header sent with every request. Kaufland requires either the
 * name of the software solution or "Inhouse_development".
 */
export const USER_AGENT = 'OpenSteward'
