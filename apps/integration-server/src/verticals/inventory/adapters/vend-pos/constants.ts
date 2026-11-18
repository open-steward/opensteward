/**
 * Vend POS (Lightspeed Retail X-Series) API constants.
 *
 * Base URL is per-retailer: https://{domain_prefix}.retail.lightspeed.app
 * The domain_prefix is stored in credentials.extra.domainPrefix after OAuth.
 *
 * Auth:      OAuth 2.0 authorization-code grant
 * Auth URL:  https://secure.retail.lightspeed.app/connect
 * Token URL: https://{domain_prefix}.retail.lightspeed.app/api/1.0/token
 * API:       https://{domain_prefix}.retail.lightspeed.app/api/2.0/...
 */

/** Authorization endpoint — domain-agnostic (global Lightspeed SSO). */
export const OAUTH_AUTHORIZE_URL = 'https://secure.retail.lightspeed.app/connect'

/**
 * Token endpoint template. Replace {domainPrefix} with the retailer's
 * domain prefix before use.
 */
export const OAUTH_TOKEN_URL_TEMPLATE =
  'https://{domainPrefix}.retail.lightspeed.app/api/1.0/token'

/**
 * API v2.0 base URL template.
 * Replace {domainPrefix} with the value from credentials.extra.domainPrefix.
 */
export const API_BASE_URL_TEMPLATE =
  'https://{domainPrefix}.retail.lightspeed.app/api/2.0'

/** Default page size for cursor-paginated v2.0 endpoints. */
export const DEFAULT_PAGE_SIZE = 200

/**
 * Default scopes requested during OAuth.
 * Vend/X-Series uses resource-based scopes.
 */
export const DEFAULT_SCOPES = [
  'products:read',
  'inventory:read',
  'outlets:read',
  'suppliers:read',
  'consignments:read',
]
