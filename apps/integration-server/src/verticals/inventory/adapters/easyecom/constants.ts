/**
 * EasyEcom REST API constants.
 *
 * Auth: dual-header — x-api-key (static key from Account Settings) +
 *       Authorization: Bearer <jwt_token> (90-day JWT obtained via auth endpoint).
 * Docs: https://api-docs.easyecom.io/
 */
export const API_BASE_URL = 'https://api.easyecom.io'
export const DEFAULT_PAGE_SIZE = 50
