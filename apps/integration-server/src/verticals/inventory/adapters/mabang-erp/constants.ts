/**
 * Mabang ERP (马帮ERP) Open API constants.
 *
 * Auth: HMAC-SHA256 per-request signature.
 *   Each POST body includes developerId + timestamp + action;
 *   the Authorization header carries the hex-encoded HMAC-SHA256
 *   of the serialised JSON body, keyed by the developer secret.
 *
 * Docs: https://wiki.mabangerp.com/developer_api.htm
 */
export const API_BASE_URL = 'http://openapi.mabangerp.com'

/** Default page index (1-based) used when none is supplied. */
export const DEFAULT_PAGE = 1

/** Rate limit: 300 req/min — keep burst retries conservative. */
export const DEFAULT_PAGE_SIZE = 100
