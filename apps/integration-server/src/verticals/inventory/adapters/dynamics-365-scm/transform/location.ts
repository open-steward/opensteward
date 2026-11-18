/**
 * Transform D365 SCM InventWarehouseEntity OData entity → canonical Location.
 *
 * OData entity: InventWarehouses (entity name: InventWarehouseEntity)
 * Key fields:
 *   WarehouseId         — primary key (e.g. "11")
 *   WarehouseName       — display name
 *   SiteId              — parent site (maps to parentLocationId)
 *   DataAreaId          — legal entity
 *   IsDefault           — boolean flag
 *   IsQuarantineWarehouse — quarantine flag
 *   PhysicalNegativeInventoryAllowed — boolean
 *   AddressStreet, AddressCity, AddressStateId, AddressCountryRegionId, AddressZipCode
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawD365Warehouse {
  WarehouseId: string
  WarehouseName?: string
  SiteId?: string
  DataAreaId?: string
  IsDefault?: boolean | string
  IsQuarantineWarehouse?: boolean | string
  AddressStreet?: string
  AddressCity?: string
  AddressStateId?: string
  AddressCountryRegionId?: string
  AddressZipCode?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawD365Warehouse): Location {
  const hasAddress =
    raw.AddressStreet || raw.AddressCity || raw.AddressCountryRegionId || raw.AddressZipCode

  return {
    id: raw.WarehouseId,
    externalId: raw.WarehouseId,
    name: pickStr(raw.WarehouseName) ?? raw.WarehouseId,
    code: pickStr(raw.WarehouseId),
    type: pickBool(raw.IsQuarantineWarehouse) ? 'quarantine' : 'warehouse',
    parentLocationId: pickStr(raw.SiteId),
    address: hasAddress
      ? {
          line1: pickStr(raw.AddressStreet),
          city: pickStr(raw.AddressCity),
          region: pickStr(raw.AddressStateId),
          country: pickStr(raw.AddressCountryRegionId),
          postalCode: pickStr(raw.AddressZipCode),
        }
      : undefined,
    isActive: true,
    platform: 'dynamics-365-scm',
    metadata: strMap({
      dataAreaId: raw.DataAreaId,
      siteId: raw.SiteId,
      isDefault: raw.IsDefault,
      isQuarantine: raw.IsQuarantineWarehouse,
    }),
    raw,
  }
}
