import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

/**
 * Shape returned by GET ?path=warehouse-item (ConnectPOS warehouse integration).
 *
 * The warehouse-item endpoint returns per-product, per-warehouse stock data.
 * Fields follow the SM\Integrate WarehouseIntegrateManagement shape.
 *
 * Also handles the simpler stock_items payload embedded in product responses
 * when called via the product endpoint with outletId context.
 */
export interface RawConnectposStockLevel {
  /** Magento product entity_id */
  product_id?: string | number
  /** warehouse / outlet id */
  warehouse_id?: string | number
  outlet_id?: string | number
  qty?: number | string
  /** total qty on hand */
  total_qty?: number | string
  available_qty?: number | string
  /** qty committed to open orders */
  qty_to_ship?: number | string
  /** qty incoming on purchase orders */
  qty_ordered?: number | string
  /** reorder level */
  notify_stock_qty?: number | string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawConnectposStockLevel): StockLevel {
  const productId = String(raw.product_id ?? '')
  const locationId = String(raw.warehouse_id ?? raw.outlet_id ?? '')

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: pickNum(raw.qty) ?? pickNum(raw.total_qty) ?? 0,
    quantityAvailable: pickNum(raw.available_qty),
    quantityCommitted: pickNum(raw.qty_to_ship),
    quantityIncoming: pickNum(raw.qty_ordered),
    reorderPoint: pickNum(raw.notify_stock_qty),
    platform: 'connectpos',
    metadata: strMap({}),
    raw,
  }
}
