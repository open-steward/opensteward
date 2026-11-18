/**
 * Bitso Business REST API constants.
 *
 * Bitso exposes a single REST API (v3) under two hosts: production at
 * `https://api.bitso.com` and a staging/testing environment at
 * `https://stage.bitso.com`. Both serve the same `/v3/...` paths. The host is
 * selected from the credential form (`environment` field) and stored on
 * `credentials.extra.baseUrl`.
 *
 * Docs: https://docs.bitso.com/bitso-business/docs
 */
export const PRODUCTION_BASE_URL = 'https://api.bitso.com'
export const STAGING_BASE_URL = 'https://stage.bitso.com'

/** Default page size for cursor-paginated (`marker` + `limit`) list endpoints. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
