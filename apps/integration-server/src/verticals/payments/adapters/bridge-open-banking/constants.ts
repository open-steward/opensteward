/**
 * Bridge (Bridgeapi) constants.
 *
 * https://docs.bridgeapi.io/docs/basics.md:
 *   "All API access is conducted over HTTPS and is accessible from the
 *    `api.bridgeapi.io/v3` domain."
 *   "Our API implements following HTTP headers on every endpoint:
 *    `Client-Id` ... `Client-Secret` ... `Bridge-Version` - `2025-01-15`"
 *   `limit`: "Number of results per call. Accepted values: 1 - 500.
 *    Default 50."
 */

export const API_BASE_URL = 'https://api.bridgeapi.io/v3'

/** The only value the OpenAPI `Bridge-Version` header enum allows. */
export const BRIDGE_VERSION = '2025-01-15'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 500
