/**
 * EBANX Direct API — REST base URLs and endpoint paths.
 *
 * EBANX exposes a single-host JSON API under `/ws/*`. Every call is a POST
 * that carries the merchant `integration_key` in the request body — there
 * is no Authorization header.
 *
 * Sandbox keys are issued at signup; live keys after onboarding. The two
 * environments live on different hosts; the active host is carried on the
 * credential payload (see auth.ts) so one adapter instance serves both.
 */
export const SANDBOX_BASE_URL = 'https://sandbox.ebanxpay.com'
export const PRODUCTION_BASE_URL = 'https://api.ebanxpay.com'

/** Endpoint paths under the chosen host. All are POST + JSON body. */
export const ENDPOINTS = {
  /** Create a direct charge. */
  direct: '/ws/direct',
  /** Retrieve a payment by hash or merchant_payment_code. */
  query: '/ws/query',
  /** Request (or cancel) a refund. */
  refund: '/ws/refund',
  /** Capture a pre-authorised card payment. */
  capture: '/ws/capture',
  /** Cancel an open/pending payment. */
  cancel: '/ws/cancel',
  /** Retrieve a single payout by uid or external_reference. */
  payoutRetrieve: '/ws/payout/retrieve',
  /** Search payouts by date range (returns array). */
  payoutSearch: '/ws/payout/search',
} as const

/**
 * /ws/payout/search page ceiling: "You can also control how many Payouts you
 * want per page (up to 50 records)" —
 * https://docs.ebanx.com/docs/payout/general/consult-payout
 */
export const PAYOUT_SEARCH_MAX_PAGE_SIZE = 50

/**
 * EBANX signs notifications with RSA-SHA1 and exposes the matching public
 * certificate for download, keyed by the `X-Signature-Fingerprint` header.
 * This is the long-standing default fingerprint; the verifier still honours
 * whatever fingerprint a delivery presents.
 */
export const NOTIFICATION_FINGERPRINT = '4ABAD89CF66B99998465470550EB15E3E271A246'
export const notificationPublicKeyUrl = (fingerprint: string): string =>
  `https://downloads.ebanx.com/rsa/${fingerprint}/ebanx-notifications-public.pem`
