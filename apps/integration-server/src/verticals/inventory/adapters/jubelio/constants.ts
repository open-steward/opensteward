/**
 * Jubelio Omnichannel REST API constants.
 *
 * Base URL: https://api.jubelio.com (confirmed via iqomp/jubelio PHP client).
 * Auth: POST /login {email, password} → {token} → Authorization: <token> header.
 * Pagination: ?page=1&pageSize=20 query params (1-based page index).
 */
export const API_BASE_URL = 'https://api.jubelio.com'
export const DEFAULT_PAGE_SIZE = 20
