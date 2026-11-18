import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

/**
 * A single stock entry from the Billbee article's embedded Stocks[] array.
 * Billbee returns per-warehouse stock as part of the product object.
 */
export interface RawBillbeeStockEntry {
  /** Billbee internal article ID (parent product) */
  productId: string
  /** Stock warehouse ID */
  StockId?: number
  /** Warehouse display name */
  Name?: string
  /** Current quantity on hand */
  StockCurrent?: number
  /** Desired/target quantity */
  StockDesired?: number
  /** Low-stock warning threshold */
  StockWarning?: number
  /** Unfulfilled (committed) quantity */
  UnfulfilledAmount?: number
  /** Merchant stock code */
  StockCode?: string
  StockCurrentIsCalculated?: boolean
  [key: string]: unknown
}

export function transformStockLevel(raw: RawBillbeeStockEntry): StockLevel {
  const locationId = String(raw.StockId ?? '')
  const productId = String(raw.productId)
  const onHand = pickNum(raw.StockCurrent) ?? 0
  const committed = pickNum(raw.UnfulfilledAmount)
  const available = committed !== undefined ? Math.max(0, onHand - committed) : undefined

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: onHand,
    quantityAvailable: available,
    quantityCommitted: committed,
    reorderPoint: pickNum(raw.StockWarning),
    platform: 'billbee',
    metadata: strMap({
      stockCode: raw.StockCode,
      stockDesired: raw.StockDesired,
      isCalculated: raw.StockCurrentIsCalculated,
    }),
    raw,
  }
}
