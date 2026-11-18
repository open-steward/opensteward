/**
 * Fulfil.io REST API v2 constants.
 *
 * Base URL is per-tenant: https://{subdomain}.fulfil.io/api/v2
 * Auth: single API key sent as x-api-key header.
 */

/** Placeholder token — real base URL is built dynamically per-tenant in client.ts. */
export const API_BASE_URL_TPL = 'https://{subdomain}.fulfil.io/api/v2'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 100

/** Fulfil.io model paths (Tryton-based naming). */
export const MODELS = {
  PRODUCT: 'product.product',
  STOCK_LOCATION: 'stock.location',
  PARTY: 'party.party',
  PURCHASE: 'purchase.purchase',
  PURCHASE_LINE: 'purchase.line',
  STOCK_MOVE: 'stock.move',
  STOCK_INVENTORY: 'stock.inventory',
  STOCK_INVENTORY_LINE: 'stock.inventory.line',
  INTERNAL_SHIPMENT: 'stock.shipment.internal',
} as const
