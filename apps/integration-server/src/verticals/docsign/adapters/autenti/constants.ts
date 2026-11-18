/**
 * Autenti Document Process API v2
 * (https://stoplight.io/api/v1/projects/cHJqOjQxMTI4/nodes/111e9353643f4, the
 * OpenAPI `servers` entry "Production server", url
 * 'https://api.autenti.com/api/v2'). OAuth endpoints are from the
 * "Authorization code grant" article (node a7847a3b741c6):
 * "GET https://api.autenti.com/api/v2/auth/authorization?" and
 * "POST https://api.autenti.com/api/v2/auth/token".
 */
export const API_BASE_URL = 'https://api.autenti.com/api/v2'
export const OAUTH_AUTHORIZE_URL = 'https://api.autenti.com/api/v2/auth/authorization'
export const OAUTH_TOKEN_URL = 'https://api.autenti.com/api/v2/auth/token'

/**
 * `GET /document-processes` paging (Pagination article, node 30f41d2b8b50d):
 * "`limit`| 64 | infinite | The mixum number of documents to be returned in
 * the response" and "The maximum page size is 128 documents. The request to
 * return a lager page size will not fail, but the page size will be reduced to
 * maximum."
 */
export const DEFAULT_PAGE_SIZE = 64
export const MAX_PAGE_SIZE = 128

/**
 * `read`: "allow access to process information, including listing and
 * searching (shortcut for [list,read_one])" (securitySchemes.autenti_auth).
 */
export const DEFAULT_SCOPES = ['read']
