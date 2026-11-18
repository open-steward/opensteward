/**
 * Bagy Variant stock → canonical InventoryLevel.
 *
 * Bagy does not expose a dedicated inventory-levels endpoint. Stock is a
 * field directly on the product (`stock`) or variant (`stock`). We synthesise
 * a canonical InventoryLevel by treating each variant's stock as a single
 * inventory level at the virtual "default" location.
 *
 * Composite id format: `${variantId}:default`
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawBagyVariantStock {
  id: number | string
  product_id?: number | string
  stock?: number | string | null
  minimum_stock?: number | null
  modified?: string | null
  [key: string]: unknown
}

export function transformInventoryLevel(
  raw: RawBagyVariantStock,
  productId?: string,
): InventoryLevel {
  const variantId = String(raw.id)
  const locationId = 'default'
  const available =
    raw.stock != null ? Math.max(0, parseInt(String(raw.stock), 10) || 0) : 0

  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    updatedAt: toIsoDatetime(raw.modified),
    metadata: {
      ...(raw as unknown as Record<string, unknown>),
      productId,
    },
  }
}
