/**
 * Unified.to Shipping API constants.
 *
 * Base URL: https://api.unified.to
 * Auth: Bearer JWT (API key)
 * All shipping endpoints require a `connection_id` path parameter that
 * identifies which downstream provider (e.g. ShipStation, EasyPost) the
 * request is routed to. Callers must supply this via credentials.extra.connectionId.
 */

export const UNIFIED_TO_API_BASE = 'https://api.unified.to'

/** Shown to users who need to retrieve their API key. */
export const UNIFIED_TO_DASHBOARD_URL = 'https://app.unified.to'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
