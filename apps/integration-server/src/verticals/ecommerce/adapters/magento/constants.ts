/**
 * Magento / Adobe Commerce REST API constants.
 *
 * Magento exposes its REST API under `/rest/{version}/` on the host site.
 * `V1` is the stable namespace; bump when re-tested against a newer
 * Magento / Adobe Commerce release.
 */
export const API_VERSION = 'V1'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 200

/**
 * Admin integration tokens expire 4 hours after issuance by default.
 * We refresh 30 minutes early to avoid mid-request expiry.
 */
export const TOKEN_BUFFER_MS = 30 * 60 * 1000
export const TOKEN_LIFETIME_MS = 4 * 60 * 60 * 1000 - TOKEN_BUFFER_MS
