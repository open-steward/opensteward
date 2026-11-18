/**
 * Baserow REST API constants.
 *
 * Baserow is a no-code database platform that exposes a REST API at
 * `https://api.baserow.io/api/`. Self-hosted instances use the same path
 * under the custom domain. Authentication is via a long-lived personal API
 * token (also called a "database token") sent as `Authorization: Token <key>`.
 *
 * Docs: https://baserow.io/docs/apis/rest-api
 */

/** Cloud production base URL. Self-hosted: replace with `https://<your-domain>/api`. */
export const API_BASE_URL = 'https://api.baserow.io/api'

/** Where a user creates a personal API token. */
export const TOKEN_HELP_URL = 'https://baserow.io/user-docs/personal-api-tokens'

/**
 * List-endpoint page size. Baserow's rows endpoint supports up to 200; we
 * request 100 by default to stay well within limits.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Largest `size` the rows endpoint accepts. Baserow's paginator
 * (https://gitlab.com/baserow/baserow/-/raw/develop/backend/src/baserow/api/pagination.py)
 * answers a larger one with ERROR_PAGE_SIZE_LIMIT, "The page size is limited
 * to {limit}.", and the rows view passes `settings.ROW_PAGE_SIZE_LIMIT`,
 * which defaults to 200 (`BASEROW_ROW_PAGE_SIZE_LIMIT`).
 */
export const MAX_ROW_PAGE_SIZE = 200
