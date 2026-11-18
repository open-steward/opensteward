/**
 * osTicket API constants.
 *
 * osTicket is self-hosted; the base URL is supplied per-credential as
 * credentials.extra.baseUrl (e.g. "https://support.example.com").
 *
 * Supported via the official osTicket HTTP API together with the
 * community "API Endpoints Plugin" (markus-michalski/osticket-api-endpoints).
 * Authentication: X-API-Key header.
 */

/** Trailing path segment for the core API. */
export const API_PATH = '/api'

/** Default page size for paginated list operations. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size accepted by tickets-search.php. */
export const MAX_PAGE_SIZE = 100
