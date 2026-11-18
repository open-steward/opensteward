/**
 * Tabby is MENA's largest buy-now-pay-later gateway (KSA, UAE, Kuwait).
 *
 * One REST API (`/api/v2`) is served from two region-pinned production hosts —
 * Tabby routes a merchant to whichever matches the country their account was
 * onboarded in. Both hosts speak the identical API; the merchant picks the
 * region on the Connect form and we persist it on `credentials.extra.region`.
 *
 * There is no separate sandbox host: Tabby decides test vs. live from the
 * secret key itself, and surfaces it back on every payment as `is_test`.
 *
 * Docs:
 *   https://docs.tabby.ai/api-reference/overview
 *   https://docs.tabby.ai/api-reference/payments/list-of-all-payments
 */

/** UAE / Kuwait host. */
export const BASE_URL_AE = 'https://api.tabby.ai'
/** Kingdom of Saudi Arabia host. */
export const BASE_URL_SA = 'https://api.tabby.sa'

export type TabbyRegion = 'ae' | 'sa'

/** Resolve the region-pinned API host. Defaults to the `.ai` (AE/KW) host. */
export function baseUrlFor(region: string | undefined): string {
  return region === 'sa' ? BASE_URL_SA : BASE_URL_AE
}

/**
 * Tabby caps `GET /api/v2/payments` at 20 results per page and paginates with
 * `limit` + `offset`.
 */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 20

// ── Endpoint paths (relative to the region host) ─────────────────────────────
export const PAYMENTS_PATH = '/api/v2/payments'
export const paymentPath = (id: string): string => `/api/v2/payments/${id}`
export const paymentCapturesPath = (id: string): string => `/api/v2/payments/${id}/captures`
export const paymentRefundsPath = (id: string): string => `/api/v2/payments/${id}/refunds`
export const DISPUTES_PATH = '/api/v1/disputes'
