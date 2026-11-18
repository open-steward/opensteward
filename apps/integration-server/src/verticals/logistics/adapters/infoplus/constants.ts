/**
 * Infoplus WMS API constants.
 *
 * Infoplus is a multi-tenant WMS/OMS platform. Each customer account lives at
 * a unique subdomain: https://<account>.infopluswms.com/infoplus-wms/api
 *
 * The domain is stored in credentials.extra.domain at connect time and
 * injected into every request by the client.
 */

export const INFOPLUS_API_VERSION = 'v2.0'
export const INFOPLUS_DASHBOARD_URL = 'https://app.infopluswms.com/'

/**
 * Build the per-tenant base URL.
 * domain is the full host, e.g. "mycompany.infopluswms.com"
 */
export function infoplusApiBase(domain: string): string {
  return `https://${domain}/infoplus-wms/api/${INFOPLUS_API_VERSION}/`
}

/**
 * Maximum results per page accepted by the Infoplus API.
 * Infoplus documents a hard limit of 250.
 */
export const MAX_PAGE_SIZE = 250
export const DEFAULT_PAGE_SIZE = 20

/**
 * Conservative rate limit. Infoplus does not publish a specific RPS cap,
 * but their documentation recommends staying well below 10 req/s.
 */
export const RATE_LIMIT_RPS = 5
