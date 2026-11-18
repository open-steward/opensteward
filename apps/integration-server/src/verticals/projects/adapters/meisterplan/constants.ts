/**
 * Meisterplan REST API constants.
 *
 * Meisterplan is a portfolio / resource-planning SaaS.  Every tenant is
 * hosted in either the US or EU region.  The region is chosen at
 * credential-capture time and stored in `credentials.extra.region`.
 *
 * Authentication: long-lived API token sent as the entire value of the
 * `Authorization` header — the `api-` prefix is part of the token itself.
 *   Authorization: api-48eba51e5a8d43ed8a8daeba585b7093
 *
 * Pagination: cursor-based.  List endpoints accept `pageSize` + `pageAfter`
 * (opaque cursor string); the response carries `_pagination.after.cursor`
 * for the next page (absent / null when no further pages exist).
 *
 * Docs: https://api.us.meisterplan.com/docs/api.html
 */

export const API_BASE_URL_US = 'https://api.us.meisterplan.com/v1'
export const API_BASE_URL_EU = 'https://api.eu.meisterplan.com/v1'

/** Used when credentials.extra.region is absent — default to US. */
export const API_BASE_URL_DEFAULT = API_BASE_URL_US

/** Special scenario ID recognised by Meisterplan as the Plan of Record. */
export const PLAN_OF_RECORD_ID = 'PlanOfRecord'

/** Where a user generates an API token in Meisterplan. */
export const API_KEY_HELP_URL =
  'https://help.meisterplan.com/hc/en-us/articles/360028700752-REST-API-Manage-API-Tokens'

/** Documented `pageSize` default on every paginated endpoint. */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Documented `pageSize` maximum on `GET /scenarios/{id}/projects`,
 * `GET /resources` and `GET /scenarios/{id}/projects/{id}/taskManagementLink/tasks`
 * ("maximum":500 in https://api.us.meisterplan.com/swagger.json).
 */
export const MAX_PAGE_SIZE = 500

/**
 * Documented `pageSize` maximum on `GET /scenarios/{id}/projects/{id}/comments`
 * ("maximum":100 in https://api.us.meisterplan.com/swagger.json).
 */
export const COMMENTS_MAX_PAGE_SIZE = 100
