/**
 * StoreFeeder location transform.
 *
 * StoreFeeder has two location concepts:
 *   - Warehouses  (GET /warehouses)   — top-level physical buildings
 *   - StockLocations  (GET /stocklocations)  — zones/bins within a warehouse
 *
 * We model warehouses as top-level locations and stock-locations as children.
 * The adapter calls GET /warehouses for listLocations and GET /warehouses/{id}
 * for getLocation since warehouses are the primary inventory boundaries.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

interface AddressModel {
  AddressLine1?: string
  AddressLine2?: string
  Town?: string
  County?: string
  Country?: string
  Postcode?: string
  ContactName?: string
  [key: string]: unknown
}

export interface RawStoreFeederWarehouse {
  WarehouseID?: number
  WarehouseGuid?: string
  WarehouseName?: string
  WarehouseType?: string
  IsDefault?: boolean
  HandlingTime?: number
  SenderName?: string
  ShippingAddress?: AddressModel
  BillingAddress?: AddressModel
  [key: string]: unknown
}

export interface RawStoreFeederStockLocation {
  StockLocationID?: number
  StockLocationReference?: string
  Warehouse?: { WarehouseID?: number; WarehouseName?: string; WarehouseGuid?: string }
  StockLocationType?: string
  KeepProduct?: boolean
  IsEmpty?: boolean
  HasProducts?: boolean
  IsSystem?: boolean
  IsQuarantined?: boolean
  LocationOrder?: number
  [key: string]: unknown
}

export function transformWarehouse(raw: RawStoreFeederWarehouse): Location {
  const id = String(raw.WarehouseID ?? raw.WarehouseGuid ?? '')
  const addr = raw.ShippingAddress
  return {
    id,
    externalId: id,
    name: pickStr(raw.WarehouseName) ?? '',
    code: pickStr(raw.WarehouseGuid),
    type: 'warehouse',
    parentLocationId: undefined,
    address: addr ? {
      line1: pickStr(addr.AddressLine1),
      line2: pickStr(addr.AddressLine2),
      city: pickStr(addr.Town),
      region: pickStr(addr.County),
      country: pickStr(addr.Country),
      postalCode: pickStr(addr.Postcode),
    } : undefined,
    isActive: true,
    platform: 'store-feeder',
    metadata: strMap({
      isDefault: raw.IsDefault,
      warehouseType: raw.WarehouseType,
      handlingTimeDays: raw.HandlingTime,
      senderName: raw.SenderName,
    }),
    raw,
  }
}

export function transformStockLocation(raw: RawStoreFeederStockLocation): Location {
  const id = String(raw.StockLocationID ?? '')
  const parentId = raw.Warehouse?.WarehouseID !== undefined
    ? String(raw.Warehouse.WarehouseID)
    : undefined
  return {
    id,
    externalId: id,
    name: pickStr(raw.StockLocationReference) ?? id,
    code: pickStr(raw.StockLocationReference),
    type: raw.IsQuarantined ? 'quarantine' : 'bin',
    parentLocationId: parentId,
    address: undefined,
    isActive: !(pickBool(raw.IsSystem) ?? false),
    platform: 'store-feeder',
    metadata: strMap({
      stockLocationType: raw.StockLocationType,
      keepProduct: raw.KeepProduct,
      isEmpty: raw.IsEmpty,
      hasProducts: raw.HasProducts,
      isQuarantined: raw.IsQuarantined,
      locationOrder: raw.LocationOrder,
    }),
    raw,
  }
}

// Default export: warehouses are the primary location entity
export { transformWarehouse as transformLocation }
export type { RawStoreFeederWarehouse as RawStoreFeederLocation }
