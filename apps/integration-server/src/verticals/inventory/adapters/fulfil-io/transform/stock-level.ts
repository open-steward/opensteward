import type { StockLevel } from '../../../schema/stock-level'
import {strMap, m2oId, m2oName} from './shared'

/**
 * Fulfil stock.product.location provides per-product per-location on-hand quantities.
 * This is the recommended endpoint for bulk stock-level reads.
 *
 * Alternatively, stock.move aggregation or stock.location forecast can be used.
 * We model against stock.product.location here.
 */
export interface RawFulfilStockLevel {
  /** Integer record id */
  id: number
  /** Product (Many2One) */
  product?: [number, string] | null
  /** Location (Many2One) */
  location?: [number, string] | null
  /** Quantity on hand */
  quantity?: number | null
  /** Forecast quantity */
  forecast_quantity?: number | null
  create_date?: string | null
  write_date?: string | null
  [key: string]: unknown
}

/** Fields to request from the API for stock.product.location. */
export const STOCK_LEVEL_FIELDS = [
  'id', 'product', 'location', 'quantity', 'forecast_quantity', 'create_date', 'write_date',
]

export function transformStockLevel(raw: RawFulfilStockLevel): StockLevel {
  const productId = m2oId(raw.product) ?? ''
  const locationId = m2oId(raw.location) ?? ''
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: raw.quantity ?? 0,
    quantityAvailable: raw.forecast_quantity ?? undefined,
    platform: 'fulfil-io',
    metadata: strMap({
      productName: m2oName(raw.product),
      locationName: m2oName(raw.location),
    }),
    raw,
  }
}
