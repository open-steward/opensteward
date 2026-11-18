/**
 * Epos Now Stock -> canonical InventoryLevel.
 *
 * Epos Now tracks stock per product per location. The API returns
 * stock levels as simple numeric quantities.
 */

import type { InventoryLevel } from '../../../schema/inventory'

export interface RawEposNowStock {
  Id?: number
  ProductId?: number
  LocationId?: number
  CurrentStock?: number
  LastUpdatedDate?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawEposNowStock): InventoryLevel {
  const variantId = String(raw.ProductId ?? '')
  const locationId = String(raw.LocationId ?? '')
  const available = raw.CurrentStock ?? 0

  return {
    id: raw.Id != null ? String(raw.Id) : `${variantId}:${locationId}`,
    variantId,
    locationId,
    available,
    updatedAt: raw.LastUpdatedDate ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * A V4 ProductStock row (https://developer.eposnowhq.com/docs/v4/json,
 * definition ProductStock): one product at one location, its quantity held in
 * batches (IProductStockBatch.CurrentStock).
 */
export interface RawEposNowProductStock {
  Id?: number
  ProductId?: number
  LocationId?: number
  MinStock?: number
  MaxStock?: number
  ProductStockBatches?: Array<{ CurrentStock?: number; [key: string]: unknown }>
  [key: string]: unknown
}

/**
 * Epos Now ProductStock -> canonical InventoryLevel. `available` is the batches'
 * `CurrentStock` summed, floored at 0 (an oversold product sells nothing more;
 * the raw row keeps the true figure). The id is `<ProductId>:<LocationId>`: V4
 * documents no lookup by ProductStock `Id`, but does document one by product
 * and location ("Get Stocks for a Product in a Location"), which is how
 * getInventoryLevel reads a listed level back.
 */
export function transformProductStock(raw: RawEposNowProductStock): InventoryLevel {
  const variantId = String(raw.ProductId ?? '')
  const locationId = String(raw.LocationId ?? '')
  const total = (raw.ProductStockBatches ?? []).reduce(
    (sum, batch) => sum + (Number.isFinite(batch.CurrentStock) ? Number(batch.CurrentStock) : 0),
    0,
  )
  return {
    id: `${variantId}:${locationId}`,
    variantId,
    locationId,
    available: Math.max(0, Math.trunc(total)),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
