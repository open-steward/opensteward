export const API_BASE_URL = 'https://platform.thena.ai/v1'
export const DEFAULT_PAGE_SIZE = 50
/** GET /v1/tickets `limit`: "minimum: 1, maximum: 100" (docs.thena.ai, Get all tickets). */
export const TICKETS_MAX_LIMIT = 100
/**
 * GET /v1/search/{collection} `per_page`: "Results are paginated with a maximum of
 * 250 items per page" (docs.thena.ai, api-reference/mcp/teams/search-teams).
 */
export const SEARCH_MAX_PER_PAGE = 250
