/**
 * Scopevisio OpenScope REST API constants.
 *
 * Docs: https://appload.scopevisio.com/static/swagger/index.html
 * OpenAPI spec: https://appload.scopevisio.com/rest/swagger.json
 */

/** Production REST base URL (no sandbox – same endpoint, scoped by org). */
export const SCOPEVISIO_API_BASE = 'https://appload.scopevisio.com/rest'

/** Token endpoint for obtaining/refreshing bearer tokens. */
export const SCOPEVISIO_TOKEN_URL = 'https://appload.scopevisio.com/rest/token'

/** Pagination: default page size used in POST search bodies. */
export const DEFAULT_PAGE_SIZE = 100

/** Pagination: maximum page size the API supports. */
export const MAX_PAGE_SIZE = 5000
