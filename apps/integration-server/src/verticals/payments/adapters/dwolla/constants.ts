/**
 * Dwolla API constants.
 *
 * Docs: https://developers.dwolla.com/docs/api-reference/api-fundamentals/making-requests-and-authentication
 *
 * "| Production  | `https://api.dwolla.com`         |" — the sandbox host
 * (`https://api-sandbox.dwolla.com`) is not selectable: the adapter has no
 * environment key.
 */

export const API_BASE_URL = 'https://api.dwolla.com'

/**
 * "To obtain an access token, send a `POST` to `/token` with an HTTP Basic
 * `Authorization` header containing your Base64-encoded client credentials."
 */
export const TOKEN_URL = `${API_BASE_URL}/token`

/**
 * "To interact with the Dwolla API, all requests must include the `Accept`
 * header: `Accept: application/vnd.dwolla.v1.hal+json`"
 */
export const HAL_MEDIA_TYPE = 'application/vnd.dwolla.v1.hal+json'

/**
 * GET /customers: "Default limit is 25 customers per page, maximum 200."
 * https://developers.dwolla.com/docs/api-reference/customers/list-and-search-customers
 */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 200

export const CUSTOMERS_PATH = '/customers'
export function customerPath(id: string): string {
  return `${CUSTOMERS_PATH}/${encodeURIComponent(id)}`
}
