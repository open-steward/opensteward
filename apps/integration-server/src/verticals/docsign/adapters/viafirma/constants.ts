/**
 * Viafirma Documents REST API constants.
 *
 * Viafirma Documents exposes a versioned REST API rooted at
 * `{host}/documents/api/v3`. Two managed environments exist — the public
 * sandbox (`sandbox.viafirma.com`) and production (`documents.viafirma.com`).
 * On-premise / private installations override the host via the
 * `baseUrl` value stored on `credentials.extra`.
 *
 * Authentication is delegated to Viafirma Fortress's OAuth2 server. The
 * Authorization-Code and Client-Credentials grants are both supported; the
 * resulting access token is presented as a Bearer token on every Documents
 * request.
 *
 * Docs: https://doc.viafirma.com/documents/api/latest/en/
 *       https://doc.viafirma.com/documents/api/latest/en/security.html
 */
export const API_VERSION = 'v3'

/** Documents REST API path prefix, appended to the resolved host. */
export const API_PATH_PREFIX = `/documents/api/${API_VERSION}`

/** Default Documents host (public sandbox). Production: documents.viafirma.com. */
export const DEFAULT_BASE_URL = 'https://sandbox.viafirma.com'
export const PRODUCTION_BASE_URL = 'https://documents.viafirma.com'

/**
 * Fortress OAuth2 endpoints. The authorize endpoint lives at
 * `{fortress}/oauth2/v1/auth`; the token endpoint at
 * `{fortress}/fortress/oauth2/v1/token`. The sandbox Fortress is co-hosted
 * with the sandbox Documents host under the `/fortress` context.
 */
export const DEFAULT_FORTRESS_URL = 'https://sandbox.viafirma.com/fortress'
export const PRODUCTION_FORTRESS_URL = 'https://fortress.viafirma.com/fortress'

/** OAuth2 scopes. `profile` is sufficient for the Documents read surface. */
export const DEFAULT_SCOPES = ['profile']
