/**
 * HyperPay (powered by the OPPWA / ACI "Open Payment Platform") REST API
 * constants.
 *
 * HyperPay exposes a single synchronous payments API. Money flows around one
 * **payment** object that is created (DB = debit, PA = preauthorization) and
 * then acted on by reference (CP = capture, RF = refund, RV = reversal). There
 * is no customer / subscription / invoice / payout object and no list endpoint
 * — back-office reads are by-id only.
 *
 * Test and live share the same path structure (`/v1/payments…`); only the host
 * differs. The Bearer access token submitted at connect time pins one host
 * (a test token only works against the test host), so the adapter defaults to
 * the live host and lets the client override the base URL when needed.
 *
 * Docs: https://hyperpay.docs.oppwa.com/reference/parameters
 */

/** Live (production) host. */
export const API_BASE_URL = 'https://eu-prod.oppwa.com'
/** Sandbox (test/integration) host. */
export const TEST_API_BASE_URL = 'https://eu-test.oppwa.com'

/** Version segment prefixing every resource path. */
export const API_VERSION = 'v1'

/** Payments resource path: POST create, POST /{id} back-office, GET /{id} query. */
export const PAYMENTS_PATH = '/v1/payments'

/**
 * paymentType codes used on the wire (A2). DB/PA create money movement; CP/RF/RV
 * act on an existing payment by reference.
 */
export const PAYMENT_TYPE = {
  /** Debit — debits the shopper and credits the merchant. */
  DEBIT: 'DB',
  /** Preauthorization — reserves funds; later captured with CP. */
  PREAUTH: 'PA',
  /** Capture — captures a previously preauthorized (PA) amount. */
  CAPTURE: 'CP',
  /** Refund — credits the shopper with reference to a prior DB/CD. */
  REFUND: 'RF',
  /** Reversal — reverses an already processed PA/DB/CD. */
  REVERSAL: 'RV',
  /** Credit — credits the shopper and debits the merchant. */
  CREDIT: 'CD',
} as const
