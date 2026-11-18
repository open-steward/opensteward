/**
 * Spree Commerce Platform API constants.
 *
 * Spree exposes two API namespaces:
 *  - Storefront API: `/api/v2/storefront/` (limited, consumer-facing)
 *  - Platform API: `/api/v2/platform/` (full CRUD, admin-level)
 *
 * This adapter uses the Platform API for full resource management.
 */
export const API_NAMESPACE = 'api/v2/platform'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/**
 * OAuth2 bearer tokens — Spree's default Doorkeeper setup issues
 * tokens with a 2-hour lifetime. We refresh 15 minutes early.
 */
export const TOKEN_BUFFER_MS = 15 * 60 * 1000
export const TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000 - TOKEN_BUFFER_MS
