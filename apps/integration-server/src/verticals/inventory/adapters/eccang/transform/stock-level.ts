/**
 * Transform ECCANG inventory stock (库存) records to the canonical StockLevel schema.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

export interface RawEccangStockLevel {
  /** Goods / SKU identifier */
  goods_id?: string | number
  sku_id?: string | number
  goods_no?: string
  sku_no?: string
  /** Warehouse / location identifier */
  warehouse_id?: string | number
  warehouse_code?: string
  /** Quantities */
  stock_qty?: number | string
  available_qty?: number | string
  lock_qty?: number | string
  on_way_qty?: number | string
  reorder_point?: number | string
  reorder_qty?: number | string
  last_count_time?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawEccangStockLevel): StockLevel {
  const productId = String(raw.sku_id ?? raw.goods_id ?? '')
  const locationId = String(raw.warehouse_id ?? raw.warehouse_code ?? '')
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: pickNum(raw.stock_qty) ?? 0,
    quantityAvailable: pickNum(raw.available_qty),
    quantityCommitted: pickNum(raw.lock_qty),
    quantityIncoming: pickNum(raw.on_way_qty),
    reorderPoint: pickNum(raw.reorder_point),
    reorderQuantity: pickNum(raw.reorder_qty),
    lastCountedAt: toIso(raw.last_count_time),
    platform: 'eccang',
    metadata: strMap({ goodsNo: raw.goods_no, skuNo: raw.sku_no, warehouseCode: raw.warehouse_code }),
    raw,
  }
}
