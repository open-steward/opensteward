/**
 * Walmart Marketplace API constants.
 *
 * Walmart uses OAuth2 client-credentials flow (no user consent redirect).
 * All API calls go through a single base URL with versioned paths.
 *
 * Token endpoint:
 *   POST https://marketplace.walmartapis.com/v3/token
 *
 * Base URL:
 *   https://marketplace.walmartapis.com/v3
 */

/** Walmart Marketplace API base URL. */
export const BASE_URL = 'https://marketplace.walmartapis.com'

/** API version prefix for all resource endpoints. */
export const API_PREFIX = '/v3'

/** OAuth2 token endpoint (client-credentials grant). */
export const TOKEN_URL = `${BASE_URL}${API_PREFIX}/token`

/** Access tokens expire after ~15 minutes; refresh 2 minutes early. */
export const TOKEN_BUFFER_MS = 2 * 60 * 1000

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size for most Walmart endpoints. */
export const MAX_PAGE_SIZE = 200

/** Walmart API paths (relative to BASE_URL). */
export const ITEMS_BASE = `${API_PREFIX}/items`
export const ORDERS_BASE = `${API_PREFIX}/orders`
export const INVENTORY_BASE = `${API_PREFIX}/inventory`
export const FULFILLMENTS_BASE = `${API_PREFIX}/fulfillments`
export const RETURNS_BASE = `${API_PREFIX}/returns`

/** Required Walmart API request headers. */
export const WM_SVC_NAME = 'Walmart Marketplace'
export const WM_QOS_CORRELATION_ID_HEADER = 'WM_QOS.CORRELATION_ID'
export const WM_SVC_NAME_HEADER = 'WM_SVC.NAME'
export const WM_SEC_ACCESS_TOKEN_HEADER = 'WM_SEC.ACCESS_TOKEN'
