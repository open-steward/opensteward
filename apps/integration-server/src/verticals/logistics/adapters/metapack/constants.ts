/**
 * Metapack API hosts.
 *
 * Shipping API (https://dev.metapack.com/shipping/guides/get-carriers/):
 *   "GET /shipping/v1/carriers HTTP/1.1 Host: api.metapack.com"
 * Its spec's servers[0] is the sandbox, "https://api.sbx.metapack.com/shipping/v1".
 *
 * Tracking API (https://dev.metapack.com/tracking/reference/tracking/overview/),
 * spec servers: "https://api.sbx.metapack.com/tracking/v1" (Sandbox) and
 * "https://api.metapack.com/tracking/v1" (Production).
 */
export const METAPACK_SHIPPING_API_BASE = 'https://api.metapack.com/shipping/v1/'
export const METAPACK_SHIPPING_API_BASE_SANDBOX = 'https://api.sbx.metapack.com/shipping/v1/'
export const METAPACK_TRACKING_API_BASE = 'https://api.metapack.com/tracking/v1/'
export const METAPACK_TRACKING_API_BASE_SANDBOX = 'https://api.sbx.metapack.com/tracking/v1/'

export const METAPACK_DASHBOARD_URL = 'https://www.metapack.com/'

export const RATE_LIMIT_RPS = 10
