/**
 * Authorize.Net JSON API hosts. The merchant chooses sandbox or production
 * when generating the API Login ID / Transaction Key in the dashboard.
 */
export const HOSTS = {
  sandbox: 'https://apitest.authorize.net',
  live: 'https://api.authorize.net',
} as const

export type AuthNetEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: AuthNetEnvironment = 'sandbox'
