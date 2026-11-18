/**
 * NHN Commerce (Godomall / Shopby) Shop API constants.
 *
 * The Shopby Shop API is served from a single base URL. Every request must
 * carry three headers: `Version`, `clientId`, and `platform`. Member-scoped
 * endpoints additionally require an `accessToken` header containing a
 * short-lived bearer token obtained via POST /oauth/token.
 *
 * Docs: https://docs.shopby.co.kr / https://server-docs.shopby.co.kr
 */

/** REST API base URL — same for all malls. */
export const BASE_URL = 'https://shop-api.e-ncp.com'

/** API version sent in the `Version` header on every request. */
export const API_VERSION = '1.0'

/** Default platform value sent in the `platform` header. */
export const DEFAULT_PLATFORM = 'PC'

/** Default page size for paginated list endpoints (max 200). */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size accepted by the API. */
export const MAX_PAGE_SIZE = 200

/**
 * OAuth token endpoint path.
 * POST body: { memberId, password, keepLogin }
 * Response:  { accessToken, expireIn }
 *
 * This issues a member-scoped access token valid for 12 h (or 90 d when
 * keepLogin=true). The adapter uses this for all authenticated calls.
 */
export const TOKEN_PATH = '/oauth/token'
