/**
 * Helpshift REST API constants.
 *
 * Base URL: https://api.helpshift.com/v1/{domain}/{resource}
 * Auth: HTTP Basic with api_key as username and empty password.
 * Pagination: page + page-size query params; response includes total-pages.
 */
export const API_BASE_URL = 'https://api.helpshift.com/v1'
export const DEFAULT_PAGE_SIZE = 100
// "adjusting the total-hits to an integer between 1-1000" for GET /issues:
// https://developers.helpshift.com/rest-api/scenarios/
export const MAX_PAGE_SIZE = 1000
