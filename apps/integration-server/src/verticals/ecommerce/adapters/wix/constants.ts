/**
 * Wix eCommerce API constants.
 *
 * Wix uses POST for most query operations and has different sub-paths per
 * resource family. Tokens expire in ~5 minutes (one of the most aggressive
 * refresh cycles of any ecommerce platform).
 */

export const BASE_URL = 'https://www.wixapis.com'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/** Search Orders `cursorPaging.limit`: "validation: minimum 0, maximum 100". */
export const ORDERS_SEARCH_MAX = 100

/** Token lifetime in seconds (~5 min). */
export const TOKEN_LIFETIME_SECONDS = 300

/**
 * Default OAuth scopes for a full-featured install.
 */
export const DEFAULT_SCOPES = [
  'SCOPE.DC-STORES-MEGA.MANAGE-PRODUCTS',
  'SCOPE.DC-STORES-MEGA.MANAGE-ORDERS',
  'SCOPE.DC-STORES-MEGA.MANAGE-INVENTORY',
  'SCOPE.DC-CONTACTS.READ-WRITE',
  'SCOPE.DC-STORES-MEGA.MANAGE-COUPONS',
]
