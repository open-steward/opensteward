/**
 * Vipps MobilePay ePayment API constants.
 *
 * The REST API is hosted on two environments that share an identical path
 * structure; only the host differs. The merchant credentials (client id /
 * secret / subscription key / merchant serial number) are environment-scoped:
 * a test credential set only works against the test host and a live set only
 * against production. The connect-time form lets the merchant pick the
 * environment, and the selection is round-tripped on `credentials.extra` so
 * the client targets the correct host.
 *
 * Docs: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/
 */

/** Production host — live merchants. */
export const PROD_API_BASE_URL = 'https://api.vipps.no'
/** Test (MT) host — used with test credentials. */
export const TEST_API_BASE_URL = 'https://apitest.vipps.no'

/** Default host when the environment is unspecified. */
export const API_BASE_URL = PROD_API_BASE_URL

/** Access Token API — exchanges API keys for a short-lived Bearer token. */
export const ACCESS_TOKEN_PATH = '/accesstoken/get'

/** ePayment API version segment prefixing every payment resource path. */
export const EPAYMENT_BASE_PATH = '/epayment/v1'

/** Recurring API version segment for agreement/subscription resources. */
export const RECURRING_BASE_PATH = '/recurring/v3'

/**
 * The ePayment API has no offset/cursor list endpoints — payments are read
 * one reference at a time (`GET /epayment/v1/payments/{reference}`). We still
 * keep a page-size constant for forward-compatible request shaping.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Identifies this integration to Vipps MobilePay via the `Vipps-System-*`
 * headers they request on every call for support + analytics.
 */
export const SYSTEM_NAME = 'opensteward'
export const SYSTEM_VERSION = '0.1.0'

/** Default settlement currency. Vipps is Nordic-first; NOK is the anchor. */
export const DEFAULT_CURRENCY = 'NOK'
