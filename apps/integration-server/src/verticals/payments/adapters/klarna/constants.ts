/**
 * Klarna country-specific API endpoints. Klarna routes merchant API traffic
 * to the regional cluster the merchant signed up in. The username from a
 * Europe-issued API key only works against the EU host; same for North
 * America, Oceania, and Playground.
 *
 * Docs: https://docs.klarna.com/api/#endpoints
 */
export const HOSTS = {
  eu_live: 'https://api.klarna.com',
  eu_playground: 'https://api.playground.klarna.com',
  na_live: 'https://api-na.klarna.com',
  na_playground: 'https://api-na.playground.klarna.com',
  oc_live: 'https://api-oc.klarna.com',
  oc_playground: 'https://api-oc.playground.klarna.com',
} as const

export type KlarnaRegion = keyof typeof HOSTS

export const DEFAULT_REGION: KlarnaRegion = 'eu_playground'

/**
 * GET /settlements/v1/payouts `size`: "If no value for size is provided, a
 * default of 20 will be used. A maximum of 500 can be set".
 * https://docs.klarna.com/acquirer/klarna/api/settlements/
 */
export const PAYOUTS_DEFAULT_SIZE = 20
export const PAYOUTS_MAX_SIZE = 500
