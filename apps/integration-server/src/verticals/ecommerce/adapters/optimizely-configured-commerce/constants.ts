/**
 * Optimizely Configured Commerce (formerly Insite) constants.
 *
 * Docs: https://docs.developers.optimizely.com/configured-commerce/reference/getting-started-with-the-b2b-commerce-rest-apis
 */

export const IDENTITY_TOKEN_PATH = '/identity/connect/token'

/**
 * Storefront REST API front-end client. Optimizely's own "getting started"
 * guide states plainly that this id and secret are hardcoded and public
 * ("isc and its key are hardcoded") — every Configured Commerce instance
 * accepts the same pair for the resource-owner password grant. This is NOT
 * a customer-specific secret; the customer's own API user (username +
 * password, collected via the Connect Link form) is what actually
 * authorizes the connection.
 */
export const STOREFRONT_CLIENT_ID = 'isc'
export const STOREFRONT_CLIENT_SECRET = '009AC476-B28E-4E33-8BAE-B5F103A142BC'
export const STOREFRONT_SCOPE = 'iscapi'

/**
 * Admin API client (OData `/api/v1/admin/{entity}`), also published as a
 * fixed, public pair. Recorded here for completeness / future use; this
 * adapter does not call the Admin API today — see `metadata.ts` for why
 * catalog/order writes beyond what the Storefront API documents are
 * declared unavailable rather than implemented against an unverified
 * entity/field schema.
 */
export const ADMIN_CLIENT_ID = 'isc_admin'
export const ADMIN_CLIENT_SECRET = 'F684FC94-B3BE-4BC7-B924-636561177C8F'
export const ADMIN_SCOPE = 'isc_admin_api'

export const DEFAULT_PAGE_SIZE = 25
/**
 * Optimizely's public reference does not publish a page-size ceiling for the
 * Storefront v1 list endpoints; this is a conservative, unverified-but-safe
 * default rather than a documented limit.
 */
export const MAX_PAGE_SIZE = 100

/**
 * Unlike Norce's docs, Optimizely's reference does not state a token
 * lifetime for the password grant. `auth.ts` always reads `expires_in` from
 * the token response when present; this is only the defensive fallback for
 * the (undocumented) case a response omits it.
 */
export const FALLBACK_TOKEN_LIFETIME_SECONDS = 3600
export const TOKEN_REFRESH_SKEW_SECONDS = 60
