/**
 * HelpSpot API constants.
 *
 * HelpSpot is self-hosted. Customers provide their own installation URL.
 * The API endpoint is always <installBaseUrl>/api/index.php, with methods
 * passed as a `method` query parameter.
 *
 * Auth: Bearer API key in Authorization header.
 * Output: JSON (output=json query param).
 * Pagination: `start` (0-based offset) + `length` (page size).
 */

/** The API path, relative to the tenant's installation base URL. */
export const API_PATH = '/api/index.php'

/** Always request JSON responses. */
export const OUTPUT_FORMAT = 'json'

export const DEFAULT_PAGE_SIZE = 50
