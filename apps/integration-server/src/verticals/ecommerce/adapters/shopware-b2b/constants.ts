/**
 * Shopware B2B Suite REST API constants.
 *
 * Same base API as Shopware 6 (`/api/`) with B2B-specific entities:
 * - `b2b_company` — B2B company entities
 * - `b2b_employee` — company employees
 * - `b2b_budget` — spending budgets
 * - `b2b_role` — roles/permissions
 *
 * Auth: OAuth2 client-credentials (same as Shopware 6).
 * Docs: https://developer.shopware.com/docs/products/extensions/b2b-suite/
 */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 500

/**
 * Shopware access tokens expire after 10 minutes by default.
 * Refresh 1 minute early to avoid mid-request expiry.
 */
export const TOKEN_BUFFER_MS = 60 * 1000
export const TOKEN_LIFETIME_MS = 10 * 60 * 1000 - TOKEN_BUFFER_MS
