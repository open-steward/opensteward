/**
 * Spreedly Core API v1 constants.
 *
 * Single REST host for both sandbox and production — the environment is
 * selected by the credentials, not the URL. Sandbox vs live is determined by
 * the environment key (test environments) and surfaced per-record via the
 * `test` / `on_test_gateway` flags rather than a separate base URL.
 *
 * Docs: https://docs.spreedly.com/reference/api/v1/
 */
export const API_BASE_URL = 'https://core.spreedly.com/v1'

export const PAYMENT_METHODS_PATH = '/payment_methods.json'
export const TRANSACTIONS_PATH = '/transactions.json'

export function paymentMethodPath(token: string): string {
  return `/payment_methods/${token}.json`
}

export function transactionPath(token: string): string {
  return `/transactions/${token}.json`
}

/** Default page size for unbounded list endpoints. Spreedly caps `count` at 100. */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
