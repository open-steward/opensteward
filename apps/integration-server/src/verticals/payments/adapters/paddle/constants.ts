export const HOSTS = {
  sandbox: 'https://sandbox-api.paddle.com',
  live: 'https://api.paddle.com',
} as const

export type PaddleEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: PaddleEnvironment = 'sandbox'
export const DEFAULT_PAGE_SIZE = 50

/**
 * Documented `per_page` maximums
 * (https://developer.paddle.com/api-reference/about/pagination.md: "Most list
 * operations return 50 results by default and a maximum of 200."). Two
 * endpoints cap lower, per their `per_page` rows: /transactions "Default:
 * `30`; Maximum: `30`." and /adjustments "Default: `10`; Maximum: `50`."
 */
export const MAX_PAGE_SIZE = 200
export const TRANSACTIONS_MAX_PAGE_SIZE = 30
export const ADJUSTMENTS_MAX_PAGE_SIZE = 50
