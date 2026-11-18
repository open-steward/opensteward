/**
 * BetterCommerce Commerce API constants.
 *
 * BetterCommerce exposes its backend via a versioned REST API hosted at
 * `api20.bettercommerce.io` (production). The API version is embedded as a
 * query-string / path segment — currently `v2`. Tokens are obtained from
 * `auth.bettercommerce.io` using the OAuth 2.0 client-credentials grant and
 * have a 24-hour TTL.
 *
 * Docs: https://docs.commerceapi.bettercommerce.io/
 */

/** Production Commerce API base URL. */
export const BASE_URL = 'https://api20.bettercommerce.io'

/** Authentication (token) endpoint. */
export const AUTH_URL = 'https://auth.bettercommerce.io'

/** Token path under AUTH_URL. */
export const TOKEN_PATH = '/oAuth/Token'

/** API version prefix used in every endpoint path. */
export const API_VERSION = 'v2'

/** Default and maximum page sizes for list operations. */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/** Grant type used by the client-credentials OAuth flow. */
export const GRANT_TYPE = 'client_credentials'
