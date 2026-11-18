/**
 * SHOPLINE Admin REST API constants.
 *
 * The SHOPLINE Admin REST API is versioned quarterly. We pin a known-good
 * stable version here — bump this when the adapter is re-tested against a
 * newer release.
 *
 * Docs: https://developer.shopline.com/docs/apps/api-instructions-for-use/rest-admin-api/overview/
 */

/** Stable API version pinned for this adapter. */
export const API_VERSION = 'v20260301'

export const DEFAULT_PAGE_SIZE = 50
/** SHOPLINE caps list endpoints at 250 for products/orders; use 50 as safe default. */
export const MAX_PAGE_SIZE = 250

/**
 * Default OAuth scopes for a full-featured install. Callers can narrow this
 * via `ShoplineAdapterConfig.scopes` if their app only needs a subset.
 *
 * Scope format mirrors SHOPLINE's documented scope names.
 * Docs: https://developer.shopline.com/docs/apps/api-instructions-for-use/app-authorization/
 */
export const DEFAULT_SCOPES = [
  'read_products',
  'write_products',
  'read_orders',
  'write_orders',
  'read_customers',
  'write_customers',
  'read_inventory',
  'write_inventory',
  'read_fulfillments',
  'write_fulfillments',
  'read_locations',
  'read_discounts',
  'write_discounts',
]

/**
 * Build the Admin REST API base URL for a given store handle.
 *
 * Example: handle="mystore" → https://mystore.myshopline.com/admin/openapi/v20260301
 */
export function buildBaseUrl(handle: string): string {
  const host = handle.endsWith('.myshopline.com') ? handle : `${handle}.myshopline.com`
  return `https://${host}/admin/openapi/${API_VERSION}`
}
