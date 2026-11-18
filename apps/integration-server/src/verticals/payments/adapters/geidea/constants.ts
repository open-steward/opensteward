/**
 * Geidea Direct API constants.
 *
 * Geidea is a MENA payment gateway (Egypt, UAE, KSA). It exposes two regional
 * merchant hosts that share the same path scheme — the merchant picks the one
 * their account was provisioned on:
 *   - `api.merchant.geidea.net`    — Egypt / UAE (default).
 *   - `api.ksamerchant.geidea.net` — Kingdom of Saudi Arabia.
 *
 * There is no separate sandbox host: the API **credentials** (a test vs live
 * merchant public key + API password minted in the Geidea portal) select the
 * environment, so the only host knob is the region.
 *
 * Auth is HTTP Basic — merchant public key as the username, API password as
 * the password (see auth.ts + client.ts).
 *
 * Docs: https://docs.geidea.net/docs/pg-direct-api
 */

/** Default regional host — Egypt / UAE merchants. */
export const API_BASE_URL = 'https://api.merchant.geidea.net'

/** KSA regional host — selected when the merchant supplies region = "ksa". */
export const KSA_API_BASE_URL = 'https://api.ksamerchant.geidea.net'

/** Resolve the regional base URL from the customer-supplied `region` field. */
export function baseUrlForRegion(region: string | null | undefined): string {
  return (region ?? '').trim().toLowerCase() === 'ksa' ? KSA_API_BASE_URL : API_BASE_URL
}

// ── Endpoint paths ──────────────────────────────────────────────────────────
/** Pay (authorize + capture in one step) — POST. */
export const PAY_PATH = '/pgw/api/v2/direct/pay'
/** Refund (full or partial) — POST. */
export const REFUND_PATH = '/pgw/api/v2/direct/refund'
/** Order search / retrieval — GET. Query by orderId or MerchantReferenceId,
 *  or list with Skip/Take + date filters. */
export const ORDER_PATH = '/pgw/api/v1/direct/order'

/** Geidea's order search paginates with Skip/Take; default page size. */
export const DEFAULT_PAGE_SIZE = 50

/** eInvoice (Pay-by-Link) list / create / get — GET / POST. */
export const EINVOICE_PATH = '/payment-intent/api/v1/direct/eInvoice'

/** Subscriptions — GET/{id} and POST/{id}/cancel. */
export const SUBSCRIPTION_PATH = '/subscriptions/api/v1/direct/subscription'
