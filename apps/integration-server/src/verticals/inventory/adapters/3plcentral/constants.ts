/**
 * 3PL Central (Extensiv Warehouse Manager) REST API constants.
 *
 * Base URL: https://secure-wms.com
 * Token URL: POST https://secure-wms.com/AuthServer/api/Token
 * Auth: OAuth2 client-credentials; Basic base64(clientId:clientSecret) + form body
 * Pagination: pgnum (page number, 1-based), pgsiz (page size, default 100, max 500)
 * Response envelope: HAL+JSON — records in ResourceList or _embedded arrays
 * TotalResults field drives pagination.
 */
export const API_BASE_URL = 'https://secure-wms.com'
export const TOKEN_URL = 'https://secure-wms.com/AuthServer/api/Token'
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500
