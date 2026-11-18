/**
 * Transform Mabang ERP get-stock-quantity response into StockLevel.
 *
 * Mabang field notes (get-stock-quantity data[]):
 *   stockId        — ERP product numeric ID
 *   stockSku       — inventory SKU
 *   stockName      — product name
 *   warehouseCode  — warehouse identifier code
 *   warehouseName  — warehouse display name
 *   quantity       — total quantity on hand
 *   usableQuantity — available (usable) quantity
 *   lockQuantity   — committed / locked quantity
 *   purchaseQuantity — on-order / incoming quantity
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

export interface RawMabangStockLevel {
  stockId?: string | number
  stockSku?: string
  stockName?: string
  warehouseCode?: string
  warehouseName?: string
  quantity?: string | number
  usableQuantity?: string | number
  lockQuantity?: string | number
  purchaseQuantity?: string | number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawMabangStockLevel): StockLevel {
  const productId = String(raw.stockId ?? raw.stockSku ?? '')
  const locationId = raw.warehouseCode ?? raw.warehouseName ?? ''

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId: String(locationId),
    quantityOnHand: pickNum(raw.quantity) ?? 0,
    quantityAvailable: pickNum(raw.usableQuantity),
    quantityCommitted: pickNum(raw.lockQuantity),
    quantityIncoming: pickNum(raw.purchaseQuantity),
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'mabang-erp',
    metadata: strMap({ stockName: raw.stockName, warehouseName: raw.warehouseName }),
    raw,
  }
}
