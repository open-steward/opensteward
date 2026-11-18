/**
 * Amazon Payment Services (APS, formerly PayFort) REST API constants.
 *
 * APS is a server-to-server, command-based API: a single endpoint
 * (`/FortAPI/paymentApi`) accepts a JSON POST whose `command`,
 * `service_command`, or `query_command` selects the operation (PURCHASE,
 * AUTHORIZATION, CAPTURE, VOID_AUTHORIZATION, REFUND, CHECK_STATUS). There is
 * no cursor/offset list pagination and no GET collection endpoints.
 *
 * Docs: https://paymentservices.amazon.com/docs/api
 */
export const HOSTS = {
  sandbox: 'https://sbpaymentservices.payfort.com',
  production: 'https://paymentservices.payfort.com',
} as const

export type ApsEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: ApsEnvironment = 'sandbox'

/** The single server-to-server payment endpoint (relative to the host). */
export const PAYMENT_API_PATH = '/FortAPI/paymentApi'

/** APS commands (the `command` field on a request body). */
export const COMMANDS = {
  PURCHASE: 'PURCHASE',
  AUTHORIZATION: 'AUTHORIZATION',
  CAPTURE: 'CAPTURE',
  VOID_AUTHORIZATION: 'VOID_AUTHORIZATION',
  REFUND: 'REFUND',
} as const

/** APS query commands (the `query_command` field). */
export const QUERY_COMMANDS = {
  CHECK_STATUS: 'CHECK_STATUS',
} as const

/** Default interface language for the merchant account (`en` | `ar`). */
export const DEFAULT_LANGUAGE = 'en'

/**
 * APS pins the signature algorithm per merchant account. SHA-256 is the
 * current default; a merchant may switch to SHA-512 in the dashboard, in
 * which case the chosen algorithm rides in `Credentials.extra.shaType`.
 */
export const DEFAULT_SHA_TYPE: 'sha256' | 'sha512' = 'sha256'
