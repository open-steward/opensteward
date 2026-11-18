/**
 * Znode Warehouse → canonical Location.
 *
 * Znode warehouses live at `/api/warehouses`. Each warehouse has
 * an address, name, and active status.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawZnodeWarehouse {
  WarehouseId?: number
  WarehouseName?: string
  WarehouseCode?: string
  IsActive?: boolean
  Address1?: string
  Address2?: string
  CityName?: string
  StateName?: string
  PostalCode?: string
  CountryName?: string
  PhoneNumber?: string
  [key: string]: unknown
}

function mapAddress(raw: RawZnodeWarehouse): Address | undefined {
  const line1 = raw.Address1
  const line2 = raw.Address2
  const city = raw.CityName
  const region = raw.StateName
  const postalCode = raw.PostalCode
  const country = raw.CountryName
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformLocation(raw: RawZnodeWarehouse): Location {
  return {
    id: String(raw.WarehouseId ?? ''),
    name: raw.WarehouseName ?? raw.WarehouseCode ?? '',
    active: raw.IsActive,
    address: mapAddress(raw),
    phone: raw.PhoneNumber,
    isFulfillmentCenter: true,
    metadata: raw as Record<string, unknown>,
  }
}
