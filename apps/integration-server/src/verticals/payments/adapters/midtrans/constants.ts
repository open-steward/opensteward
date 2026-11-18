/**
 * Midtrans is a dual-host API: separate sandbox and production hosts. The
 * Server **Key** (an `SB-Mid-server-…` sandbox key or a `Mid-server-…` live
 * key) is bound to one environment, but unlike single-host gateways the host
 * itself differs, so the adapter must know which base URL to hit.
 *
 * The Authorization header carries no environment hint we can branch on at
 * request time, so the environment is supplied as a credential field
 * (defaulting to sandbox) and resolved to a base URL via `resolveBaseUrl`.
 *
 * Docs: https://docs.midtrans.com/reference/api-host-url
 */
export const SANDBOX_BASE_URL = 'https://api.sandbox.midtrans.com'
export const PRODUCTION_BASE_URL = 'https://api.midtrans.com'

export type MidtransEnvironment = 'sandbox' | 'production'

export function resolveBaseUrl(environment: string | undefined): string {
  return (environment ?? '').toLowerCase() === 'production'
    ? PRODUCTION_BASE_URL
    : SANDBOX_BASE_URL
}

// ── Endpoint paths (Core API, version-prefixed `/v2`) ───────────────────────
// Every Core API status/action endpoint is keyed on the merchant `order_id`
// (or the Midtrans `transaction_id`); both resolve through the same path slot.
export const statusPath = (id: string): string => `/v2/${encodeURIComponent(id)}/status`
export const refundPath = (id: string): string => `/v2/${encodeURIComponent(id)}/refund`
export const cancelPath = (id: string): string => `/v2/${encodeURIComponent(id)}/cancel`
/** Pre-authorized card transactions are captured via a flat (non-id) path. */
export const CAPTURE_PATH = '/v2/capture'
