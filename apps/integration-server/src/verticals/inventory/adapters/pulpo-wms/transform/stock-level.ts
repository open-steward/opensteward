import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, strMap, toIso} from './shared'

/**
 * Raw stock record from GET /api/v1/stock (PULPO WMS).
 * PULPO represents stock per product + warehouse; a synthetic composite id is
 * generated as `<product_id>:<warehouse_id>`.
 */
export interface RawPulpoWmsStockLevel {
  product_id: string
  warehouse_id?: string
  warehouse_code?: string
  quantity_on_hand?: number
  quantity_available?: number
  quantity_committed?: number
  quantity_incoming?: number
  quantity_outgoing?: number
  reorder_point?: number
  reorder_quantity?: number
  last_counted_at?: string
  lots?: Array<{
    lot_number?: string
    quantity?: number
    expiry_date?: string
  }>
  [key: string]: unknown
}

export function transformStockLevel(raw: RawPulpoWmsStockLevel): StockLevel {
  const locationId = pickStr(raw.warehouse_id) ?? pickStr(raw.warehouse_code) ?? ''
  return {
    id: `${raw.product_id}:${locationId}`,
    productId: raw.product_id,
    locationId,
    quantityOnHand: raw.quantity_on_hand ?? 0,
    quantityAvailable: raw.quantity_available,
    quantityCommitted: raw.quantity_committed,
    quantityIncoming: raw.quantity_incoming,
    quantityOutgoing: raw.quantity_outgoing,
    reorderPoint: raw.reorder_point,
    reorderQuantity: raw.reorder_quantity,
    lastCountedAt: toIso(raw.last_counted_at),
    lots: raw.lots?.map((l) => ({
      lot: pickStr(l.lot_number) ?? '',
      quantity: l.quantity ?? 0,
      expiresAt: toIso(l.expiry_date),
    })),
    platform: 'pulpo-wms',
    metadata: strMap({}),
    raw,
  }
}
