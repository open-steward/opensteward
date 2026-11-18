/**
 * Webflow REST API constants.
 *
 * Webflow uses a versioned REST API (v2). All endpoints live under
 * `https://api.webflow.com/v2/`.
 *
 * Docs: https://developers.webflow.com/data/reference/rest-introduction
 */
export const BASE_URL = 'https://api.webflow.com/v2'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * Default OAuth scopes for a full-featured install. Webflow scopes are
 * colon-separated, e.g. `ecommerce:read`.
 */
export const DEFAULT_SCOPES = [
  'sites:read',
  'ecommerce:read',
  'ecommerce:write',
  'cms:read',
  'cms:write',
  'users:read',
]
