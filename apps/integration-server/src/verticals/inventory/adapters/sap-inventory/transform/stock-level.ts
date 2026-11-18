/**
 * Transform SAP API_MATERIAL_STOCK_SRV A_MatlStkInAcctMod → canonical StockLevel.
 *
 * A_MatlStkInAcctMod entity key fields:
 *   Material, Plant, StorageLocation, Batch, Supplier, Customer,
 *   WBSElementInternalID, SDDocument, SDDocumentItem,
 *   InventorySpecialStockType, InventoryStockType
 *
 * Quantity field: MatlWrhsStkQtyInMatlBaseUnit
 * Base unit:      MaterialBaseUnit
 *
 * Reference: https://api.sap.com/api/API_MATERIAL_STOCK_SRV/resource
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, pickNum, strMap} from './shared'

/**
 * Raw SAP A_MatlStkInAcctMod entity (one row per material+plant+storageLocation
 * combination within the accounting model).
 */
export interface RawSapStockLevel {
  /** Material / product number */
  Material: string
  /** Plant (manufacturing/distribution plant code) */
  Plant?: string
  /** Storage location within the plant (maps to our locationId) */
  StorageLocation?: string
  /** Batch number (optional) */
  Batch?: string
  /** Unrestricted-use stock qty in base unit */
  MatlWrhsStkQtyInMatlBaseUnit?: string | number
  /** Material base unit (EA, KG, …) */
  MaterialBaseUnit?: string
  /** InventoryStockType: "01" = unrestricted, "02" = quality inspection, etc. */
  InventoryStockType?: string
  InventorySpecialStockType?: string
  /** Supplier (special stock scenario) */
  Supplier?: string
  /** Customer (special stock scenario) */
  Customer?: string
  WBSElementInternalID?: string
  SDDocument?: string
  SDDocumentItem?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawSapStockLevel): StockLevel {
  // Composite location = Plant + StorageLocation
  const plant = pickStr(raw.Plant) ?? ''
  const storageLoc = pickStr(raw.StorageLocation) ?? ''
  const locationId = storageLoc ? `${plant}:${storageLoc}` : plant

  const qty = pickNum(raw.MatlWrhsStkQtyInMatlBaseUnit) ?? 0

  return {
    id: `${raw.Material}:${locationId}:${raw.InventoryStockType ?? ''}`,
    productId: raw.Material,
    locationId,
    quantityOnHand: qty,
    quantityAvailable: undefined,
    quantityCommitted: undefined,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'sap-inventory',
    metadata: strMap({
      plant,
      storageLocation: storageLoc,
      batch: raw.Batch,
      inventoryStockType: raw.InventoryStockType,
      inventorySpecialStockType: raw.InventorySpecialStockType,
      materialBaseUnit: raw.MaterialBaseUnit,
    }),
    raw,
  }
}
