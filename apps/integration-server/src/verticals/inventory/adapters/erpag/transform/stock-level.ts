/**
 * ERPAG stock-level transform.
 *
 * Stock levels are embedded inside each item returned by GET /item:
 *   inventory: [{ warehouse, quantity, available, reserved, onOrder, ... }]
 *
 * The adapter materialises one StockLevel per inventory entry, using the
 * product key (passed in as productId) + warehouse name as the composite id.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

export interface RawErpagStockLevel {
  /** Injected by the adapter — from the parent item's id. */
  productId: string
  warehouse?: string
  quantity?: number
  available?: number
  reserved?: number
  onOrder?: number
  reorderPoint?: number
  reorderQuantity?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawErpagStockLevel): StockLevel {
  const locationId = raw.warehouse ?? ''
  return {
    id: `${raw.productId}:${locationId}`,
    productId: raw.productId,
    locationId,
    quantityOnHand: pickNum(raw.quantity) ?? 0,
    quantityAvailable: pickNum(raw.available),
    quantityCommitted: pickNum(raw.reserved),
    quantityIncoming: pickNum(raw.onOrder),
    reorderPoint: pickNum(raw.reorderPoint),
    reorderQuantity: pickNum(raw.reorderQuantity),
    platform: 'erpag',
    metadata: strMap({}),
    raw,
  }
}
