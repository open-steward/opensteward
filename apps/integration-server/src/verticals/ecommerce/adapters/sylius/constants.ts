/**
 * Sylius Admin API constants.
 *
 * Sylius (Symfony/API Platform) exposes a REST+JSON admin API:
 *   `https://{host}/api/v2/admin/`
 *
 * Prices are stored as integers (cents).
 * Auth: OAuth2 via `/api/v2/admin/authentication-token`.
 */
export const API_NAMESPACE = 'api/v2/admin'

export const DEFAULT_PAGE_SIZE = 30
export const MAX_PAGE_SIZE = 100

/**
 * OAuth2 tokens — Sylius default JWT setup. Tokens are typically
 * short-lived (1 hour). We refresh 10 minutes early.
 */
export const TOKEN_BUFFER_MS = 10 * 60 * 1000
export const TOKEN_LIFETIME_MS = 60 * 60 * 1000 - TOKEN_BUFFER_MS
