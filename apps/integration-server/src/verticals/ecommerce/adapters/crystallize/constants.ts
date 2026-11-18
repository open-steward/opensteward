/**
 * Crystallize GraphQL API constants.
 *
 * Crystallize exposes multiple GraphQL endpoints per tenant:
 *  - Catalogue API: `https://api.crystallize.com/{tenant}/catalogue`
 *  - Order API:     `https://api.crystallize.com/{tenant}/orders`
 *  - PIM API:       `https://pim.crystallize.com/{tenant}/graphql`
 *
 * Auth is via static access tokens or OAuth2 bearer tokens.
 */

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/** Catalogue API base URL template. */
export const CATALOGUE_API = 'https://api.crystallize.com'

/** PIM (write) API base URL. */
export const PIM_API = 'https://pim.crystallize.com'

/** Header carrying the HMAC-SHA256 signature on webhook deliveries. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-crystallize-signature'
