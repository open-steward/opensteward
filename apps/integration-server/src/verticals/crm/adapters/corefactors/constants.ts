/**
 * Corefactors (Teleduce) API constants.
 *
 * Docs: https://www.corefactors.ai/blog/teleduce-list-management-api/
 *
 * The Corefactors REST API uses the API key embedded directly in the URL
 * path rather than an HTTP header. Every account's API key is provisioned by
 * the Corefactors team.
 */

/** Production base URL for the Teleduce REST API. */
export const BASE_URL = 'https://teleduce.corefactors.in'

/** Default page size for list operations (Corefactors does not publish a hard cap). */
export const DEFAULT_PAGE_SIZE = 25

/** URL path prefix for lead (contact) creation. The API key is appended as the next segment. */
export const LEAD_API_PATH = '/leadapi'

/** URL path prefix for list-management operations. */
export const LIST_API_PATH = '/listmgmtapi'
