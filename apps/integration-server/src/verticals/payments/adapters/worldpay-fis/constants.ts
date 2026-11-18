/**
 * Worldpay (FIS) "Worldpay for Platforms" REST API hosts. Try, then sandbox,
 * then live. Region routing handled server-side by the access-token issuer.
 */
export const HOSTS = {
  try: 'https://try.access.worldpay.com',
  sandbox: 'https://access-uat.worldpay.com',
  live: 'https://access.worldpay.com',
} as const

export type WorldpayEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: WorldpayEnvironment = 'try'

/**
 * GET /accountPayouts/events: pageSize "[ 1 .. 499 ] required"
 * (https://docs.worldpay.com/access/products/account-payouts/openapi/get-payouts).
 */
export const PAYOUTS_MAX_PAGE_SIZE = 499

/**
 * GET /accounts/statements: pageSize "Value must be between 1-500"
 * (https://docs.worldpay.com/access/products/statements/openapi/other/getstatements).
 */
export const STATEMENTS_MAX_PAGE_SIZE = 500

/**
 * The declared page maximum: the smaller of the two, so every list method
 * pages at the size the router asks for.
 */
export const MAX_PAGE_SIZE = Math.min(PAYOUTS_MAX_PAGE_SIZE, STATEMENTS_MAX_PAGE_SIZE)
