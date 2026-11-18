/**
 * Dodo Payments REST API constants.
 *
 * Dodo Payments is a Merchant-of-Record billing platform. It exposes two
 * fully isolated environments, each with its own base URL and API keys:
 *
 *   - Test / sandbox: https://test.dodopayments.com
 *   - Live / production: https://live.dodopayments.com
 *
 * The key the merchant pastes into the Connect form decides the mode; the
 * adapter selects the matching base URL via `credentials.extra.mode`
 * (defaults to live).
 *
 * Docs: https://docs.dodopayments.com/api-reference/introduction
 */
export const LIVE_API_BASE_URL = 'https://live.dodopayments.com'
export const TEST_API_BASE_URL = 'https://test.dodopayments.com'

export function baseUrlForMode(mode: string | undefined): string {
  return mode === 'test' ? TEST_API_BASE_URL : LIVE_API_BASE_URL
}

/** Dodo list endpoints page with `page_size` (max 100) + zero-based `page_number`. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
