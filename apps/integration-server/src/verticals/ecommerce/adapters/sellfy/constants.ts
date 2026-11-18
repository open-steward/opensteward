/**
 * Shopify Admin REST API constants.
 *
 * The Shopify Admin REST API is versioned quarterly. We pin a known-good
 * version here so adapter behaviour is deterministic — bump this when the
 * adapter is re-tested against a newer version.
 */
export const API_VERSION = '2025-01'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250

/**
 * Default OAuth scopes for a full-featured install. Callers can narrow this
 * via `SellfyAdapterConfig.scopes` if their app only needs a subset.
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
  'read_price_rules',
  'write_price_rules',
  'read_discounts',
  'write_discounts',
]
