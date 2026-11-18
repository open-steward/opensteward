/**
 * Chargebee is per-site: API root is `https://<site>.chargebee.com/api/v2`
 * where `<site>` is the merchant's Chargebee subdomain.
 */
export const API_VERSION = 'v2'
export const DEFAULT_PAGE_SIZE = 100
/**
 * Every list endpoint documents `limit` as "optional, integer, default=10,
 * min=1, max=100" (e.g. https://apidocs.chargebee.com/docs/api/customers/list-customers).
 */
export const MAX_PAGE_SIZE = 100

export function hostFor(site: string): string {
  return `https://${site}.chargebee.com`
}
