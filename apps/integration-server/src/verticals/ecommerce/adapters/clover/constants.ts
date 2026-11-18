/**
 * Clover API constants.
 *
 * Clover uses merchant-scoped REST endpoints. All resource URLs are
 * prefixed with `/v3/merchants/{merchantId}/`.
 */

export const BASE_URL = 'https://api.clover.com'

/**
 * Sandbox REST API. docs.clover.com/dev/docs/making-rest-api-calls gives it as
 * `https://apisandbox.dev.clover.com`; `sandbox.dev.clover.com` is the legacy
 * Developer Dashboard.
 */
export const SANDBOX_URL = 'https://apisandbox.dev.clover.com'

export const ENVIRONMENTS = {
  production: BASE_URL,
  sandbox: SANDBOX_URL,
} as const

export type CloverEnvironment = keyof typeof ENVIRONMENTS

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

/** OAuth token endpoint. */
export const TOKEN_URL = 'https://sandbox.dev.clover.com/oauth/token'
export const PRODUCTION_TOKEN_URL = 'https://www.clover.com/oauth/token'
