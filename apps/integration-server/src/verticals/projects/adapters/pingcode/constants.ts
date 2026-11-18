/**
 * PingCode REST API constants.
 *
 * PingCode exposes a single REST API rooted at `https://open.pingcode.com`
 * (private/on-prem deployments swap the host, keeping the `/v1` prefix).
 * Resources are namespaced by "area": the agile project-management module
 * lives under `/v1/agile/*` and the enterprise directory under
 * `/v1/directory/*`.
 *
 * Auth is OAuth2 client-credentials: an enterprise access token is minted
 * from `/v1/auth/token` and presented as a `Bearer` header. There is no
 * interactive authorize/redirect step.
 *
 * Docs: https://open.pingcode.com/  (REST API reference)
 */

/** Public-cloud REST API root. On-prem deployments override the host. */
export const API_BASE_URL = 'https://open.pingcode.com'

/** GET token endpoint — `?grant_type=client_credentials&client_id&client_secret`. */
export const OAUTH_TOKEN_PATH = '/v1/auth/token'

/** Default `page_size`. PingCode pages are 0-indexed via `page_index`. */
export const DEFAULT_PAGE_SIZE = 100
