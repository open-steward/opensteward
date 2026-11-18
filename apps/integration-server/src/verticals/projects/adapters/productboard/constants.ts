/**
 * Productboard REST API v1 — endpoints and OAuth2 configuration.
 *
 * Single multi-tenant host shared by every workspace. The public API
 * requires the `X-Version: 1` header on every request.
 *
 * Docs: https://developer.productboard.com/reference/introduction
 */
export const API_BASE_URL = 'https://api.productboard.com'
export const OAUTH_AUTHORIZE_URL = 'https://app.productboard.com/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://app.productboard.com/oauth2/token'

/** Productboard public API version header value (`X-Version: 1`). */
export const API_VERSION = '1'

/** Productboard's default (and, for link-paginated lists, fixed) page size. */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Default OAuth2 scopes. Read-only B2B posture — only the read-tier scopes
 * the canonical projects resources need: the product hierarchy (products,
 * components, features) plus workspace members.
 */
export const DEFAULT_SCOPES = ['product_hierarchy_data:read', 'users:read']

/**
 * `GET /notes` `pageLimit` bounds: "minimum 1, maximum 2000, default 100"
 * (https://developer.productboard.com/v1.0.0/reference/getnotes). The other
 * v1 lists document no page-size parameter and return 100 rows a page.
 */
export const NOTES_MAX_PAGE_LIMIT = 2000
