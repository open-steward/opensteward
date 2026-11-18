/**
 * api-reference/overview.md: "The base URL for the API is https://api.folk.app".
 * Every path in the 2025-06-09 OpenAPI spec is under /v1; there is no /v2.
 */
export const BASE_URL = 'https://api.folk.app'

/**
 * api-reference/versioning.md: "You can specify the API version you want to
 * use through the `X-API-Version` header." Pinned to the spec the transforms
 * were written against (https://developer.folk.app/schemas/2025-06-09.json).
 */
export const API_VERSION = '2025-06-09'

/**
 * GET /v1/people, /v1/companies and /v1/notes all declare `limit` with
 * "minimum": 1, "maximum": 100, "default": 20.
 */
export const MAX_PAGE_SIZE = 100
