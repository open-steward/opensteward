/**
 * SAP EWM stock-level transform.
 *
 * Source: SAP S/4HANA Warehouse Available Stock – Read (A2X)
 *   OData v2 service: WAREHOUSEAVAILABLESTOCK_0001
 *   Entity set: WarehouseAvailableStock
 *   Key fields: EWMWarehouse + EWMStorageType + EWMStorageBin + Product +
 *               Batch + WBSElementInternalID + SDDocument + SDDocumentItem +
 *               InventorySpecialStockType + InventoryStockType
 *
 * We compose a synthetic id from the natural key fields.
 * Quantities are plain counts (not minor currency units).
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap, toIso} from './shared'

export interface RawSapEwmStockLevel {
  /** Warehouse number (EWM warehouse) */
  EWMWarehouse: string
  /** Storage type code */
  EWMStorageType?: string
  /** Storage bin */
  EWMStorageBin?: string
  /** Product / material number */
  Product: string
  /** Batch number */
  Batch?: string
  /** Available quantity in base unit */
  EWMStockQtyInBaseUnit?: string | number
  /** Base unit of measure */
  BaseUnit?: string
  /** Picking quantity (committed / allocated) */
  EWMPickedQtyInBaseUnit?: string | number
  /** Goods receipt quantity (incoming) */
  EWMGoodsReceiptQtyInBaseUnit?: string | number
  /** Stock type (U = unrestricted, B = blocked, Q = quality inspection…) */
  InventoryStockType?: string
  /** Special stock type indicator */
  InventorySpecialStockType?: string
  /** Last change datetime */
  LastChangeDateTime?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSapEwmStockLevel): StockLevel {
  const binKey = [
    raw.EWMWarehouse,
    raw.EWMStorageType ?? '',
    raw.EWMStorageBin ?? '',
    raw.Product,
    raw.Batch ?? '',
  ].join(':')

  const locationId = raw.EWMStorageBin
    ? `${raw.EWMWarehouse}:${raw.EWMStorageType ?? ''}:${raw.EWMStorageBin}`
    : raw.EWMWarehouse

  return {
    id: binKey,
    productId: raw.Product,
    locationId,
    quantityOnHand: pickNum(raw.EWMStockQtyInBaseUnit) ?? 0,
    quantityAvailable: pickNum(raw.EWMStockQtyInBaseUnit),
    quantityCommitted: pickNum(raw.EWMPickedQtyInBaseUnit),
    quantityIncoming: pickNum(raw.EWMGoodsReceiptQtyInBaseUnit),
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: toIso(raw.LastChangeDateTime),
    platform: 'sap-ewm',
    metadata: strMap({
      ewmWarehouse: raw.EWMWarehouse,
      ewmStorageType: raw.EWMStorageType,
      ewmStorageBin: raw.EWMStorageBin,
      baseUnit: raw.BaseUnit,
      batch: raw.Batch,
      inventoryStockType: raw.InventoryStockType,
      inventorySpecialStockType: raw.InventorySpecialStockType,
    }),
    raw,
  }
}
