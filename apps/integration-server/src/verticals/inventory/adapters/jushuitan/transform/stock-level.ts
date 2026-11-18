/**
 * Transform a raw Jushuitan inventory record (/open/inventory/query) into a
 * canonical StockLevel.
 *
 * Jushuitan field reference:
 *   sku_id         — SKU numeric ID
 *   i_id           — SKU code string
 *   wms_co_id      — warehouse/location numeric ID
 *   wh_name        — warehouse name (used as location name fallback)
 *   qty_enable     — available (saleable) quantity
 *   qty_onhand     — total on-hand quantity
 *   qty_lock       — committed/locked quantity
 *   qty_purchase   — incoming purchase quantity (on order)
 *   modified       — last updated datetime
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawJushuitanStockLevel {
  sku_id: number | string
  i_id?: string
  wms_co_id?: number | string
  wh_name?: string
  qty_enable?: number
  qty_onhand?: number
  qty_lock?: number
  qty_purchase?: number
  modified?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawJushuitanStockLevel): StockLevel {
  const productId = String(raw.sku_id)
  const locationId = raw.wms_co_id != null ? String(raw.wms_co_id) : ''

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: raw.qty_onhand ?? 0,
    quantityAvailable: raw.qty_enable,
    quantityCommitted: raw.qty_lock,
    quantityIncoming: raw.qty_purchase,
    lastCountedAt: toIso(raw.modified),
    platform: 'jushuitan',
    metadata: strMap({ iId: raw.i_id, whName: raw.wh_name }),
    raw,
  }
}
