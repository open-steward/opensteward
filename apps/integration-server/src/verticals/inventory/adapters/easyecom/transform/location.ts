import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/**
 * EasyEcom warehouse record.
 * Fields sourced from EasyEcom API /inventory/getWarehouses response.
 */
export interface RawEasyEcomLocation {
  warehouse_id: string | number
  warehouse_name?: string
  warehouse_code?: string
  is_active?: boolean | string | number
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  country?: string
  pincode?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawEasyEcomLocation): Location {
  const id = String(raw.warehouse_id)
  const hasAddress = raw.address_line1 || raw.city || raw.state || raw.country

  return {
    id,
    externalId: id,
    name: pickStr(raw.warehouse_name) ?? '',
    code: pickStr(raw.warehouse_code),
    type: 'warehouse',
    parentLocationId: undefined,
    address: hasAddress ? {
      line1: pickStr(raw.address_line1),
      line2: pickStr(raw.address_line2),
      city: pickStr(raw.city),
      region: pickStr(raw.state),
      country: pickStr(raw.country),
      postalCode: pickStr(raw.pincode),
    } : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    platform: 'easyecom',
    metadata: strMap({}),
    raw,
  }
}
