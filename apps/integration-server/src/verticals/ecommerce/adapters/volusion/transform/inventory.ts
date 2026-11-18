/**
 * Volusion Inventory → canonical InventoryLevel.
 *
 * Volusion tracks stock at the product/variant level — there is no
 * multi-location inventory. We model a single implicit location ("default")
 * and synthesize the id as `${ProductCode}:default`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawVolusionInventory {
  ProductCode: string
  StockQuantity: number | null
  WarehouseQuantity?: number | null
  LastModified?: string | null
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawVolusionInventory): InventoryLevel {
  const variantId = raw.ProductCode
  const locationId = 'default'
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: raw.StockQuantity ?? 0,
    onHand: raw.WarehouseQuantity ?? undefined,
    updatedAt: raw.LastModified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
