/**
 * FPT.eContract REST API constants.
 *
 * FPT.eContract is a Vietnamese electronic-contract platform (FPT IS),
 * accessed by partner systems over a REST API with a static partner API
 * key. The production service is hosted on FPT Cloud; FPT provisions a
 * dedicated sandbox tenant for integration testing on the same host shape.
 *
 * Auth is a static API key sent in the `api-key` request header (the
 * convention used across FPT's API ecosystem). There is no OAuth
 * Authorization-Code flow for server-to-server integrations, so the
 * Connect Link credential form collects the key (and the environment).
 *
 * Resource paths nest under `/api/v1/...` and use snake-free, camelCase
 * JSON on the wire; list endpoints are `page` + `pageSize` paginated.
 *
 * Product: https://econtract.fpt.com.vn/
 */

/** Production REST host. */
export const PROD_BASE_URL = 'https://api-econtract.fpt.com.vn'

/** Sandbox / UAT REST host. */
export const SANDBOX_BASE_URL = 'https://api-econtract-uat.fpt.com.vn'

/** Environment slug → API host. The credential form offers these as a closed set. */
export const ENVIRONMENT_BASE_URLS: Record<string, string> = {
  production: PROD_BASE_URL,
  sandbox: SANDBOX_BASE_URL,
}

/** Default host when the customer does not pick an environment. */
export const API_BASE_URL = PROD_BASE_URL

/** All resources are versioned under `/api/v1`. */
export const API_PREFIX = '/api/v1'

/** FPT.eContract list endpoints default to 20 rows; the documented max is 100. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
