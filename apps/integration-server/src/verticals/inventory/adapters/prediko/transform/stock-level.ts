import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, strMap} from './shared'

/**
 * Raw SKU_LOCATION object returned by POST /api/v1/skus
 * with aggregation_level=SKU_LOCATION.
 */
export interface RawPredikoSkuLocation {
  sku_id?: string
  sku_name?: string
  warehouse_id?: string
  warehouse_name?: string
  sum_stock_level?: number
  sum_incoming_units?: number
  days_on_hand?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawPredikoSkuLocation): StockLevel {
  const productId = pickStr(raw.sku_id) ?? pickStr(raw.sku_name) ?? ''
  const locationId = pickStr(raw.warehouse_id) ?? pickStr(raw.warehouse_name) ?? ''
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: raw.sum_stock_level ?? 0,
    quantityAvailable: undefined,
    quantityCommitted: undefined,
    quantityIncoming: raw.sum_incoming_units,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'prediko',
    metadata: strMap({
      warehouseName: raw.warehouse_name,
      daysOnHand: raw.days_on_hand,
    }),
    raw,
  }
}
