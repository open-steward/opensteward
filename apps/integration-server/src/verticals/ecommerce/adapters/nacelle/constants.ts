/**
 * Nacelle API constants.
 *
 * Nacelle is a composability/data layer, not a store — it has THREE distinct
 * API surfaces this adapter touches, each on its own host:
 *
 *  - Storefront GraphQL API (catalog reads): products/variants/collections,
 *    indexed one-way from a backend like Shopify.
 *    https://docs.nacelle.com/docs/storefront-graphql-api-stable
 *  - NOMS (Nacelle Order Management System) REST API (order writes):
 *    https://docs.nacelle.com/docs/noms-introduction
 *
 * NOMS also exposes an Admin GraphQL API for reading orders/customers
 * (schema documented at https://docs.nacelle.com/reference/noms-graphql —
 * Query.order/orders/customer/customers, OrderFilter/CustomerFilter,
 * cursor pagination via first/after) and required headers
 * (`x-nacelle-space-id`, `Authorization: Bearer …`) are documented, but no
 * page in the public docs states the URL those GraphQL requests are POSTed
 * to. That is NOT inferred here — see index.ts for the resulting scope
 * decision (order/customer/fulfillment/transaction reads are unavailable).
 */

/** Storefront GraphQL endpoint, space-scoped: `${STOREFRONT_GRAPHQL_BASE}/${spaceId}`. */
export const STOREFRONT_GRAPHQL_BASE = 'https://storefront.api.nacelle.com/graphql/v1/spaces'

/**
 * NOMS "Create Order" REST endpoint — the one NOMS write operation whose
 * endpoint, headers and request body are all documented verbatim:
 * https://docs.nacelle.com/docs/noms-introduction
 *
 *   POST https://noms.api.nacelle.com/api/v1/orders
 *   Authorization: Bearer <token>
 *   Content-Type: application/json
 *   X-Nacelle-Space-ID: <spaceId>
 *   { "order": { "source_reference_id", "source_name", "source_identifier",
 *                "line_items": [{ "source_reference_id", "quantity" }] } }
 */
export const NOMS_CREATE_ORDER_URL = 'https://noms.api.nacelle.com/api/v1/orders'

export const DEFAULT_PAGE_SIZE = 50
/**
 * No documented ceiling was found for `allProducts`/`allProductCollections`
 * `first`. The one example in the docs uses `first: 500` for `allContent`;
 * capped more conservatively here since that number is for a different root
 * field and is not stated to be a maximum.
 */
export const MAX_PAGE_SIZE = 250
