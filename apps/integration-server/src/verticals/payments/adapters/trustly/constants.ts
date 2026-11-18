/**
 * Trustly API constants.
 *
 * Trustly exposes a single JSON-RPC 2.0 endpoint at `POST /api/1`. There is no
 * resource-style REST surface — every call (Deposit, Refund, AccountLedger, …)
 * is a JSON-RPC `method` POSTed to the same URL.
 *
 * Two environments share the same path and differ only by host:
 *   - test:        https://test.trustly.com/api/1
 *   - production:  https://api.trustly.com/api/1
 *
 * Docs: https://docs.trustly.com/api/api-url
 */
export const API_TEST_BASE_URL = 'https://test.trustly.com/api/1'
export const API_PROD_BASE_URL = 'https://api.trustly.com/api/1'

/**
 * AccountLedger — the only "list" surface in the classic API — is bounded by a
 * date range rather than a page size. This is the look-back window (in days)
 * applied when the caller does not supply an explicit `updatedAfter`.
 */
export const DEFAULT_LEDGER_LOOKBACK_DAYS = 30
