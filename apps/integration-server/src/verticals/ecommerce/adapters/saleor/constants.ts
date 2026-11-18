/**
 * Saleor GraphQL API constants.
 *
 * Saleor exposes a single GraphQL endpoint. There are no versioned URL
 * segments — the schema is introspectable and forward-compatible.
 */

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/** Default channel slug when none is supplied in credentials.extra. */
export const DEFAULT_CHANNEL = 'default-channel'

/** Header carrying the HMAC-SHA256 signature on webhook deliveries. */
export const WEBHOOK_SIGNATURE_HEADER = 'saleor-signature'
