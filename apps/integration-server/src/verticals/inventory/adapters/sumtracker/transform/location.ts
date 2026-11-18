import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/**
 * Sumtracker warehouse object as returned by GET /warehouses or GET /warehouses/:id.
 * Sumtracker calls physical stock locations "warehouses".
 */
export interface RawSumtrackerLocation {
  id: string | number
  name?: string
  code?: string
  is_default?: boolean | string | number
  is_active?: boolean | string | number
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  country?: string
  zip_code?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawSumtrackerLocation): Location {
  const id = String(raw.id)
  const hasAddress = raw.address_line1 || raw.city || raw.country
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.code),
    type: 'warehouse',
    parentLocationId: undefined,
    address: hasAddress
      ? {
          line1: pickStr(raw.address_line1),
          line2: pickStr(raw.address_line2),
          city: pickStr(raw.city),
          region: pickStr(raw.state),
          country: pickStr(raw.country),
          postalCode: pickStr(raw.zip_code),
        }
      : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    platform: 'sumtracker',
    metadata: strMap({ is_default: raw.is_default }),
    raw,
  }
}
