/**
 * ShipBob inventory endpoints.
 *
 * Every path in this adapter was read from ShipBob's machine-readable
 * OpenAPI document, fetched 2026-09-18:
 *
 *   https://marketplaceapi.shipbob.com/docs/2026-01.json
 *   ("ShipBob Developer API (2026-01)", servers: api.shipbob.com,
 *    sandbox-api.shipbob.com)
 *
 * Before this, the adapter sent Cin7 Core's paths — productList,
 * ref/stockonhand and stockAdjustmentList — to `api.shipbob.com/1.0`. It
 * was a byte-copy of the Cin7 reference adapter wearing ShipBob's host, so
 * every call 404'd.
 *
 * `2026-01` rather than the newer `2026-07` deliberately: both documents
 * expose the identical nine inventory paths, and `logistics/shipbob` already
 * speaks `2026-01`. One ShipBob version across the repo is worth more than
 * being one release newer in a single adapter.
 */
export const API_BASE_URL = 'https://api.shipbob.com/2026-01'
export const SANDBOX_API_BASE_URL = 'https://sandbox-api.shipbob.com/2026-01'

/**
 * `/product`, `/inventory` and `/inventory-level` are CURSOR paginated: they
 * answer `{ first, items, last, next, prev }` and take `PageSize`, with no
 * page number. `/location` and `/receiving` are different — see below — and
 * conflating the two is how a sync silently truncates at the vendor's cap.
 */
export const DEFAULT_PAGE_SIZE = 100

/** `/receiving` is the one inventory route that takes `Page` + `Limit`. */
export const RECEIVING_DEFAULT_LIMIT = 100

/**
 * Scopes the OAuth flow requests, one per route this adapter actually calls.
 *
 *   products_read   GET /product
 *   inventory_read  GET /inventory-level/locations
 *   receiving_read  GET /receiving
 *   offline_access  issues the refresh token; without it the connection dies
 *                   an hour after connect with an unexplained 401 on every
 *                   resource — the exact failure the PAT path had
 *
 * `locations_read` is deliberately ABSENT. This adapter reads
 * `/fulfillment-center`, not `/location`, precisely so it does not need that
 * scope (see "Two location endpoints" in README.md): `/location` returns
 * ShipBob's whole 69-centre network, 65 of them `access_granted: false`.
 * Asking for a scope no route here uses is a permission the merchant grants
 * for nothing.
 */
export const DEFAULT_SCOPES = [
  'products_read',
  'inventory_read',
  'receiving_read',
  'offline_access',
]
