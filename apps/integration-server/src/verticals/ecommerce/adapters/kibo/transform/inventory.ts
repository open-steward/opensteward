/**
 * Kibo Commerce Inventory → canonical InventoryLevel.
 *
 * Kibo inventory data lives at:
 *   GET /api/commerce/catalog/storefront/products/{productCode}/locationinventory
 *
 * Key fields:
 *   - `productCode`       → variantId
 *   - `locationCode`      → locationId
 *   - `stockAvailable`    → available
 *   - `allocated`         → committed
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawKiboInventory {
  productCode?: string
  locationCode?: string
  stockAvailable?: number
  allocated?: number
  onHandQuantity?: number
  inStockQuantity?: number
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawKiboInventory): InventoryLevel {
  const variantId = raw.productCode ?? ''
  const locationId = raw.locationCode ?? 'default'
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: raw.stockAvailable ?? 0,
    committed: raw.allocated ?? undefined,
    onHand: raw.onHandQuantity ?? raw.inStockQuantity ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
