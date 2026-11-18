/**
 * Mercado Libre API constants.
 *
 * Mercado Libre's REST API is a single-host API with seller-scoped
 * endpoints. Two environments: production and (partially) test.
 *
 * Auth: OAuth2 authorization-code grant.
 * Base URL: https://api.mercadolibre.com
 *
 * Key endpoints used by this adapter:
 *   - Items API:        /items (products)
 *   - Orders API:       /orders/search (orders, seller-scoped)
 *   - Shipments API:    /shipments (fulfillments)
 *   - Questions API:    /questions/search (buyer questions)
 *   - Categories API:   /categories (collections/categories)
 */

/** Mercado Libre API hosts by country site. The global API host is used for all calls. */
export const API_BASE_URL = 'https://api.mercadolibre.com'

/** OAuth2 endpoints. */
export const OAUTH_AUTHORIZE_URL = 'https://auth.mercadolibre.com/authorization'
export const OAUTH_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'

/** Access tokens expire after 6 hours; refresh 5 minutes early. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 50

/** Maximum page size for most Mercado Libre endpoints. */
export const MAX_PAGE_SIZE = 50

/**
 * Maximum `limit` for GET /users/{id}/items/search.
 * https://developers.mercadolibre.com.ar/en_us/items-and-searches — "You can
 * add a maximum limit of 100."
 */
export const ITEMS_SEARCH_MAX_LIMIT = 100

/**
 * Maximum ids per GET /items?ids= multiget. Same page: "access with a single
 * call to a maximum of 20 results".
 */
export const ITEMS_MULTIGET_MAX_IDS = 20

/**
 * Page size sent to GET /orders/search and GET /seller-promotions/users/{id}.
 * Neither endpoint documents a maximum `limit`; both document 50 as the size
 * their own examples echo back (`"paging": { ..., "limit": 50 }` on
 * en_us/order-management and en_us/manage-promotion), and the only maximum on
 * the promotions page is 50 ("You can add a maximum limit of 50.", for the
 * sibling promotion-items endpoint). An upstream that silently served fewer
 * rows than the `limit` sent would make every later offset skip rows, so these
 * two ask for no more than the size the docs show being served.
 */
export const SEARCH_SAFE_LIMIT = 50

/** API paths. */
export const ITEMS_BASE = '/items'
export const ORDERS_BASE = '/orders/search'
export const SHIPMENTS_BASE = '/shipments'
export const CATEGORIES_BASE = '/categories'
export const USERS_BASE = '/users'
export const QUESTIONS_BASE = '/questions/search'
