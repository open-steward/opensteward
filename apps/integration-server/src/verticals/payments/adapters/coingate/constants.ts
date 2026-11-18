/**
 * CoinGate is a crypto payment gateway. Live and sandbox are *entirely
 * separate* environments with distinct accounts and API tokens (a token
 * minted at coingate.com only works against production; a sandbox token is
 * minted at sandbox.coingate.com). The token itself does not encode which
 * host to hit, so the merchant supplies the environment alongside the token
 * on the Connect Link form (see auth.ts); we resolve the base URL from it.
 *
 * The API is path-versioned at `/v2`.
 *
 * Docs: https://developer.coingate.com/reference/environments
 *       https://developer.coingate.com/docs/api-authentication
 */

/** Production base URL (mainnet). */
export const LIVE_BASE_URL = 'https://api.coingate.com/v2'

/** Sandbox base URL (testnet) — requires a sandbox.coingate.com token. */
export const SANDBOX_BASE_URL = 'https://api-sandbox.coingate.com/v2'

/** Resolve the base URL for a stored environment flag. Defaults to live. */
export function baseUrlForEnvironment(environment: string | undefined): string {
  return environment === 'sandbox' ? SANDBOX_BASE_URL : LIVE_BASE_URL
}

/** CoinGate `per_page` accepts 1–100; the API default is 100. */
export const DEFAULT_PAGE_SIZE = 100

// ── Endpoint paths ──────────────────────────────────────────────────────────
/** Orders carry amount/currency/status — they map onto the canonical Charge. */
export const ORDERS_PATH = '/orders'
/** Account-wide refund list. */
export const REFUNDS_PATH = '/refunds'
/** Refunds are created against an order: POST /orders/{id}/refunds */
export const orderRefundsPath = (orderId: string): string => `/orders/${orderId}/refunds`
/** Send requests (outbound crypto payouts). Maps onto the canonical Payout. */
export const SENDS_PATH = '/sends'
