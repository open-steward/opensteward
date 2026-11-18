/**
 * Jumpseller Inventory → canonical InventoryLevel.
 *
 * Jumpseller supports multi-location inventory via "stock locations".
 * Each product / variant carries a `stock_locations` array with entries:
 *   { id, name, stock }
 *
 * Where no `stock_locations` are present, the product-level `stock` field
 * is used and we synthesise a single inventory level with a virtual
 * locationId of "default".
 *
 * Docs: https://jumpseller.com/support/multi-location-inventory/
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawJumpsellerStockLocation {
  id: number | string
  name?: string
  stock?: number | null
}

export function transformInventoryLevel(
  stockLocation: RawJumpsellerStockLocation,
  variantId: string,
): InventoryLevel {
  return {
    id: `${variantId}:${String(stockLocation.id)}`,
    variantId,
    locationId: String(stockLocation.id),
    available: stockLocation.stock ?? 0,
    metadata: stockLocation as unknown as Record<string, unknown>,
  }
}

/**
 * Build inventory levels from a product/variant that uses a flat `stock`
 * field (no stock_locations), synthesising a "default" location entry.
 */
export function transformFlatStock(
  variantId: string,
  stock: number | null | undefined,
): InventoryLevel {
  return {
    id: `${variantId}:default`,
    variantId,
    locationId: 'default',
    available: stock ?? 0,
    metadata: { stock },
  }
}
