/**
 * Amazon Pay API v2 constants.
 *
 * The REST host is region-specific (NA / EU / JP) and the path carries both
 * the environment (`live` | `sandbox`) and the API version, e.g.
 *   https://pay-api.amazon.com/sandbox/v2/charges/:chargeId
 *
 * Docs: https://developer.amazon.com/docs/amazon-pay-api-v2/introduction.html
 */

/** Region → REST host. The customer picks a region on the Connect form. */
export const REGION_HOSTS = {
  na: 'https://pay-api.amazon.com',
  eu: 'https://pay-api.amazon.eu',
  jp: 'https://pay-api.amazon.jp',
} as const

export type AmazonPayRegion = keyof typeof REGION_HOSTS

export const DEFAULT_REGION: AmazonPayRegion = 'na'

/** Pinned API version. Bump when re-testing transforms against a newer one. */
export const API_VERSION = 'v2'

/** Environment segment in the request path. */
export type AmazonPayEnvironment = 'live' | 'sandbox'
export const DEFAULT_ENVIRONMENT: AmazonPayEnvironment = 'live'

/** Authorization header algorithm token (RSASSA-PSS v2 scheme). */
export const SIGNING_ALGORITHM = 'AMZN-PAY-RSASSA-PSS-V2'

/** RSASSA-PSS salt length (bytes) mandated by the v2 signing scheme. */
export const SIGNING_SALT_LENGTH = 32

/**
 * Amazon Pay has no list endpoints — every resource is retrieved by id — so
 * there is no page-size constant. Resource paths are appended to
 * `<host>/<environment>/<version>`.
 */
export const PATHS = {
  charges: '/charges',
  chargePermissions: '/chargePermissions',
  refunds: '/refunds',
  disputes: '/disputes',
} as const
