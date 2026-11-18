/**
 * Shopware 6 REST API constants.
 *
 * Shopware 6 exposes its Admin API under `/api/` on the host site.
 * Auth: OAuth2 client-credentials for integrations.
 *
 * Docs: https://developer.shopware.com/docs/concepts/api/
 */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 500

/**
 * Shopware access tokens expire after 10 minutes by default.
 * Refresh 1 minute early to avoid mid-request expiry.
 */
export const TOKEN_BUFFER_MS = 60 * 1000
export const TOKEN_LIFETIME_MS = 10 * 60 * 1000 - TOKEN_BUFFER_MS
