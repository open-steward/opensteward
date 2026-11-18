/**
 * InSales Admin REST API constants.
 *
 * InSales exposes a REST API under `/admin/` on each merchant's domain,
 * formatted as `https://{shop}.myinsales.ru/admin/`. Credentials are an
 * api_id + api_secret pair created inside the InSales admin panel and
 * supplied via HTTP Basic auth.
 *
 * Rate limit: 500 requests per 5-minute window tracked by the
 * `API-Usage-Limit` response header (e.g. `1/500`). 429 responses carry
 * a `Retry-After` header (seconds).
 *
 * Pagination: offset-based with `per_page` (max 250) and `page` params;
 * cursor-style iteration is also supported via `from_id` + `per_page`.
 */

/** Number of items per page for list requests. */
export const DEFAULT_PAGE_SIZE = 100

/** Maximum items InSales allows per page. */
export const MAX_PAGE_SIZE = 250
