/**
 * Assently E-Sign REST API (v3) constants.
 *
 * Assently exposes two environments — production (`assently.com`) and a
 * sandbox/test environment (`test.assently.com`). Both serve the v3 API
 * under the `/apiv3` path prefix; resource calls nest under
 * `${API_BASE_URL}/api/...`.
 *
 * Auth is OAuth 2.0 Client-Credentials: the customer's API Key + API Secret
 * are POSTed (Basic-encoded) to the `/apiv3/token` endpoint with
 * `grant_type=client_credentials`, returning a short-lived bearer token used
 * for every subsequent resource call.
 *
 * Docs: https://developer.assently.com/docs/getting-started
 *       https://developer.assently.com/reference/authentication
 */

/** Production API base. Resource calls nest under `${API_BASE_URL}/api/...`. */
export const API_BASE_URL = 'https://assently.com/apiv3'

/** Sandbox/test API base. */
export const SANDBOX_API_BASE_URL = 'https://test.assently.com/apiv3'

/** OAuth2 client-credentials token endpoints (key:secret Basic-encoded). */
export const TOKEN_URL = 'https://assently.com/apiv3/token'
export const SANDBOX_TOKEN_URL = 'https://test.assently.com/apiv3/token'

/** `findcases` paginates with skip/take; `take` is capped server-side at 100. */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
