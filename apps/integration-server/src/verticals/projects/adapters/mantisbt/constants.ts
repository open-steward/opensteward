/**
 * MantisBT is self-hosted. The REST API is mounted at `{host}/api/rest`.
 * `API_BASE_PATH` is the path suffix appended to the user-supplied host;
 * the client builds the full base URL as `${host}${API_BASE_PATH}`.
 *
 * Auth: a raw API token is passed in the `Authorization` HTTP header
 * (no "Bearer" prefix — MantisBT consumes the value as-is).
 *
 * Pagination: `page` (1-based) + `page_size` query parameters.
 */
export const API_BASE_PATH = '/api/rest'

/** Default demo/reference host — individual installs differ. */
export const DEFAULT_HOST = 'https://mantisbt.org/bugs'

export const API_KEY_HELP_URL =
  'https://mantisbt.org/docs/master/en-US/Developers_Guide/html/restapi.html'

export const DEFAULT_PAGE_SIZE = 50

/**
 * Pages of issues (at {@link DEFAULT_PAGE_SIZE}) `listTags` reads before it
 * gives up: tags have no endpoint of their own, so the whole tag set means
 * every issue in the project. A guard against a runaway walk, not a
 * platform limit.
 */
export const MAX_TAG_SCAN_PAGES = 200
