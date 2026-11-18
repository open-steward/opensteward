/**
 * Recharge Payments REST API constants.
 *
 * Base URL: https://api.rechargeapps.com
 * Auth: X-Recharge-Access-Token header (store API token)
 * Version header: X-Recharge-Version (default: 2021-11)
 *
 * Pagination: cursor-based. Responses include `next_cursor` / `previous_cursor`.
 * Pass `cursor=<next_cursor>` as a query param to get the next page.
 * Default limit 50; max 250.
 *
 * Docs: https://developer.rechargepayments.com/2021-11
 */

export const BASE_URL = 'https://api.rechargeapps.com'

export const API_VERSION_HEADER = '2021-11'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250
