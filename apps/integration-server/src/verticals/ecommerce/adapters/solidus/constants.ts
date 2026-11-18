/**
 * Solidus Platform API constants.
 *
 * Solidus (a Rails fork of Spree) exposes the same Platform API v2:
 *   - Platform API: `/api/v2/platform/` (full CRUD, admin-level)
 *
 * OAuth2 endpoint differs from vanilla Spree — Solidus uses the
 * standard Doorkeeper path `/oauth/token` rather than `/spree_oauth/token`.
 */
export const API_NAMESPACE = 'api/v2/platform'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/**
 * Solidus Doorkeeper tokens default to 2-hour lifetime.
 * We refresh 15 minutes early.
 */
export const TOKEN_BUFFER_MS = 15 * 60 * 1000
export const TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000 - TOKEN_BUFFER_MS
