/**
 * iyzico REST API constants.
 *
 * iyzico exposes one RPC-style host per environment; every call is a POST and
 * the response is a flat JSON object with a top-level `status` of
 * `success` | `failure`. Sandbox and production live on different hosts — the
 * active one rides on the connection's stored environment.
 *
 * Docs: https://docs.iyzico.com/en/getting-started/preliminaries/authentication
 */
export const PRODUCTION_BASE_URL = 'https://api.iyzipay.com'
export const SANDBOX_BASE_URL = 'https://sandbox-api.iyzipay.com'

/**
 * Endpoint paths. The path is significant beyond routing: it is part of the
 * HMACSHA256 signed string (randomKey + uriPath + requestBody), so these must
 * be the exact paths sent on the wire.
 */
export const ENDPOINTS = {
  /** POST — retrieve a completed payment by paymentId / paymentConversationId. */
  paymentDetail: '/payment/detail',
  /** POST — refund a single basket item (payment breakdown) by paymentTransactionId. */
  refund: '/payment/refund',
  /** POST — cancel (full void) an as-yet-unsettled payment by paymentId. */
  cancel: '/payment/cancel',

  // ── Subscription v2 API ─────────────────────────────────────────────────
  // Docs: https://docs.iyzico.com/en/products/subscription/subscription-implementation

  /** GET — list or search subscriptions (accepts query params: status, page, count). */
  subscriptionList: '/v2/subscription/subscriptions',
  /** GET — retrieve a single subscription by its referenceCode. */
  subscriptionDetail: (id: string) => `/v2/subscription/subscriptions/${id}`,
  /** GET — list subscribers (query params: page, count). */
  customerList: '/v2/subscription/customers',
  /** GET — retrieve a single subscriber by referenceCode. */
  customerDetail: (id: string) => `/v2/subscription/customers/${id}`,
  /** GET — retrieve a pricing plan by referenceCode. */
  planDetail: (id: string) => `/v2/subscription/pricing-plans/${id}`,
  /** GET — list pricing plans under a product (query params: page, count). */
  planList: (productId: string) => `/v2/subscription/products/${productId}/pricing-plans`,
} as const

/** Authorization scheme prefix for the v2 HMACSHA256 signature header. */
export const AUTH_SCHEME = 'IYZWSv2'

/** Default request/response locale. */
export const DEFAULT_LOCALE = 'en'
