/**
 * StockTrim REST API constants.
 *
 * Auth: api-auth-id (tenant UUID) + api-auth-signature (tenant name),
 * both sent as custom request headers.
 * Base address: https://api.stocktrim.com/api (per official docs)
 * Swagger: https://api.stocktrim.com/index.html
 */
export const API_BASE_URL = 'https://api.stocktrim.com/api'
export const DEFAULT_PAGE_SIZE = 100
