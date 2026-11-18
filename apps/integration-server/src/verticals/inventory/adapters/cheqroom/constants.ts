/**
 * Cheqroom REST API constants.
 *
 * Cheqroom is an equipment/asset tracking platform. The v2_5 REST API
 * uses Bearer-token authentication via an API key generated in
 * Settings → Integrations → API.
 *
 * Auth: single API key sent as `Authorization: Bearer <apiKey>`.
 * Pagination: `_skip` (offset) + `_limit` (page size).
 */
export const API_BASE_URL = 'https://api.cheqroom.com/api/v2_5'
export const DEFAULT_PAGE_SIZE = 100
