/**
 * Signzy Contract360 REST API constants.
 *
 * Signzy's digital-contracting / eSign surface ("Contract360") authenticates
 * with a static access token (provisioned by your Signzy CSM) sent in the
 * `Authorization` header — there is no OAuth flow. The token is environment
 * scoped, so the customer also picks production vs pre-production; the host is
 * resolved from `credentials.extra.baseUrl`.
 *
 * Docs: https://docs.signzy.com/contract360/pull-contract-api
 */

/** API version path segment shared by both hosts. */
export const API_VERSION = 'v3'

/** Production host (without the /api/${API_VERSION} suffix). */
export const PRODUCTION_HOST = 'https://api.signzy.app'

/** Pre-production / sandbox host. */
export const SANDBOX_HOST = 'https://api-preproduction.signzy.app'

/** Default host when `credentials.extra.baseUrl` is absent. */
export const DEFAULT_HOST = PRODUCTION_HOST

/** Header carrying the static Signzy access token (no `Bearer` prefix). */
export const AUTH_HEADER = 'Authorization'

/**
 * Signzy Contract360 has no list-contracts endpoint; reads are by `contractid`
 * via POST /contract/pulldata. Pagination is therefore not applicable. These
 * constants exist only so the adapter's listParams stays consistent with the
 * rest of the vertical.
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
