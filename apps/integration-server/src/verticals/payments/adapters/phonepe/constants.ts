/**
 * PhonePe Payment Gateway — Standard Checkout V2 (India anchor).
 *
 * PhonePe splits each environment across two host roles: an OAuth host for
 * the client-credentials token grant and a Payment-Gateway host for the
 * pay / order-status / refund APIs. Sandbox folds both under one
 * `api-preprod` host with a `/pg-sandbox` path prefix; production uses the
 * real `api.phonepe.com` host with a `/pg` prefix for the PG APIs and a
 * separate `/identity-manager` prefix for the token grant.
 *
 * The merchant picks the environment at Connect time; the choice rides in
 * `Credentials.extra.environment`.
 *
 * Docs: https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration
 */

export interface PhonepeHost {
  /** Base host + path-prefix for the OAuth token grant. */
  readonly oauth: string
  /** Base host + path-prefix for the Payment Gateway (pay / status / refund). */
  readonly pg: string
}

export const HOSTS = {
  sandbox: {
    oauth: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    pg: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  },
  production: {
    oauth: 'https://api.phonepe.com/apis/identity-manager',
    pg: 'https://api.phonepe.com/apis/pg',
  },
} as const satisfies Record<string, PhonepeHost>

export type PhonepeEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: PhonepeEnvironment = 'sandbox'

/** OAuth token grant path (appended to the chosen `oauth` host). */
export const OAUTH_TOKEN_PATH = '/v1/oauth/token'

/** Payment Gateway resource paths (appended to the chosen `pg` host). */
export const CREATE_PAYMENT_PATH = '/checkout/v2/pay'
export const ORDER_STATUS_PATH = '/checkout/v2/order'
export const REFUND_PATH = '/payments/v2/refund'

/**
 * The token grant returns `token_type: "O-Bearer"`; that exact prefix must
 * be used in the `Authorization` header for every PG call.
 */
export const AUTH_TOKEN_TYPE = 'O-Bearer'

/** PhonePe settles in INR; amounts are quoted in paise (minor units). */
export const DEFAULT_CURRENCY = 'INR'

/** Standard Checkout requires this payment-flow type for hosted checkout. */
export const PG_CHECKOUT_FLOW = 'PG_CHECKOUT'
