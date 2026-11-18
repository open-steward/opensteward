/**
 * Nuvei REST 1.0 server-to-server API constants.
 *
 * Nuvei (formerly SafeCharge) exposes a JSON-over-HTTPS API rooted at
 * `/ppp/api/v1/`. Each endpoint is a `.do`-suffixed action; requests are
 * authenticated per-call with a SHA-256 `checksum` rather than a bearer
 * token (see auth.ts). The environment (test vs production) is chosen by
 * the merchant when they submit credentials and stored on `credentials.extra`.
 *
 * Docs:
 *  - https://docs.nuvei.com/documentation/accept-payment/server-to-server/rest-1-0/
 *  - https://docs.nuvei.com/documentation/features/authentication/
 */

/** Integration / sandbox host + path prefix. */
export const SANDBOX_BASE_URL = 'https://ppp-test.safecharge.com/ppp/api/v1'
/** Production host + path prefix. */
export const PRODUCTION_BASE_URL = 'https://secure.safecharge.com/ppp/api/v1'

/** Resolve the base URL for the merchant's selected environment. */
export function baseUrlFor(environment: string | undefined): string {
  return environment === 'production' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
}

// ── Endpoints (relative to the base URL) ────────────────────────────────────
export const ENDPOINT_GET_SESSION_TOKEN = '/getSessionToken.do'
export const ENDPOINT_PAYMENT = '/payment.do'
export const ENDPOINT_REFUND_TRANSACTION = '/refundTransaction.do'
export const ENDPOINT_VOID_TRANSACTION = '/voidTransaction.do'
export const ENDPOINT_SETTLE_TRANSACTION = '/settleTransaction.do'
export const ENDPOINT_GET_PAYMENT_STATUS = '/getPaymentStatus.do'

// ── Customer / user endpoints ────────────────────────────────────────────────
export const ENDPOINT_CREATE_USER = '/createUser.do'
export const ENDPOINT_GET_USER_DETAILS = '/getUserDetails.do'

// ── UPO / payment-method endpoints ──────────────────────────────────────────
export const ENDPOINT_GET_USER_UPOS = '/getUserUPOs.do'

// ── Subscription / rebilling endpoints ──────────────────────────────────────
export const ENDPOINT_GET_SUBSCRIPTIONS_LIST = '/getSubscriptionsList.do'
export const ENDPOINT_CANCEL_SUBSCRIPTION = '/cancelSubscription.do'

// ── Plan / rebilling-plan endpoints ─────────────────────────────────────────
// "/getPlansList Definition https://ppp-test.nuvei.com/ppp/api/v1/getPlansList.do"
// — https://docs.nuvei.com/api/advanced/indexAdvanced.html#getplanslist
export const ENDPOINT_GET_PLANS_LIST = '/getPlansList.do'
/** getPlansList.do documents timeStamp "according to the GMT+2 time zone". */
export const REBILLING_TIMESTAMP_OFFSET_HOURS = 2

// ── Payout endpoints ─────────────────────────────────────────────────────────
export const ENDPOINT_PAYOUT = '/payout.do'
export const ENDPOINT_GET_PAYOUT_STATUS = '/getPayoutStatus.do'

/**
 * Page size sent when a caller names no limit, and the page size getPlan
 * walks getPlansList.do with. getPlansList documents no maximum
 * (https://docs.nuvei.com/api/advanced/indexAdvanced.html#getplanslist); the
 * walk advances by rows returned and ends on the documented `total`, so a
 * smaller upstream ceiling costs calls, not rows.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * getSubscriptionsList.do page ceiling: "When getSubscriptionsList is called,
 * a maximum of 1000 results per call can be displayed at one time." —
 * https://docs.nuvei.com/api/advanced/indexAdvanced.html#getsubscriptionslist
 * Per-method, not adapter-wide: getUserUPOs has no paging and getPlansList
 * documents no ceiling.
 */
export const SUBSCRIPTIONS_LIST_MAX_PAGE_SIZE = 1000
