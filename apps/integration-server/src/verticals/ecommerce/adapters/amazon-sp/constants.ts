/**
 * Amazon Selling Partner API (SP-API) constants.
 *
 * SP-API is partitioned into three regional hosts; the correct host for a
 * seller is determined by the marketplace they sell into. Tokens (LWA
 * access tokens) are bound to an application — not a host — so the same
 * `clientId` / `refreshToken` pair can serve any region. Sellers must
 * still target the correct regional host when calling resource endpoints.
 *
 */

/** Regional SP-API hosts. */
export const REGIONS: Record<string, { apiHost: string }> = {
  na: { apiHost: 'sellingpartnerapi-na.amazon.com' },
  eu: { apiHost: 'sellingpartnerapi-eu.amazon.com' },
  fe: { apiHost: 'sellingpartnerapi-fe.amazon.com' },
}

/** Default region when a connection doesn't specify one. */
export const DEFAULT_REGION = 'na'

/** Login with Amazon token endpoint (region-agnostic). */
export const LWA_TOKEN_ENDPOINT = 'https://api.amazon.com/auth/o2/token'

/** LWA access tokens expire after 1 hour; refresh 5 minutes early. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 20

/** SP-API namespace paths. */
export const LISTINGS_BASE = '/listings/2021-08-01/items'
export const CATALOG_BASE = '/catalog/2022-04-01/items'
export const ORDERS_BASE = '/orders/v0/orders'
export const FBA_INVENTORY_BASE = '/fba/inventory/v1/summaries'
export const FINANCES_BASE = '/finances/v0/financialEvents'
/**
 * Order-scoped Finances path. This is NOT `${FINANCES_BASE}/orders/{id}` —
 * the vendor route nests differently (`orders/{id}/financialEvents`, not
 * `financialEvents/orders/{id}`), so it needs its own base.
 */
export const FINANCES_ORDER_EVENTS_BASE = '/finances/v0/orders'
export const SUPPLY_SOURCES_BASE = '/supplySources/2020-07-01/supplySources'
