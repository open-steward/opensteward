/**
 * Zenvia Customer Cloud API constants.
 *
 * Production base URL for the Customer Cloud (CRM / customer-service) REST API.
 * Authentication: API key passed as `api-key` query parameter.
 *
 * Docs: https://sales.zenvia.com/
 */
export const API_BASE_URL = 'https://sales.zenvia.com/api/v1'

/** Records per request when the caller names no limit. */
export const DEFAULT_PAGE_SIZE = 100

/**
 * The largest `limit` sent on a paged list. The API reference
 * (https://sales.zenvia.com/, GET /prospects and GET /prospects/interactions)
 * documents `limit` as "The maximum number of items that must be returned
 * (A multiple number of 100 and no more than 1000 is recommended)".
 */
export const MAX_PAGE_SIZE = 1000

/** Default scopes requested when generating API credentials. */
export const DEFAULT_SCOPES = [
  'leads:write',
  'prospects:read',
  'prospects:readAdditionalData',
  'notifications',
  'messages:channels',
]
