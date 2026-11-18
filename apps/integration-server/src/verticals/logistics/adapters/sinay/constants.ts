/**
 * Sinay (SafeCube) API constants.
 *
 * The platform rebranded from Sinay to SafeCube; the slug remains `sinay` for
 * backwards-compatibility. Both domain names are in active use.
 *
 * Docs: https://documentation.safecube.ai/reference/about-the-api.md
 */

/** Container Tracking API — used for GET /shipment queries. */
export const SINAY_TRACKING_API_BASE = 'https://api.sinay.ai/container-tracking/api/v2'

/** Shipment Management API — used for POST /public/shipments and search. */
export const SINAY_MGMT_API_BASE = 'https://api.sinay.ai/safecube/api/v1'

/** Dashboard / sign-up URL shown to users who need to obtain an API key. */
export const SINAY_DASHBOARD_URL = 'https://app.safecube.ai'

/** Requests per second limit (conservative; Sinay does not publish a hard cap). */
export const RATE_LIMIT_RPS = 5

/** Header name that carries the API key. */
export const API_KEY_HEADER = 'API_KEY'
