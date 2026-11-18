/**
 * PlentyONE (plentymarkets) REST API constants.
 *
 * Base URL: https://p{plentyId}.my.plentysystems.com/rest
 * The plentyId (numeric system identifier) must be supplied per-connection
 * via credentials.extra.plentyId.
 *
 * Auth: POST /rest/login returns a Bearer token with expires_in (seconds,
 * typically 86400). A refresh_token is also returned and used to obtain
 * a new access token without re-authenticating with username/password.
 *
 * Pagination: `page` (1-based) and `itemsPerPage` query params. The response
 * envelope has the shape:
 *   { page, totalsCount, isLastPage, lastPageNumber, entries: [...] }
 *
 * Order search uses POST /rest/orders/search with filter/sort in the body.
 */

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250

/** Path suffix appended to the per-system base URL. */
export const API_BASE_PATH = '/rest'

/**
 * PlentyONE order typeId values.
 * 1 = Sales order (standard customer-facing order).
 */
export const ORDER_TYPE_SALES = 1

/**
 * PlentyONE addressRelation typeId values embedded inside an order response.
 * 1 = billing/invoice address, 2 = delivery/shipping address.
 */
export const ADDRESS_TYPE_BILLING = 1
export const ADDRESS_TYPE_DELIVERY = 2

/**
 * PlentyONE order item typeId values.
 * 1 = Variation (product line item), 6 = Shipping costs line.
 */
export const ORDER_ITEM_TYPE_VARIATION = 1
export const ORDER_ITEM_TYPE_SHIPPING = 6
