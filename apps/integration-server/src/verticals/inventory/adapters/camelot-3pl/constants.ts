/**
 * Camelot 3PL Software (Excalibur WMS) API constants.
 *
 * The Excalibur WMS is tenant-hosted: each customer's instance runs at a
 * distinct URL supplied during provisioning. There is therefore no single
 * global base URL — the base URL is stored in credentials.extra.baseUrl.
 *
 * Auth: Bearer API key supplied via the Authorization header.
 * Pagination: page + pageSize query parameters (1-indexed).
 */
export const DEFAULT_PAGE_SIZE = 100
