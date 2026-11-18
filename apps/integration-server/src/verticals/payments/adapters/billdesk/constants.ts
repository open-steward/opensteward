/**
 * BillDesk Payments (CX+ deep API) — India-anchored gateway.
 *
 * BillDesk exposes a small set of POST endpoints under a versioned
 * `/payments/ve1_2` path. There is no global "list" endpoint and no
 * standalone customer resource: an Order carries the money, a Transaction is
 * the captured payment attempt, and a Refund is taken against a transaction.
 * Every status lookup is a POST `.../get` with the id in the request body.
 *
 * The merchant picks an environment at Connect time; the choice rides in
 * `Credentials.extra.environment`.
 *
 * Docs: https://docs.billdesk.io/reference/authentications-and-endpoints
 */
export const HOSTS = {
  sandbox: 'https://uat1.billdesk.com/u2',
  production: 'https://api.billdesk.com',
} as const

export type BilldeskEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: BilldeskEnvironment = 'sandbox'

/**
 * Path prefix shared by every payment-suite endpoint. BillDesk pins request
 * behaviour into the `ve1_2` path segment (there is no dated version header).
 */
export const API_PATH_PREFIX = '/payments/ve1_2'

export const ORDERS_CREATE_PATH = `${API_PATH_PREFIX}/orders/create`
export const TRANSACTIONS_GET_PATH = `${API_PATH_PREFIX}/transactions/get`
export const REFUNDS_CREATE_PATH = `${API_PATH_PREFIX}/refunds/create`
export const REFUNDS_GET_PATH = `${API_PATH_PREFIX}/refunds/get`

/**
 * Mandate (subscription) + Invoice endpoints live under the separate `/pgsi/ve1_2`
 * path prefix at the same host. The BilldeskClient posts to this path directly.
 * Confirmed from: https://docs.billdesk.io/llms.txt and
 * https://docs.billdesk.io/reference/retrievemandate (shows full URL
 * https://uat1.billdesk.com/u2/pgsi/ve1_2/mandates/get).
 */
export const MANDATES_PATH_PREFIX = '/pgsi/ve1_2'

export const MANDATES_CREATE_PATH = `${MANDATES_PATH_PREFIX}/mandates/create`
export const MANDATES_GET_PATH = `${MANDATES_PATH_PREFIX}/mandates/get`
export const MANDATES_LIST_PATH = `${MANDATES_PATH_PREFIX}/mandates/list`

export const INVOICES_CREATE_PATH = `${MANDATES_PATH_PREFIX}/invoices/create`
export const INVOICES_GET_PATH = `${MANDATES_PATH_PREFIX}/invoices/get`

/**
 * BillDesk request/response bodies are JOSE tokens, exchanged with the
 * `application/jose` media type on both Content-Type and Accept.
 */
export const JOSE_CONTENT_TYPE = 'application/jose'

/** JWS signing algorithm BillDesk mandates (HMAC-SHA-256). */
export const JWS_ALG = 'HS256'

export const DEFAULT_PAGE_SIZE = 50
