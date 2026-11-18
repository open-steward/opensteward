/**
 * Ruddr API constants.
 *
 * Base URL: https://www.ruddr.io/api/workspace
 * Auth:     Authorization: Bearer <api_key>
 * Docs:     https://docs.ruddr.io/
 */

/** Production REST API base — all resource paths are relative to this. */
export const API_BASE_URL = 'https://www.ruddr.io/api/workspace'

/** URL to the API key help article (used in the Connect Link form). */
export const API_KEY_HELP_URL = 'https://help.ruddr.io/hc/en-us/articles/7011381404695-API-Keys'

/**
 * Default page size for list endpoints.
 * Ruddr supports 1–100; defaults to 10 when omitted, so we request 100.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Documented maximum of `limit`: "The maximum number of results to be
 * returned. Can be any number from 1 to 100. Defaults to 10, if not provided."
 * (Limit parameter, https://docs.ruddr.io/api-reference/projects/list-projects.md).
 * The pagination guide gives the same range: "Maximum number of results to
 * return (`1`–`100`)" (https://docs.ruddr.io/guides/pagination).
 */
export const MAX_PAGE_SIZE = 100
