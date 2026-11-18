/**
 * Secured Signing REST API constants.
 *
 * Secured Signing splits its surface across two hosts: OAuth 2.0 endpoints
 * live under the marketing host (www.securedsigning.com/api/oauth2/...),
 * while the REST resources live under the API host
 * (api.securedsigning.com/web/{version}/...). There is no separately-hosted
 * sandbox; test accounts run against the same hosts.
 *
 * Docs: https://www.securedsigning.com/support/secured-signing-api-with-oauth2/
 */

/** REST API version path segment. */
export const API_VERSION = 'v1.4'

/** Base URL for the REST resource API; versioned paths nest under `/web`. */
export const API_BASE_URL = `https://api.securedsigning.com/web/${API_VERSION}`

/** OAuth 2.0 endpoints (Authorization-Code Grant + Refresh). */
export const OAUTH_AUTHORIZE_URL = 'https://www.securedsigning.com/api/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://www.securedsigning.com/api/oauth2/token'
export const OAUTH_REVOKE_URL = 'https://www.securedsigning.com/api/oauth2/revoke'

/**
 * Secured Signing list endpoints are not paginated — `GetActiveDocuments`
 * returns every in-progress / signed document in the requested folder. The
 * page-size constants are retained only so QueryParams handling stays
 * uniform with the rest of the vertical.
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * `GetActiveDocuments` folder filter. Allowed values: `InBox`, `Progress`,
 * `Signed`. `Progress` (in-flight) is the default the adapter lists; callers
 * override via QueryParams.folder.
 */
export const DEFAULT_FOLDER = 'Progress'

/**
 * Default OAuth scopes. `Basic` covers account/profile reads; `WeSign`
 * covers the multi-party signing requests the canonical Envelope maps to.
 */
export const DEFAULT_SCOPES = ['Basic', 'WeSign']
