/**
 * Increff inventory / Available-to-Promise (ATP) stock level transform.
 *
 * Increff exposes stock per SKU per fulfilment location. The key fields are:
 *   skuCode           — client SKU identifier
 *   warehouseCode     — fulfilment location code
 *   availableQty      — quantity available for sale (ATP)
 *   onHandQty         — physical quantity on hand
 *   allocatedQty      — committed / reserved quantity
 *   inwardQty         — quantity in inbound orders (on order)
 *   updatedOn         — ISO timestamp of last update
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawIncreffStockLevel {
  /** Client SKU code */
  skuCode: string
  /** Fulfilment location / warehouse code */
  warehouseCode?: string
  locationCode?: string
  /** Available to promise — saleable stock */
  availableQty?: number
  /** Total physical on-hand */
  onHandQty?: number
  /** Allocated / committed quantity */
  allocatedQty?: number
  /** Inward / incoming quantity */
  inwardQty?: number
  updatedOn?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawIncreffStockLevel): StockLevel {
  const locationId = raw.warehouseCode ?? raw.locationCode ?? ''
  return {
    id: `${raw.skuCode}:${locationId}`,
    productId: raw.skuCode,
    locationId,
    quantityOnHand: raw.onHandQty ?? raw.availableQty ?? 0,
    quantityAvailable: raw.availableQty,
    quantityCommitted: raw.allocatedQty,
    quantityIncoming: raw.inwardQty,
    lastCountedAt: toIso(raw.updatedOn),
    platform: 'increff',
    metadata: strMap({ warehouseCode: raw.warehouseCode ?? raw.locationCode }),
    raw,
  }
}
