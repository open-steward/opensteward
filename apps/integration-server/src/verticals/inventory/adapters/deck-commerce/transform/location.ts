/**
 * Deck Commerce warehouse/location data.
 *
 * Warehouse codes appear in inventory check Details[].WarehouseCode and in the
 * MSI source mapping config. There is no dedicated warehouse-list REST endpoint
 * in the public Deck Commerce API; location records are synthesised from the
 * warehouse codes returned by the inventory check endpoint.
 *
 * If a dedicated warehouse endpoint is added in future, WarehouseCode maps to
 * `code`, WarehouseName to `name`, and address fields follow the shape below.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawDeckCommerceLocation {
  /** Warehouse short code, e.g. "WH1", "DCC", "DCSL" */
  WarehouseCode: string
  WarehouseName?: string
  IsActive?: boolean | string
  IsDefault?: boolean | string
  Address?: {
    Address1?: string
    Address2?: string
    City?: string
    State?: string
    Country?: string
    ZipCode?: string
  }
  [key: string]: unknown
}

export function transformLocation(raw: RawDeckCommerceLocation): Location {
  return {
    id: raw.WarehouseCode,
    externalId: raw.WarehouseCode,
    name: pickStr(raw.WarehouseName) ?? raw.WarehouseCode,
    code: raw.WarehouseCode,
    type: 'warehouse',
    parentLocationId: undefined,
    address: raw.Address ? {
      line1: raw.Address.Address1,
      line2: raw.Address.Address2,
      city: raw.Address.City,
      region: raw.Address.State,
      country: raw.Address.Country,
      postalCode: raw.Address.ZipCode,
    } : undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    platform: 'deck-commerce',
    metadata: strMap({ isDefault: raw.IsDefault }),
    raw,
  }
}
