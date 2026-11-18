import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

/**
 * EasyEcom inventory details record.
 * Fields sourced from EasyEcom API /inventory/getInventoryDetails response.
 */
export interface RawEasyEcomStockLevel {
  sku?: string
  product_id?: string | number
  warehouse_id?: string | number
  warehouse_name?: string
  available_qty?: number | string
  total_qty?: number | string
  reserved_qty?: number | string
  in_transit_qty?: number | string
  damaged_qty?: number | string
  reorder_point?: number | string
  reorder_qty?: number | string
  last_updated?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawEasyEcomStockLevel): StockLevel {
  const productId = raw.product_id != null ? String(raw.product_id) : (raw.sku ?? '')
  const locationId = raw.warehouse_id != null ? String(raw.warehouse_id) : ''
  const available = pickNum(raw.available_qty)
  const total = pickNum(raw.total_qty)
  const reserved = pickNum(raw.reserved_qty)
  const inTransit = pickNum(raw.in_transit_qty)

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: total ?? available ?? 0,
    quantityAvailable: available,
    quantityCommitted: reserved,
    quantityIncoming: inTransit,
    reorderPoint: pickNum(raw.reorder_point),
    reorderQuantity: pickNum(raw.reorder_qty),
    lastCountedAt: toIso(raw.last_updated),
    platform: 'easyecom',
    metadata: strMap({ warehouseName: raw.warehouse_name, damagedQty: raw.damaged_qty }),
    raw,
  }
}
