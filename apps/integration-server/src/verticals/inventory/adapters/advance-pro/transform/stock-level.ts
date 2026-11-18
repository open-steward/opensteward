/**
 * AdvancePro stock-level transform.
 *
 * GET /api/Inventory (or /api/products/{id}/inventory) returns per-warehouse
 * quantity data.
 *
 * Known response fields:
 *   productId, productSku, warehouseId, warehouseName,
 *   quantityOnHand, quantityAvailable, quantityCommitted,
 *   quantityOnOrder, reorderPoint, reorderQuantity,
 *   lastCountDate
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

export interface RawAdvanceProStockLevel {
  productId?: string | number
  productSku?: string
  warehouseId?: string | number
  warehouseName?: string
  quantityOnHand?: number | string
  quantityAvailable?: number | string
  quantityCommitted?: number | string
  quantityAllocated?: number | string
  quantityOnOrder?: number | string
  reorderPoint?: number | string
  reorderQuantity?: number | string
  lastCountDate?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawAdvanceProStockLevel): StockLevel {
  const productId = String(raw.productId ?? '')
  const locationId = String(raw.warehouseId ?? '')
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: pickNum(raw.quantityOnHand) ?? 0,
    quantityAvailable: pickNum(raw.quantityAvailable),
    quantityCommitted: pickNum(raw.quantityCommitted ?? raw.quantityAllocated),
    quantityIncoming: pickNum(raw.quantityOnOrder),
    reorderPoint: pickNum(raw.reorderPoint),
    reorderQuantity: pickNum(raw.reorderQuantity),
    lastCountedAt: toIso(raw.lastCountDate),
    platform: 'advance-pro',
    metadata: strMap({ warehouseName: raw.warehouseName, productSku: raw.productSku }),
    raw,
  }
}
