import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

/**
 * Sellbrite inventory shape — from GET /inventory.
 * on_hand  = physical quantity present in the warehouse
 * available = on_hand minus reserved/committed
 * reserved  = committed to open orders
 */
export interface RawSellbriteInventory {
  sku: string
  warehouse_uuid: string
  on_hand?: number
  available?: number
  reserved?: number
  bin_location?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSellbriteInventory): StockLevel {
  const onHand = raw.on_hand ?? 0
  const available = raw.available
  const reserved = raw.reserved

  return {
    id: `${raw.sku}:${raw.warehouse_uuid}`,
    productId: raw.sku,
    locationId: raw.warehouse_uuid,
    quantityOnHand: onHand,
    quantityAvailable: available,
    quantityCommitted: reserved,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'sellbrite',
    metadata: strMap({ binLocation: raw.bin_location }),
    raw,
  }
}
