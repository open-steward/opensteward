/**
 * Vendure GraphQL Admin API constants.
 *
 * Vendure exposes a single GraphQL endpoint at `/admin-api`.
 * Pagination uses skip/take (offset/limit) rather than Relay cursors.
 */

export const DEFAULT_PAGE_SIZE = 20
/**
 * Admin API `adminListQueryLimit` default: "the upper limit of the `take`
 * input option" (api-options). A larger `take` is refused, not truncated.
 * 100 is the Shop API's `shopListQueryLimit`, which this adapter never calls.
 */
export const MAX_PAGE_SIZE = 1000

/** Default channel token when none is supplied in credentials.extra. */
export const DEFAULT_CHANNEL_TOKEN = ''

/** Header carrying the HMAC-SHA256 signature on webhook deliveries. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-vendure-hmac-sha256'
