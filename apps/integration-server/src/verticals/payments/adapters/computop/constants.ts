/**
 * Computop Paygate REST API (v2) constants.
 *
 * The root URL selects the environment: requests to the test host never touch
 * live data. The API version is pinned in the path (`/api/v2`) so the
 * adapter's transforms stay deterministic — bump this when re-tested against a
 * newer version.
 *
 * Docs: https://developer.computop.com / https://computop-docs.redocly.app
 */
export const API_VERSION = 'v2'
export const API_BASE_URL = 'https://www.computop-paygate.com/api/v2'
export const TEST_API_BASE_URL = 'https://test.computop-paygate.com/api/v2'

/**
 * Computop paginates `GET` collections with a 1-based `page` query parameter
 * and returns a `{ totalNumberOfPages, page, pageSize, data[] }` envelope. The
 * page size is fixed server-side, so there is no `perPage` knob to send.
 */
export const DEFAULT_PAGE = 1
