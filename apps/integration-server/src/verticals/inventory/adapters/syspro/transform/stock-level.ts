/**
 * Transform SYSPRO InvWarehouse OData entity → canonical StockLevel.
 *
 * SYSPRO OData entity: InvWarehouse  (one row per StockCode × Warehouse)
 * Confirmed field names from SYSPRO 8 OData examples and schema docs:
 *   StockCode, Warehouse, QtyOnHand, QtyAllocated (to sales orders),
 *   QtyInTransit, QtyOnOrder (outstanding POs + jobs), QtyOnBackOrder,
 *   MinimumQty (reorder point), ReorderQty, SafetyStock,
 *   BinLocation, LastCountDate, UnitCost
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawSysproStockLevel {
  StockCode: string
  Warehouse: string
  QtyOnHand?: number
  /** Quantity allocated to sales orders */
  QtyAllocated?: number
  QtyInTransit?: number
  /** Outstanding purchase orders + manufacturing jobs */
  QtyOnOrder?: number
  QtyOnBackOrder?: number
  /** Minimum quantity / reorder point */
  MinimumQty?: number
  ReorderQty?: number
  SafetyStock?: number
  BinLocation?: string
  LastCountDate?: string
  UnitCost?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSysproStockLevel): StockLevel {
  return {
    id: `${raw.StockCode}:${raw.Warehouse}`,
    productId: raw.StockCode,
    locationId: raw.Warehouse,
    quantityOnHand: raw.QtyOnHand ?? 0,
    quantityAvailable:
      raw.QtyOnHand !== undefined && raw.QtyAllocated !== undefined
        ? raw.QtyOnHand - raw.QtyAllocated
        : undefined,
    quantityCommitted: raw.QtyAllocated,
    quantityIncoming: raw.QtyOnOrder,
    reorderPoint: raw.MinimumQty,
    reorderQuantity: raw.ReorderQty,
    lastCountedAt: toIso(raw.LastCountDate),
    platform: 'syspro',
    metadata: strMap({
      qtyInTransit:  raw.QtyInTransit,
      qtyOnBackOrder: raw.QtyOnBackOrder,
      safetyStock:   raw.SafetyStock,
      binLocation:   raw.BinLocation,
    }),
    raw,
  }
}
