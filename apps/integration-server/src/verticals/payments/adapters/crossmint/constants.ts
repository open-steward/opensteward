/**
 * Crossmint REST API constants.
 *
 * Crossmint runs two fully isolated environments selected by the API-key
 * prefix: `sk_staging_…` keys hit the staging host, `sk_production_…` keys hit
 * production. We pick the base URL from the key so a single credential field is
 * enough — no separate environment toggle.
 *
 * Checkout (the payments surface) is versioned by date in the path:
 * `/<version>/orders`. We pin the headless-orders version here.
 *
 * Docs: https://docs.crossmint.com/api-reference/introduction
 */
export const PRODUCTION_BASE_URL = 'https://www.crossmint.com/api'
export const STAGING_BASE_URL = 'https://staging.crossmint.com/api'

/** Headless-orders (Checkout) API version segment. */
export const ORDERS_API_VERSION = '2022-06-09'

export const ORDERS_PATH = `/${ORDERS_API_VERSION}/orders`
export const orderPath = (id: string): string => `${ORDERS_PATH}/${id}`

/**
 * Resolve the environment base URL from the API-key prefix. Production keys
 * begin `sk_production_`; everything else (staging keys, blanks) resolves to
 * staging — the safe default for a misconfigured credential.
 */
export function baseUrlForKey(apiKey: string | undefined): string {
  return (apiKey ?? '').startsWith('sk_production_') ? PRODUCTION_BASE_URL : STAGING_BASE_URL
}
