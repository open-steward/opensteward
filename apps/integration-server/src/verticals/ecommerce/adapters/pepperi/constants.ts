/**
 * Pepperi REST API constants.
 *
 * Docs:
 *  - https://developer.pepperi.com/first-steps/authentication/ (confirms
 *    `BaseURI` "is typically api.pepperi.com but it could be different for
 *    customers residing on specific Pepperi cloud server")
 *  - https://developer.pepperi.com/first-steps/retrieving-data/ (pagination
 *    parameters and the `X-Pepperi-Total-Records` / `X-Pepperi-Total-Pages`
 *    count headers)
 */

/** Default production API base — overridden per-account by the `BaseURI`
 *  returned from `GET /company/apitoken` when present (see auth.ts). */
export const DEFAULT_BASE_URL = 'https://api.pepperi.com/v1.0'

/** `page_size` default per developer.pepperi.com/api-reference/item-resources/get-items/. */
export const DEFAULT_PAGE_SIZE = 100

/** `page_size` max — "100 by default, 250 max" (same reference). */
export const MAX_PAGE_SIZE = 250
