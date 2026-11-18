/**
 * CentralStationCRM API constants.
 *
 * The REST base URL is account-scoped:
 *   https://{account}.centralstationcrm.net/api
 *
 * Authentication uses the X-apikey header on every request.
 * Pagination uses ?perpage=N&page=N (max 250 per page).
 */

export const BASE_URL_TEMPLATE = 'https://{account}.centralstationcrm.net/api'
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250

/** Build the base URL from an account slug. */
export function buildBaseUrl(account: string): string {
  return BASE_URL_TEMPLATE.replace('{account}', encodeURIComponent(account))
}
