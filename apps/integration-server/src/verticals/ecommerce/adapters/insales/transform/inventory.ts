/**
 * InSales Inventory → canonical InventoryLevel.
 *
 * InSales stores stock as `quantity` on each product variant
 * (`/admin/products/{id}/variants.json`). There is no separate inventory
 * ledger per location — stock is global per variant. We synthesise the
 * canonical InventoryLevel using the variant id as both variantId and the
 * default location id `"default"`.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawInsalesVariantStock {
  id: number | string
  product_id?: number | string | null
  quantity?: number | null
  updated_at?: string
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawInsalesVariantStock,
  locationId: string = 'default',
): InventoryLevel {
  const variantId = String(raw.id)
  const available = Math.max(0, raw.quantity ?? 0)
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
