/**
 * eversign REST API constants.
 *
 * eversign authenticates via a static API key passed as the `access_key`
 * query parameter on every request — there's no Bearer header, and no
 * OAuth flow at all. Multi-business accounts pass an additional
 * `business_id`; we store it on `credentials.extra.businessId`.
 *
 * Docs: https://eversign.com/api/documentation
 */
export const API_BASE_URL = 'https://api.eversign.com/api'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * eversign is API-key auth; scopes are not meaningful. The constant is
 * kept so the adapter file layout matches DocuSign one-for-one.
 */
export const DEFAULT_SCOPES: string[] = []

/**
 * eversign document.type filter values. The list endpoint requires a
 * `type` query parameter; we default to `all` so the canonical list call
 * returns every status.
 */
export const DEFAULT_LIST_TYPE = 'all'
