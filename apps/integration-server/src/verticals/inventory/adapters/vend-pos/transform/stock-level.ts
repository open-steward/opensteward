/**
 * Transform a Vend POS (Lightspeed Retail X-Series) inventory record.
 *
 * API reference: GET /api/2.0/inventory
 * Vend models inventory per (product, outlet) pair.
 *
 * Key fields:
 *   id, product_id, outlet_id, count (on-hand quantity), on_order,
 *   reorder_point, reorder_amount, average_cost (per unit, decimal)
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

export interface RawVendInventory {
  /** Composite UUID: product_id + outlet_id */
  id?: string
  product_id: string
  outlet_id: string
  /** On-hand quantity */
  count?: number | string
  /** Available (on-hand minus committed) */
  available?: number | string
  /** Units on order */
  on_order?: number | string
  reorder_point?: number | string
  reorder_amount?: number | string
  /** Average unit cost (decimal) — NOT mapped to price fields */
  average_cost?: number | string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawVendInventory): StockLevel {
  const id = raw.id ?? `${raw.product_id}:${raw.outlet_id}`
  return {
    id,
    productId: raw.product_id,
    locationId: raw.outlet_id,
    quantityOnHand: pickNum(raw.count) ?? 0,
    quantityAvailable: pickNum(raw.available),
    quantityIncoming: pickNum(raw.on_order),
    reorderPoint: pickNum(raw.reorder_point),
    reorderQuantity: pickNum(raw.reorder_amount),
    platform: 'vend-pos',
    metadata: strMap({ averageCost: raw.average_cost }),
    raw,
  }
}
