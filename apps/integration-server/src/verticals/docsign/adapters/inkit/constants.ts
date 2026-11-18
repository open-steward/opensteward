/**
 * Inkit REST API constants.
 *
 * Inkit is a document-generation platform: it renders documents from
 * templates + merge parameters and delivers them to destinations. The
 * public REST API is single-tenant — one host, no separate sandbox base
 * URL is documented — authenticated by a static API token sent in the
 * `X-Inkit-API-Token` header.
 *
 * Docs: https://docs.inkit.com/docs/making-api-requests
 */
export const API_BASE_URL = 'https://api.inkit.com/v1'

/** Auth header carrying the static API token. */
export const API_TOKEN_HEADER = 'X-Inkit-API-Token'

/** List endpoints page with `page` (1-indexed) + `page_size` (1..100). */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
