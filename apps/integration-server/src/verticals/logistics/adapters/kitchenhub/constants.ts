/**
 * KitchenHub API constants.
 *
 * Every operation in the first-party OpenAPI reference
 * (https://kitchenhub.readme.io/reference/get_v2-providers-1.md and siblings)
 * names one server: `"servers": [ { "url": "https://api.kitchenhub.app",
 * "description": "KitchenHub API url" } ]`. Paths carry a trailing slash
 * (`/v2/providers/`, `/v2/orders/`, `/v2/auth/token/`).
 */

/** Base URL for all KitchenHub v2 API calls. */
export const KITCHENHUB_API_BASE = 'https://api.kitchenhub.app/v2/'

/** "Create pair tokens": POST /v2/auth/token/ with { client_id, client_secret }. */
export const KITCHENHUB_TOKEN_URL = 'https://api.kitchenhub.app/v2/auth/token/'

/** "Update access token": POST /v2/auth/token/refresh/ with { refresh_token }. */
export const KITCHENHUB_REFRESH_TOKEN_URL = 'https://api.kitchenhub.app/v2/auth/token/refresh/'
