/**
 * Commerce Layer Stock Item → canonical InventoryLevel.
 *
 * Commerce Layer stock items represent inventory at a specific stock location
 * for a specific SKU. Each stock item has `quantity` (on-hand).
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCLStockItem {
  id: string
  sku_code?: string
  quantity?: number
  created_at?: string
  updated_at?: string
  _type?: string
  _relationships?: Record<string, {
    data?: { type: string; id: string } | null
  }> | undefined
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawCLStockItem): InventoryLevel {
  const rels = raw._relationships as Record<string, { data?: { id: string } | null }> | undefined
  const skuId = rels?.['sku']?.data?.id ?? ''
  const stockLocationId = rels?.['stock_location']?.data?.id ?? ''
  return {
    id: raw.id,
    variantId: skuId,
    locationId: stockLocationId,
    available: raw.quantity ?? 0,
    onHand: raw.quantity ?? 0,
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformStockItem(
  data: { variantId?: string; locationId?: string; available?: number; quantity?: number },
): Record<string, unknown> {
  return {
    data: {
      type: 'stock_items',
      attributes: {
        sku_code: undefined,
        quantity: data.available ?? data.quantity ?? 0,
      },
      relationships: {
        stock_location: {
          data: data.locationId
            ? { type: 'stock_locations', id: data.locationId }
            : undefined,
        },
        sku: {
          data: data.variantId
            ? { type: 'skus', id: data.variantId }
            : undefined,
        },
      },
    },
  }
}
