/**
 * StoreFeeder stock-level transform.
 *
 * StoreFeeder exposes inventory data two ways:
 *   1. InventoryInformation nested inside GET /products  (per-product totals)
 *      Fields: Inventory, AvailableInventory, Allocated, OnPurchaseOrder, etc.
 *   2. ProductWarehouseInformationModel.StockLocations (ProductStockLocationModel[])
 *      inside GET /products?IncludeStockLocations=true  (per-stock-location)
 *      Fields: StockLocation.{StockLocationID, StockLocationReference},
 *              PhysicalStock, Available, Allocated, PendingOut
 *
 * The adapter normalises both shapes into RawStoreFeederStockLevel before
 * calling transformStockLevel.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawStoreFeederStockLevel {
  /** Composite key: product ID (integer) */
  ProductID?: number
  ProductGUID?: string
  SKU?: string
  /** Stock location ID (from StockLocationBaseModel.StockLocationID) */
  StockLocationID?: number
  /** Stock location reference string */
  StockLocationReference?: string
  /** Warehouse this location belongs to */
  WarehouseID?: number
  WarehouseName?: string
  /**
   * Physical quantity on-hand in the location.
   * Populated from:
   *   - ProductStockLocationModel.PhysicalStock  (per-location shape)
   *   - ProductInventoryInfoModel.Inventory      (product-total shape)
   */
  Inventory?: number
  /**
   * Quantity available to be allocated.
   * Populated from:
   *   - ProductStockLocationModel.Available      (per-location shape)
   *   - ProductInventoryInfoModel.AvailableInventory (product-total shape)
   */
  AvailableInventory?: number
  /** Quantity currently allocated to orders. */
  Allocated?: number
  /** Quantity on pending purchase orders. */
  OnPurchaseOrder?: number
  /** Quantity quarantined (product-total shape only). */
  QuarantinedInventory?: number
  /** Manual reorder threshold. */
  ManualReorderLevel?: number
  /** System-calculated reorder threshold. */
  CalculatedReorderLevel?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawStoreFeederStockLevel): StockLevel {
  const productId = String(raw.ProductID ?? raw.ProductGUID ?? raw.SKU ?? '')
  const locationId = raw.StockLocationID !== undefined
    ? String(raw.StockLocationID)
    : (raw.StockLocationReference ?? (raw.WarehouseID !== undefined ? String(raw.WarehouseID) : ''))

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: raw.Inventory ?? 0,
    quantityAvailable: raw.AvailableInventory,
    quantityCommitted: raw.Allocated,
    quantityIncoming: raw.OnPurchaseOrder,
    reorderPoint: raw.ManualReorderLevel ?? raw.CalculatedReorderLevel,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'store-feeder',
    metadata: strMap({
      quarantinedInventory: raw.QuarantinedInventory,
      stockLocationReference: raw.StockLocationReference,
      warehouseName: raw.WarehouseName,
    }),
    raw,
  }
}
