/**
 * Xendit REST API constants.
 *
 * Xendit exposes a single host for both sandbox and production — the
 * environment is selected by the secret-key prefix, not by the URL:
 *   - `xnd_production_…` → live data
 *   - `xnd_development_…` → test data
 * so there is only one base URL.
 *
 * Auth is HTTP Basic with the secret key as the username and an empty
 * password (see `client.ts`).
 *
 * Docs: https://docs.xendit.co  ·  base: https://api.xendit.co
 */
export const API_BASE_URL = 'https://api.xendit.co'

/** Default page size for list endpoints that accept a `limit`. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * GET /transactions: "A limit on the number of transactions to be returned
 * for each request. Limit can range between 1 and 50."
 * https://archive.developers.xendit.co/api-reference/#list-transactions
 */
export const TRANSACTIONS_MAX_PAGE_SIZE = 50

/**
 * GET /v2/invoices: "Limit can range between 1 and 100."
 * https://archive.developers.xendit.co/api-reference/#list-all-invoices
 */
export const INVOICES_MAX_PAGE_SIZE = 100
