/**
 * Clover ItemStock → canonical InventoryLevel.
 *
 * Clover uses per-item stock counts. Since each merchant is a single
 * location, the locationId is the merchantId.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawCloverItemStock {
  item?: { id?: string }
  quantity?: number
  modifiedTime?: number
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawCloverItemStock,
  merchantId: string,
): InventoryLevel {
  const variantId = raw.item?.id ?? ''
  const available = raw.quantity ?? 0

  return {
    id: `${variantId}:${merchantId}`,
    variantId,
    locationId: merchantId,
    available,
    updatedAt: raw.modifiedTime ? new Date(raw.modifiedTime).toISOString() : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
