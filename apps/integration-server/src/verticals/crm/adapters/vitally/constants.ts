/**
 * Vitally REST API constants.
 *
 * US region:  https://{subdomain}.rest.vitally.io/resources
 * EU region:  https://rest.vitally-eu.io/resources
 *
 * The subdomain is the first segment of the customer's Vitally login URL
 * (e.g. https://yoursubdomain.vitally.io → subdomain = "yoursubdomain").
 */

/** Base URL for the EU datacenter (fixed, no subdomain). */
export const VITALLY_EU_BASE_URL = 'https://rest.vitally-eu.io/resources'

/** Build the US base URL from a customer subdomain. */
export function usBaseUrl(subdomain: string): string {
  return `https://${subdomain}.rest.vitally.io/resources`
}

/** Default page size for list requests (max is 100). */
export const DEFAULT_PAGE_SIZE = 50

/** Documented list maximum (and default): "The max/default is 100". */
export const MAX_PAGE_SIZE = 100
