/**
 * Ozon stock write (`POST /v2/products/stocks`) ↔ canonical InventoryLevel.
 *
 * The method SETS `stock` for an `offer_id` on a `warehouse_id` and reports,
 * per item, whether it was `updated` plus any `errors`. There is no delta
 * method, so the adapter offers `setInventoryLevel` only — a read-then-write
 * delta would race Ozon's own reservations.
 *
 * Canonical ids: `variantId` is the seller's `offer_id`, `locationId` is the
 * Ozon `warehouse_id` (see transform/location.ts).
 *
 * Docs: https://docs.ozon.ru/api/seller/ (Prices&StocksAPI)
 */
import type { InventoryLevel } from '../../../schema/inventory'

export interface RawOzonStockUpdateError {
  code: string
  message: string
}

export interface RawOzonStockUpdateResult {
  offer_id: string
  product_id?: number
  warehouse_id: number
  updated: boolean
  errors?: RawOzonStockUpdateError[]
  [key: string]: unknown
}

export interface OzonStockUpdateBody {
  stocks: Array<{ offer_id: string; warehouse_id: number; stock: number }>
}

export function toStockUpdateBody(offerId: string, locationId: string, available: number): OzonStockUpdateBody {
  const warehouseId = /^\d+$/.test(locationId) ? Number(locationId) : NaN
  if (!Number.isSafeInteger(warehouseId)) {
    throw new Error(
      `Ozon stock updates need an Ozon warehouse id as locationId (got "${locationId}") — list them with listLocations.`,
    )
  }
  if (!Number.isInteger(available) || available < 0) {
    throw new Error(`Ozon stock must be a non-negative integer (got ${available}).`)
  }
  return { stocks: [{ offer_id: offerId, warehouse_id: warehouseId, stock: available }] }
}

export function transformStockUpdate(raw: RawOzonStockUpdateResult, available: number): InventoryLevel {
  if (!raw.updated) {
    const reasons = (raw.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ')
    throw new Error(
      `Ozon rejected the stock update for ${raw.offer_id} on warehouse ${raw.warehouse_id}: ${reasons || 'no reason given'}`,
    )
  }
  return {
    id: `${raw.offer_id}:${raw.warehouse_id}`,
    variantId: raw.offer_id,
    locationId: String(raw.warehouse_id),
    available,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
