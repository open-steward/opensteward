/**
 * FreeScout API constants.
 *
 * FreeScout is self-hosted; there is no fixed base URL. The tenant provides
 * their instance URL (e.g. https://support.example.com) and the API lives at
 * <instanceUrl>/api.  The client builds the full base URL from credentials.
 *
 * Docs: https://api-docs.freescout.net/
 */

/** Path prefix appended to the tenant instance URL. */
export const API_PATH_PREFIX = '/api'

/** Default page size for list endpoints (FreeScout default is 50, max varies). */
export const DEFAULT_PAGE_SIZE = 50
