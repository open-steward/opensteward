/**
 * OTTO Market Partner API constants.
 *
 * OTTO Market is a German marketplace. Sellers connect via OAuth2
 * client-credentials, issued per-seller through OTTO Partner Connect.
 * There is a fully separate sandbox host, selected per-connection.
 *
 * Docs: https://api.otto.market/docs/category/about-the-api
 *       https://api.otto.market/docs/sellers-integration
 */

export const PRODUCTION_BASE_URL = 'https://api.otto.market'
export const SANDBOX_BASE_URL = 'https://sandbox.api.otto.market'

/** Token endpoint, relative to the environment's base URL. */
export const TOKEN_PATH = '/v1/token'

/**
 * OAuth2 scopes, taken from the seller-facing scope catalogue documented at
 * https://api.otto.market/docs/sellers-integration and already curated in
 * scripts/curated-read-scopes.json under "ecommerce/otto-market".
 */
export const DEFAULT_SCOPES = [
  'products',
  'orders',
  'receipts',
  'returns',
  'price-reduction',
  'shipments',
  'shipping-profiles',
  'availability',
  'returns-warehouse-read',
  'returns-warehouse-write',
  'advertising-services',
]

/**
 * Per-family list page size defaults. OTTO Market does not document one
 * uniform ceiling across every list endpoint (Products: 100, Availability:
 * "200 SKUs max", Shipments: 25, Receipts: 128), so each family clamps to
 * its OWN documented default rather than a single adapter-wide
 * `capabilities.maxPageSize` — see index.ts for why that capability is
 * deliberately left undeclared.
 *
 * Docs: https://api.otto.market/docs/functional-interfaces/availability
 *       https://api.otto.market/docs/functional-interfaces/shipments
 *       https://api.otto.market/docs/functional-interfaces/receipts
 *       https://api.otto.market/docs/functional-interfaces/orders
 */
export const AVAILABILITY_PAGE_SIZE = 200
export const AVAILABILITY_BATCH_MAX = 200
export const SHIPMENTS_PAGE_SIZE = 25
export const RECEIPTS_PAGE_SIZE = 128
export const ORDERS_PAGE_SIZE = 128
export const RETURNS_PAGE_SIZE = 128
export const LOCATIONS_PAGE_SIZE = 128

