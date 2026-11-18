import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/**
 * Camelot 3PL / Excalibur WMS — warehouse record.
 *
 * Returned by the /warehouses endpoint.
 */
export interface RawCamelot3plLocation {
  warehouseId: string
  warehouseName?: string
  warehouseCode?: string
  isActive?: boolean | string | number
  address1?: string
  address2?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawCamelot3plLocation): Location {
  const hasAddress = raw.address1 || raw.city || raw.state || raw.country || raw.postalCode
  return {
    id: String(raw.warehouseId),
    externalId: String(raw.warehouseId),
    name: pickStr(raw.warehouseName) ?? '',
    code: pickStr(raw.warehouseCode),
    type: 'warehouse',
    parentLocationId: undefined,
    address: hasAddress ? {
      line1: pickStr(raw.address1),
      line2: pickStr(raw.address2),
      city: pickStr(raw.city),
      region: pickStr(raw.state),
      country: pickStr(raw.country),
      postalCode: pickStr(raw.postalCode),
    } : undefined,
    isActive: pickBool(raw.isActive) ?? true,
    platform: 'camelot-3pl',
    metadata: strMap({}),
    raw,
  }
}
