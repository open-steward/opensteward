/**
 * eWAY Rapid API constants.
 *
 * eWAY (an Australia / New Zealand / Asia-Pacific card gateway) exposes the
 * Rapid REST API over two hosts — there is a dedicated sandbox host rather
 * than a sandbox flag, and which one a connection talks to is decided by the
 * API key + password the merchant generated in that environment. The customer
 * picks the environment on the Connect Link form; we store it on
 * `credentials.extra.environment` and resolve the base URL from it here.
 *
 * Docs: https://eway.io/api-v3/
 */
export const SANDBOX_BASE_URL = 'https://api.sandbox.ewaypayments.com'
export const PRODUCTION_BASE_URL = 'https://api.ewaypayments.com'

/**
 * Rapid pins behaviour with the `X-EWAY-APIVERSION` header. We pin a known
 * good version so the adapter's transforms stay deterministic — bump this
 * when the adapter is re-tested against a newer one.
 */
export const API_VERSION = '47'

/**
 * eWAY settles primarily in AUD; the Payment object always echoes a
 * `CurrencyCode`, but we default to AUD when one is somehow absent.
 */
export const DEFAULT_CURRENCY = 'AUD'

/** Resolve the Rapid base URL for a stored environment ('sandbox' | 'production'). */
export function baseUrlFor(environment: string | undefined): string {
  return environment === 'production' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
}
