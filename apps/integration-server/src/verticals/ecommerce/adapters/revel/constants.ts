/**
 * Revel Systems API constants.
 *
 * Revel is an iPad-native POS system. All API endpoints are scoped to
 * `https://{subdomain}.revelup.com/resources/`. Auth uses API key
 * (API-Key + API-Secret headers) or OAuth2.
 */

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500

/** Build the base URL for a Revel establishment. */
export function buildBaseUrl(subdomain: string): string {
  return `https://${subdomain}.revelup.com`
}

/** API resource prefix. */
export const RESOURCES_PREFIX = '/resources'

/** OAuth2 endpoints (for establishments that use OAuth2 flow). */
export const OAUTH_AUTHORIZE_PATH = '/oauth2/authorize/'
export const OAUTH_TOKEN_PATH = '/oauth2/token/'

/** The documented ProductCategory resource (products_suite.yaml), at the host root. */
export const CATEGORY_PATH = '/products/ProductCategory/'

/** The documented Establishment resource (general_suite.yaml), at the host root. */
export const ESTABLISHMENT_PATH = '/enterprise/Establishment/'

/**
 * GET /enterprise/Establishment/ `limit` (general_suite.yaml, 2025.3.0): "Amount
 * of objects to return per query. This amount must be lower than 100 to avoid
 * high server load."
 */
export const ESTABLISHMENT_LIMIT = 99
