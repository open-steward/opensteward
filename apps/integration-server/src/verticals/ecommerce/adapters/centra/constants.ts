/**
 * Centra Order API constants.
 *
 * Centra's Order API is exposed at a store-specific base URL configured in
 * the Centra backend (System → Plugins → Order API). The URL is supplied by
 * the merchant and stored in `credentials.extra.baseUrl`.
 *
 * Docs: https://centra.dev/docs/apis/order-api/api-reference
 */

/** Default number of items to request per page (Centra default is 20). */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum items Centra will return in a single list call. */
export const MAX_PAGE_SIZE = 100

/**
 * Header used to authenticate every Centra Order API request.
 * The value is the API key copied from the Order API plugin in the Centra
 * backend (System → Plugins → Order API → API Key).
 *
 * Centra docs: "Fill out Headers: API-Authorization — copy API Key from
 * Order API plugin."
 */
export const AUTH_HEADER = 'API-Authorization'
