/**
 * Zyro / Hostinger eCommerce API constants.
 *
 * Zyro is Hostinger's website builder with integrated ecommerce. Hostinger
 * acquired Zyro and the platform may be reached via Hostinger's OAuth
 * infrastructure. The public API surface is limited compared to dedicated
 * ecommerce platforms.
 */

/** Base URL for the Zyro store API endpoints. */
export const BASE_URL = 'https://api.zyro.com'

/** OAuth authorization endpoint (Hostinger identity provider). */
export const AUTH_URL = 'https://api.hostinger.com/oauth/authorize'

/** OAuth token exchange / refresh endpoint. */
export const TOKEN_URL = 'https://api.hostinger.com/oauth/token'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/** Access token lifetime in seconds (1 hour default assumption). */
export const TOKEN_LIFETIME_SECONDS = 3600

/**
 * OAuth scopes for read/write access to products and orders.
 * Exact scope names may vary; these follow common Hostinger/Zyro patterns.
 */
export const DEFAULT_SCOPES = [
  'store:read',
  'store:write',
  'orders:read',
  'orders:write',
]
