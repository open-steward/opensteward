/**
 * Faspay Business / Online-Debit REST API constants.
 *
 * Faspay (Indonesia) exposes a JSON REST surface under `/cvr/<merchant_id>/10`,
 * where `<merchant_id>` is the merchant's own numeric code. Every operation
 * (post data, channel inquiry, cancel, inquiry) hits the same parameterised
 * path — the server routes by inspecting the `request` field in the body. The
 * merchant's regional environment is selected by host:
 *   - sandbox    → debit-sandbox.faspay.co.id
 *   - production → debit.faspay.co.id  (real merchant credentials only)
 *
 * Money is Indonesian Rupiah (IDR), expressed in whole-rupiah integers — IDR
 * has no minor unit in practice — so amounts cross the wire as integer strings
 * and map 1:1 onto the canonical `amount` (minor units).
 *
 * Docs: https://docs.faspay.co.id/merchant-integration/api-reference-1/debit-transaction
 */

export const SANDBOX_BASE_URL = 'https://debit-sandbox.faspay.co.id'
export const PRODUCTION_BASE_URL = 'https://debit.faspay.co.id'

/** Map a stored environment code onto the JSON REST host. */
export const ENVIRONMENT_BASE_URLS: Record<string, string> = {
  sandbox: SANDBOX_BASE_URL,
  production: PRODUCTION_BASE_URL,
}

export function baseUrlForEnvironment(environment: string | undefined): string {
  return ENVIRONMENT_BASE_URLS[environment ?? 'sandbox'] ?? SANDBOX_BASE_URL
}

/**
 * Build the Faspay JSON REST path for a given merchant. Every operation uses
 * the same URL structure — `/cvr/<merchant_id>/10` — with the service type
 * determined by the `request` field in the POST body.
 */
export function merchantPath(merchantIdValue: string): string {
  return `/cvr/${merchantIdValue}/10`
}

/** Faspay settles exclusively in Indonesian Rupiah. */
export const DEFAULT_CURRENCY = 'IDR'
