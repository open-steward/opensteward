/**
 * Dex CRM API — hosts and auth.
 *
 * Current public API (https://getdex.com/docs/api-reference/authentication):
 *   "Base URL https://api.prod.getdex.com"
 *   "Required header Authorization: Bearer dex_your_api_key"
 * The live OpenAPI document (https://api.prod.getdex.com/docs/json, "Dex Public
 * API") agrees: servers [https://api.prod.getdex.com], securitySchemes
 * bearerAuth — "Use your Dex API key (e.g. dex_abc123...) as the Bearer token."
 *
 * Every READ method (list/get contacts, notes, activities) uses this host.
 */
export const V1_BASE_URL = 'https://api.prod.getdex.com'

/**
 * LEGACY Hasura REST host and header. Neither appears in Dex's current docs,
 * and the host no longer completes a TLS handshake. Only the write methods
 * (create/update/delete), which this rebuild left out of scope, still use it.
 */
export const BASE_URL = 'https://api.getdex.com/api/rest'

/** LEGACY header name — see {@link BASE_URL}. */
export const AUTH_HEADER = 'x-hasura-dex-api-key'
