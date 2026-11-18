/**
 * DocHub constants.
 *
 * DOCUMENTED API (found 2026-09-24)
 * =================================
 * DocHub publishes "DocHub Public API V2" (OpenAPI 3.0.3) at
 * https://dev.dochub.com/api-reference/openapi.yaml, the developer portal
 * dochub.com itself names (`"DEVELOPER_PORTAL_URL":"https://dev.dochub.com"`).
 * Its server is `https://{defaultHost}` with `defaultHost` default
 * `dochub.com`, and every path is under `/api/v2/`.
 *
 * An earlier note here read https://dochub.com/developers ("No available
 * documents here") as the developer portal. That page is the DocHub user
 * profile of an entity named "Developers" (`og:type` profile, "Developers's
 * profile on DocHub"), not API documentation.
 *
 * V2_API_BASE_URL, the OAuth URLs and DEFAULT_SCOPES are verified, the OAuth
 * values against https://dochub.com/.well-known/oauth-authorization-server
 * (RFC 8414 metadata). The v1 host and sandbox host below are still
 * UNVERIFIED PLACEHOLDERS (api.dochub.com does not resolve), used only by
 * listEnvelopes / getEnvelope / listTemplates / getTemplate, which are not
 * rebuilt onto V2 yet.
 */

/**
 * Placeholder API version string.
 * @unverified — no public API documentation found
 */
export const API_VERSION = 'v1'

/**
 * Placeholder production REST base URL.
 * @unverified — dochub.com/developers shows no API documentation
 */
export const API_BASE_URL = `https://api.dochub.com/${API_VERSION}`

/**
 * Placeholder sandbox REST base URL.
 * @unverified — no sandbox environment documentation found
 */
export const SANDBOX_API_BASE_URL = `https://api.sandbox.dochub.com/${API_VERSION}`

/**
 * `"authorization_endpoint":"https://dochub.com/oauth/authorize"` in
 * https://dochub.com/.well-known/oauth-authorization-server, which also
 * gives `"code_challenge_methods_supported":["S256"]`.
 */
export const OAUTH_AUTHORIZE_URL = 'https://dochub.com/oauth/authorize'

/**
 * `"token_endpoint":"https://dochub.com/api/v2/oauth/token"` in the same
 * metadata document; operationId createOAuthToken in the OpenAPI spec
 * (`security: - basicAuth: []`, "`authorization_code` - Exchange
 * authorization code for access token (with PKCE)").
 */
export const OAUTH_TOKEN_URL = 'https://dochub.com/api/v2/oauth/token'

/**
 * Documented base for DocHub Public API V2: `servers: - url: https://{defaultHost}`
 * with `defaultHost: default: dochub.com`, paths `/api/v2/...`.
 */
export const V2_API_BASE_URL = 'https://dochub.com/api/v2'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * Both are in the metadata document's `scopes_supported`, and the spec names
 * the operations that need them:
 * - `sign_requests:read`: listSignRequests "Requires `sign_requests:read` scope"
 * - `sign_requests:write`: voidSignRequest "Requires the `sign_requests:write`
 *   scope and read access to the sign request."
 */
export const DEFAULT_SCOPES = ['sign_requests:read', 'sign_requests:write']
