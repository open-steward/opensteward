/**
 * Transform a Sellercloud warehouse record.
 *
 * Source endpoint: GET /rest/api/Warehouses
 * Docs: https://developer.sellercloud.com/dev-article/get-all-warehouses/
 *
 * Key field mappings:
 *   ID                          → id / externalId
 *   Name                        → name
 *   IsDefault                   → metadata.isDefault
 *   WarehouseAddress.Address    → address.line1
 *   WarehouseAddress.Address2   → address.line2
 *   WarehouseAddress.City       → address.city
 *   WarehouseAddress.State      → address.region
 *   WarehouseAddress.Country    → address.country
 *   WarehouseAddress.ZipCode    → address.postalCode
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawSellercloudWarehouse {
  ID: number | string
  Name?: string
  IsDefault?: boolean | number
  IsSellAble?: boolean | number
  WarehouseType?: number
  EnforceBins?: boolean
  WarehouseAddress?: {
    Address?: string
    Address2?: string
    City?: string
    State?: string
    Region?: string
    Country?: string
    ZipCode?: string
    Phone?: string
    ContactName?: string
  }
  [key: string]: unknown
}

export function transformLocation(raw: RawSellercloudWarehouse): Location {
  const id = String(raw.ID)
  const wa = raw.WarehouseAddress

  return {
    id,
    externalId: id,
    name: pickStr(raw.Name) ?? '',
    type: 'warehouse',
    address: wa
      ? {
          line1: pickStr(wa.Address),
          line2: pickStr(wa.Address2),
          city: pickStr(wa.City),
          region: pickStr(wa.State) ?? pickStr(wa.Region),
          country: pickStr(wa.Country),
          postalCode: pickStr(wa.ZipCode),
        }
      : undefined,
    isActive: true, // Sellercloud does not expose an isActive flag on warehouse objects
    platform: 'sellercloud',
    metadata: strMap({
      isDefault: raw.IsDefault,
      isSellable: raw.IsSellAble,
      warehouseType: raw.WarehouseType,
      enforceBins: raw.EnforceBins,
    }),
    raw,
  }
}
