/**
 * Swell Backend API constants.
 *
 * Host — https://developers.swell.is/backend-api/introduction:
 *   "Base URL https://api.swell.store"
 * Auth — https://developers.swell.is/backend-api/authentication:
 *   "When calling the API directly over HTTP, authenticate with basic auth
 *   using your store ID as the username and a secret key as the password:
 *   curl https://api.swell.store/products -u your-store-id:your-secret-key"
 *
 * `https://{storeId}.swell.store/api`, which this adapter used before, is the
 * Frontend (storefront) API, which only accepts a public key.
 *
 * Paging — https://developers.swell.is/backend-api/querying:
 *   limit "A number indicating the max number of results to return up to 1000."
 *   page  "A number indicating which page of results to return."
 */

export const API_BASE_URL = 'https://api.swell.store'

/** Used only when a caller names no limit (the router always sends one). */
export const DEFAULT_PAGE_SIZE = 25

/** "Limit the number of records returned, ranging between 1 and 1000." */
export const MAX_PAGE_SIZE = 1000
