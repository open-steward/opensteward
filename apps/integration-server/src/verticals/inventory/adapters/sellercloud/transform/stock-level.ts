/**
 * Transform a Sellercloud inventory-warehouse record.
 *
 * Source endpoint: GET /rest/api/Inventory/Warehouses?productID={id}
 * Docs: https://developer.sellercloud.com/dev-article/get-inventory-warehouse-related-information/
 *
 * Key field mappings:
 *   ProductID    → productId / id prefix
 *   WarehouseID  → locationId
 *   PhysicalQty  → quantityOnHand
 *   AvailableQty → quantityAvailable
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawSellercloudStockLevel {
  /** Product identifier (string or number in API response) */
  ProductID: string | number
  /** Warehouse identifier */
  WarehouseID: number | string
  /** Physical (on-hand) quantity */
  PhysicalQty?: number
  /** Available quantity (physical minus reserved) */
  AvailableQty?: number
  /** Reserved / committed quantity */
  ReservedQty?: number
  /** On-order quantity */
  OnOrder?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSellercloudStockLevel): StockLevel {
  const productId = String(raw.ProductID)
  const locationId = String(raw.WarehouseID)
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: raw.PhysicalQty ?? 0,
    quantityAvailable: raw.AvailableQty,
    quantityCommitted: raw.ReservedQty,
    quantityIncoming: raw.OnOrder,
    platform: 'sellercloud',
    metadata: strMap({}),
    raw,
  }
}
