/**
 * SPS Commerce inventory advisory (EDI 846 / inventory report) transform.
 *
 * Wire field names follow SPS Commerce REST API standards (snake_case).
 * Reference: GET /fulfillment/v1/inventory-advises
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

export interface RawSpsCommerceStockLevel {
  /** SPS internal inventory record ID */
  inventory_id?: string
  /** Item identifier (links to /items) */
  item_id: string
  /** Buyer-assigned item number */
  buyer_item_number?: string
  /** Location / warehouse identifier */
  location_id?: string
  /** Location name or code */
  location?: string
  /** Quantity on hand */
  quantity_on_hand?: number
  /** Quantity available (on_hand minus committed) */
  quantity_available?: number
  /** Quantity committed / allocated */
  quantity_committed?: number
  /** Quantity on order / incoming */
  quantity_on_order?: number
  /** Reorder trigger point */
  reorder_point?: number
  /** Reorder quantity */
  reorder_quantity?: number
  /** Datetime of last physical count */
  last_count_date?: string
  /** Effective date of the inventory report */
  report_date?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSpsCommerceStockLevel): StockLevel {
  const locationId = raw.location_id ?? raw.location ?? ''
  const id = raw.inventory_id ?? `${raw.item_id}:${locationId}`
  return {
    id,
    productId: raw.item_id,
    locationId,
    quantityOnHand: pickNum(raw.quantity_on_hand) ?? 0,
    quantityAvailable: pickNum(raw.quantity_available),
    quantityCommitted: pickNum(raw.quantity_committed),
    quantityIncoming: pickNum(raw.quantity_on_order),
    reorderPoint: pickNum(raw.reorder_point),
    reorderQuantity: pickNum(raw.reorder_quantity),
    lastCountedAt: toIso(raw.last_count_date),
    platform: 'sps-commerce',
    metadata: strMap({
      buyerItemNumber: raw.buyer_item_number,
      reportDate: raw.report_date,
    }),
    raw,
  }
}
