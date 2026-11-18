/**
 * Cashfree Payment Gateway (PG) — India-anchored gateway.
 *
 * Both environments live under a `/pg` path prefix. The merchant picks one
 * at Connect time; the choice rides in `Credentials.extra.environment`.
 */
export const HOSTS = {
  sandbox: 'https://sandbox.cashfree.com/pg',
  production: 'https://api.cashfree.com/pg',
} as const

export type CashfreeEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: CashfreeEnvironment = 'sandbox'

/**
 * Cashfree pins request behaviour to a dated API version supplied on every
 * call via the `x-api-version` header. 2025-01-01 is the current GA version
 * (v5).
 */
export const API_VERSION = '2025-01-01'

export const DEFAULT_PAGE_SIZE = 50
