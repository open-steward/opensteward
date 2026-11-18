/**
 * PPL CZ CPL API constants.
 *
 * Base URLs:
 *   Production: https://api.dhl.com/ecs/ppl/myapi2
 *   Sandbox:    https://api-dev.dhl.com/ecs/ppl/myapi2
 *
 * The token endpoint is shared between environments via DHL's API gateway.
 */

export const PPL_CZ_API_BASE = 'https://api.dhl.com/ecs/ppl/myapi2'
export const PPL_CZ_API_BASE_SANDBOX = 'https://api-dev.dhl.com/ecs/ppl/myapi2'

/** OAuth2 token endpoint — client_credentials grant */
export const PPL_CZ_TOKEN_URL = 'https://api.dhl.com/ecs/ppl/myapi2/login/getAccessToken'

/** Token validity is 30 minutes (per PPL CZ docs); we refresh at 25 min to give headroom */
export const TOKEN_TTL_MS = 30 * 60 * 1000
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Maximum items per batch request (PPL CZ limit) */
export const MAX_BATCH_SIZE = 1000

/** Default page size for paginated endpoints */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 200

/**
 * GET /shipment pages by offset: `Limit` (required, "maximum: 1000",
 * "minimum: 1") and `Offset` (required, 0-based), and answers with an
 * `X-Paging-Total-Items-Count` header ("Total items in result").
 * https://ppl-cpl-api-en.apidog.io/shipment-tracking-13601484e0.md
 */
export const SHIPMENT_MAX_LIMIT = 1000

/**
 * Upstream page size for listTrackingEvents. It flattens every shipment's
 * events into rows, so one page of shipments is not one caller page; the
 * rows are re-cut to the caller's size by pageByRows.
 */
export const TRACKING_SHIPMENTS_PAGE_SIZE = 100

export const PPL_CZ_DEVELOPER_URL = 'https://developer.ppl.cz/en/'

/**
 * PPL CZ shipping product codes (service types).
 * Obtained from the /codelist/product endpoint.
 */
export const PPL_CZ_PRODUCTS = {
  /** PPL Parcel Business CZ — standard domestic parcel */
  PARCEL_BUSINESS_CZ: 'BUSS',
  /** PPL Parcel Connect EU — cross-border parcel */
  PARCEL_CONNECT: 'CONN',
  /** PPL Parcel Business Europe — business parcel within Europe */
  PARCEL_BUSINESS_EU: 'BUSE',
  /** PPL Smart — lightweight parcel service */
  SMART: 'SMRT',
  /** PPL Parcel Private CZ — B2C domestic parcel */
  PARCEL_PRIVATE_CZ: 'PRIV',
} as const
