import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

/**
 * Raw inventory record from GET /inventory or GET /inventory/details.
 * Fields sourced from SphereWMS API v2.27.0.
 */
export interface RawSphereWmsInventory {
  product_id?: string | number
  product_code?: string
  location_id?: string
  client_code?: string
  total_on_hand?: number
  total_expected?: number
  total_ordered?: number
  total_allocated?: number
  total_available?: number
  on_purchase?: number
  on_order?: number
  on_transfer?: number
  on_adjustment?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSphereWmsInventory): StockLevel {
  const productId = String(raw.product_id ?? raw.product_code ?? '')
  const locationId = raw.location_id ?? ''
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: raw.total_on_hand ?? 0,
    quantityAvailable: raw.total_available,
    quantityCommitted: raw.total_allocated,
    quantityIncoming: raw.on_purchase ?? raw.total_expected,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'spherewms',
    metadata: strMap({
      clientCode: raw.client_code,
      onOrder: raw.on_order,
      onTransfer: raw.on_transfer,
      onAdjustment: raw.on_adjustment,
    }),
    raw,
  }
}
