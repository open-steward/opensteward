/**
 * Wix InventoryItem → canonical InventoryLevel.
 *
 * Wix inventory items are queried via `POST /stores/v2/inventoryItems/query`.
 * Each item has variants with stock levels. The canonical id is synthesised as
 * `${variantId}:${locationId}`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawWixInventoryVariant {
  variantId?: string
  inStock?: boolean
  quantity?: number
}

export interface RawWixInventoryItem {
  id?: string
  productId?: string
  trackQuantity?: boolean
  variants?: RawWixInventoryVariant[]
  lastUpdated?: string
  [key: string]: unknown
}

/**
 * Transform a Wix inventory item into one or more canonical inventory levels.
 * Wix inventory items may contain multiple variants; each becomes a separate
 * canonical InventoryLevel.
 */
export function transformInventoryItem(
  raw: RawWixInventoryItem,
  locationId: string = 'default',
): InventoryLevel[] {
  const variants = raw.variants ?? []
  if (variants.length === 0) {
    // If no variants, create a single level for the product itself
    return [
      {
        id: `${raw.id ?? raw.productId ?? ''}:${locationId}`,
        variantId: raw.id ?? raw.productId ?? '',
        locationId,
        available: 0,
        updatedAt: raw.lastUpdated,
        metadata: raw as unknown as Record<string, unknown>,
      },
    ]
  }

  return variants.map((v) => {
    const variantId = v.variantId ?? ''
    return {
      id: `${variantId}:${locationId}`,
      variantId,
      locationId,
      available: v.quantity ?? 0,
      updatedAt: raw.lastUpdated,
      metadata: raw as unknown as Record<string, unknown>,
    }
  })
}
