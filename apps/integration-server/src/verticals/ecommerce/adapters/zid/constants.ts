/**
 * Zid REST API constants.
 *
 * Zid's Merchant API lives at api.zid.sa/v1. Authentication uses OAuth 2.0
 * authorization code grant — tokens are issued by oauth.zid.sa.
 *
 * Docs: https://docs.zid.sa/authorization
 */

/** Production REST API base URL. */
export const API_BASE_URL = 'https://api.zid.sa/v1'

/** OAuth 2.0 authorization endpoint. */
export const OAUTH_AUTHORIZE_URL = 'https://oauth.zid.sa/oauth/authorize'

/** OAuth 2.0 token endpoint (code exchange + refresh). */
export const OAUTH_TOKEN_URL = 'https://oauth.zid.sa/oauth/token'

/**
 * Default page size for paginated list calls.
 * Zid's /v1/managers/store/orders and /v1/managers/store/customers support
 * `per_page` up to 100. The product list uses `page_size`.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Default OAuth scopes. Zid scopes are configured in the Partner Dashboard;
 * the API does not enumerate them as strings. Pass an empty array to omit the
 * `scope` parameter and rely on the dashboard defaults.
 */
export const DEFAULT_SCOPES: string[] = []
