/**
 * Wayfair Supplier GraphQL API constants.
 *
 * Wayfair exposes a GraphQL API (not REST) at a versioned endpoint.
 * Auth is OAuth2 client_credentials via Auth0 (sso.auth.wayfair.com).
 *
 * Resources available: Purchase Orders (read + accept), Inventory (write feed),
 * Fulfillments/Shipments (register + ship label).
 * There are NO products, collections, customers, discounts, or locations
 * endpoints — those are handled through Wayfair's internal catalog.
 *
 * Docs: https://developer.wayfair.io
 */

/** OAuth2 token endpoint (Auth0 tenant). */
export const TOKEN_URL = 'https://sso.auth.wayfair.com/oauth/token'

/** Audience value for the production API. */
export const PROD_AUDIENCE = 'https://api.wayfair.com/'

/** Audience value for the sandbox API. */
export const SANDBOX_AUDIENCE = 'https://sandbox.api.wayfair.com/'

/** GraphQL endpoint — production. */
export const PROD_GRAPHQL_URL = 'https://api.wayfair.com/v1/graphql'

/** GraphQL endpoint — sandbox. */
export const SANDBOX_GRAPHQL_URL = 'https://sandbox.api.wayfair.com/v1/graphql'

/**
 * Dropship Orders API (v2, API version 2026-09) endpoints. The reference
 * (https://developer.wayfair.io/posts/docs/dropship-orders-api/reference/GraphQL/v2.0.0)
 * lists, verbatim:
 *   "Production: https://api.wayfair.io/2026-09/dropship-orders/graphql
 *    Sandbox: https://api.wayfair.io/sandbox/2026-09/dropship-orders/graphql"
 * It is read-only ("acknowledgements, ship notices and cancellations are not
 * part of this surface"), so the write mutations stay on the v1 endpoint.
 */
export const PROD_DROPSHIP_ORDERS_URL = 'https://api.wayfair.io/2026-09/dropship-orders/graphql'

/** Dropship Orders API (v2) endpoint — sandbox. */
export const SANDBOX_DROPSHIP_ORDERS_URL =
  'https://api.wayfair.io/sandbox/2026-09/dropship-orders/graphql'

/**
 * `dropshipOrders(first:)`, verbatim: "Orders per page when paging forward,
 * 1 to 250; omit for the default of 50."
 */
export const DROPSHIP_ORDERS_MAX_PAGE_SIZE = 250
export const DROPSHIP_ORDERS_DEFAULT_PAGE_SIZE = 50

/**
 * OAuth2 scopes required by the Wayfair Supplier API.
 * Wayfair manages scope grants at the application level in the developer
 * portal — these are the standard supplier-app scopes.
 */
export const DEFAULT_SCOPES = ['warehouse:fulfillment', 'order:manage', 'inventory:manage']
