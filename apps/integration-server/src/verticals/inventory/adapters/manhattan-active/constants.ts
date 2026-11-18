/**
 * Manhattan Active WM — runtime constants.
 *
 * Base URL pattern:  https://<env>.omni.manh.com/api
 * Auth URL pattern:  https://<env>-auth.omni.manh.com/oauth/token
 *
 * The environment identifier (<env>) is unique per customer deployment.
 * Customers supply it as a credential field; the client builds the full URL
 * from it at runtime.
 *
 * Reference: https://developer.manh.com/docs/how-to/rest-api/
 */

/** Substitute {env} with the customer's environment identifier. */
export const MANH_API_BASE_TEMPLATE = 'https://{env}.omni.manh.com/api'
export const MANH_AUTH_TOKEN_TEMPLATE = 'https://{env}-auth.omni.manh.com/oauth/token'

export function apiBaseUrl(env: string): string {
  return MANH_API_BASE_TEMPLATE.replace('{env}', env)
}

export function authTokenUrl(env: string): string {
  return MANH_AUTH_TOKEN_TEMPLATE.replace('{env}', env)
}

/** Default page size for paginated list requests. */
export const DEFAULT_PAGE_SIZE = 100

/** WM REST API resource paths (relative to apiBaseUrl). */
export const PATHS = {
  items: '/wm/v1/items',
  itemInventory: (itemId: string) => `/wm/v1/items/${itemId}/inventory`,
  locations: '/wm/v1/locations',
  suppliers: '/wm/v1/suppliers',
  purchaseOrders: '/wm/v1/purchase-orders',
  stockAdjustments: '/wm/v1/inventory-adjustments',
  stockTransfers: '/wm/v1/inventory-transfers',
} as const
