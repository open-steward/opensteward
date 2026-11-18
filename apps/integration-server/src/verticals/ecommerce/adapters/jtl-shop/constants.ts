/**
 * JTL-Shop REST API constants.
 *
 * JTL-Shop is a German e-commerce platform (by JTL-Software). The shop
 * REST API is served per-instance at `{shopBaseUrl}/api/v1/`. Authentication
 * uses a static API key generated in the JTL-Shop admin panel (Backend →
 * REST API → API-Keys), sent as the `x-api-key` request header.
 *
 * Source (JTL publishes no rendered REST reference; the controllers carry the
 * OpenAPI annotations): https://gitlab.com/jtl-software/jtl-shop/core/-/tree/v5.8.0/includes/src/REST
 *
 * Pagination: id keyset. AbstractController::index reads only `limit` and
 * `cursor` ("(int)($request->getQueryParams()['cursor'] ?? 0)", "' WHERE ' .
 * $primary . ' > :lid"), and answers a league/fractal collection
 * `{ data: [...], meta: { cursor: { current, prev, next, count } } }`.
 */

/** API version prefix used in all resource paths. */
export const API_VERSION = 'v1'

/**
 * The page size JTL-Shop uses when `limit` is absent or unusable:
 * "\max(1, (int)($request->getQueryParams()['limit'] ?? 10))" (AbstractController::index).
 * No maximum is documented, so none is declared or clamped to.
 */
export const DEFAULT_LIMIT = 10

/**
 * JTL-Shop order status values.
 *
 *  1  = new / open
 *  2  = in progress
 *  3  = shipped / completed
 *  4  = cancelled
 *  5  = partially shipped
 */
export const JTL_ORDER_STATUS = {
  NEW: 1,
  IN_PROGRESS: 2,
  SHIPPED: 3,
  CANCELLED: 4,
  PARTIAL: 5,
} as const
