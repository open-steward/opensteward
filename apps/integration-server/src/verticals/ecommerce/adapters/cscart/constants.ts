/**
 * CS-Cart REST API constants.
 *
 * CS-Cart exposes a REST API under `{baseUrl}/api/` on the self-hosted store.
 * The API does not use a version prefix in the URL — all routes are directly
 * under `/api/`. HTTP Basic auth combines the admin email with the API key.
 */

/** Number of items to request per page when no limit is specified. */
export const DEFAULT_PAGE_SIZE = 10

/** Maximum items per page accepted by the CS-Cart API. */
export const MAX_PAGE_SIZE = 100
