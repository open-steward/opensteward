/**
 * Moov API constants.
 *
 * Host: every request example on https://docs.moov.io/api/money-movement/transfers/list/
 * is `curl -X GET "https://api.moov.io/accounts/{accountID}/transfers"`.
 */

export const API_BASE_URL = 'https://api.moov.io'

/**
 * https://docs.moov.io/api/money-movement/transfers/list/: "X-Moov-Version
 * string Set this header to v2026.07.00 to use the API described in this
 * specification. When omitted, the server defaults to v2024.01.00, the earliest
 * supported version, which may not match the behavior documented here."
 * The transforms read the v2026.07.00 Transfer shape, so the version is pinned.
 */
export const API_VERSION = 'v2026.07.00'

/**
 * Upstream page size of GET /accounts/{accountID}/transfers: "count integer
 * <int64> Page size. When omitted, the server defaults to `200`." (the page
 * renders the inline code as "200 .") and "When you
 * run this request, you retrieve 200 transfers at a time." No maximum is
 * documented, so the documented default is sent explicitly.
 */
export const TRANSFERS_PAGE_SIZE = 200

/**
 * Upstream pages one caller page may scan. Charges and payouts are a subset of
 * the transfer list that Moov cannot filter for, so a sparse rail walks many
 * pages; the docs warn "If you are searching a high volume of transfers, the
 * request will likely process very slowly." 50 pages is 10,000 transfers.
 */
export const MAX_UPSTREAM_PAGES = 50

/** Caller page size when params carry no limit. */
export const DEFAULT_PAGE_SIZE = 100

export function transfersPath(accountID: string): string {
  return `/accounts/${encodeURIComponent(accountID)}/transfers`
}

export function transferPath(accountID: string, transferID: string): string {
  return `${transfersPath(accountID)}/${encodeURIComponent(transferID)}`
}
