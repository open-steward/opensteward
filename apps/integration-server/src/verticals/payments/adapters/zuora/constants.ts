/**
 * Zuora REST API constants.
 *
 * Hosts — https://developer.zuora.com/v1-api-reference/introduction.md:
 *   "All API requests occur in a test or production environment. [...] Each
 *   environment uses a different base URL."
 * The table lists every value below; a connection picks its environment, and
 * a connection stored without one keeps the host this adapter always used,
 * US Production (Cloud 2).
 *
 * Paging — https://developer.zuora.com/docs/guides/pagination.md:
 *   "For the Object Query API, the maximum value for `pageSize` is 99. If
 *   `pageSize` value is unspecified or invalid, `pageSize` typically defaults
 *   to `10`."
 */

export const HOSTS = {
  'us-developer-sandbox': 'https://rest.test.zuora.com',
  'us-api-sandbox-cloud1': 'https://rest.sandbox.na.zuora.com',
  'us-api-sandbox-cloud2': 'https://rest.apisandbox.zuora.com',
  'us-production-cloud1': 'https://rest.na.zuora.com',
  'us-production-cloud2': 'https://rest.zuora.com',
  'eu-developer-sandbox': 'https://rest.test.eu.zuora.com',
  'eu-api-sandbox': 'https://rest.sandbox.eu.zuora.com',
  'eu-production': 'https://rest.eu.zuora.com',
  'apac-developer-sandbox': 'https://rest.test.ap.zuora.com',
  'apac-production': 'https://rest.ap.zuora.com',
} as const

export type ZuoraEnvironment = keyof typeof HOSTS

export const ENVIRONMENT_LABELS: Record<ZuoraEnvironment, string> = {
  'us-developer-sandbox': 'US Developer & Central Sandbox',
  'us-api-sandbox-cloud1': 'US API Sandbox (Cloud 1)',
  'us-api-sandbox-cloud2': 'US API Sandbox (Cloud 2)',
  'us-production-cloud1': 'US Production (Cloud 1)',
  'us-production-cloud2': 'US Production (Cloud 2)',
  'eu-developer-sandbox': 'EU Developer & Central Sandbox',
  'eu-api-sandbox': 'EU API Sandbox',
  'eu-production': 'EU Production',
  'apac-developer-sandbox': 'APAC Developer & Central Sandbox',
  'apac-production': 'APAC Production',
}

export const DEFAULT_ENVIRONMENT: ZuoraEnvironment = 'us-production-cloud2'

export function isZuoraEnvironment(value: unknown): value is ZuoraEnvironment {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(HOSTS, value)
}

/** Object Query `pageSize`: "If the specified pageSize is less than 1 or greater than 99, Zuora will return a 400 error." */
export const MAX_PAGE_SIZE = 99
/** "If `pageSize` value is unspecified or invalid, `pageSize` typically defaults to `10`." */
export const DEFAULT_PAGE_SIZE = 10
