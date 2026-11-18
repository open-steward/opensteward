/**
 * Juspay Express Checkout — India-anchored payment orchestrator.
 *
 * The merchant picks an environment at Connect time; the choice rides in
 * `Credentials.extra.environment`. Both hosts serve the same REST surface
 * (`POST /orders`, `GET /orders/{order_id}`, `POST /orders/{order_id}/refunds`).
 *
 * Docs: https://juspay.io/in/docs/api-reference/docs/express-checkout/introduction
 */
export const HOSTS = {
  sandbox: 'https://sandbox.juspay.in',
  production: 'https://api.juspay.in',
} as const

export type JuspayEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: JuspayEnvironment = 'sandbox'

/** Orders are the charge analogue; refunds are order-scoped sub-resources. */
export const ORDERS_PATH = '/orders'

/** Per-request timeout. Juspay's order-status TP99 is ~350ms; the docs
 *  recommend a conservative 2s ceiling, but we leave headroom for retries. */
export const REQUEST_TIMEOUT_MS = 30_000
