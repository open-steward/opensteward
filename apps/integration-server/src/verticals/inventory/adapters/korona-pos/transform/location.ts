import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/**
 * KORONA.cloud API v3 OrganizationalUnit shape.
 * Can represent both stores and warehouses. The `warehouse` boolean
 * indicates it is a warehouse/stock-holding unit.
 * Address uses AddressInformation shape.
 */
export interface RawKoronaPosOrganizationalUnit {
  id: string
  number?: string
  name?: string
  active?: boolean
  warehouse?: boolean
  parentOrganizationalUnit?: { id?: string; number?: string }
  address?: {
    addressLine1?: string
    addressLine2?: string
    city?: string
    state?: string
    country?: string
    zipCode?: string
    department?: string
  }
  economicZone?: { id?: string; number?: string }
  [key: string]: unknown
}

export function transformLocation(raw: RawKoronaPosOrganizationalUnit): Location {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.number),
    type: raw.warehouse ? 'warehouse' : 'store',
    parentLocationId: pickStr(raw.parentOrganizationalUnit?.id),
    address: raw.address
      ? {
          line1: raw.address.addressLine1,
          line2: raw.address.addressLine2,
          city: raw.address.city,
          region: raw.address.state,
          country: raw.address.country,
          postalCode: raw.address.zipCode,
        }
      : undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'korona-pos',
    metadata: strMap({
      warehouse: raw.warehouse,
      economicZone: raw.economicZone?.number,
      department: raw.address?.department,
    }),
    raw,
  }
}
