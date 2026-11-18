/**
 * Jubelio location (warehouse) transform.
 *
 * GET /locations/       → {data: RawJubelioLocation[], count: number}
 * GET /locations/{id}   → RawJubelioLocation
 *
 * Jubelio warehouses track floors, rows, columns, and bins but the top-level
 * location object has simpler fields: location_id, location_name, location_code,
 * is_active, address fields.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawJubelioLocation {
  location_id: number | string
  location_name?: string
  location_code?: string
  is_active?: boolean | number | string
  is_default?: boolean | number | string
  address?: string
  city?: string
  province?: string
  country?: string
  postal_code?: string
  phone?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawJubelioLocation): Location {
  const id = String(raw.location_id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.location_name) ?? '',
    code: pickStr(raw.location_code),
    type: 'warehouse',
    parentLocationId: undefined,
    address:
      raw.address || raw.city || raw.country
        ? {
            line1: pickStr(raw.address),
            city: pickStr(raw.city),
            region: pickStr(raw.province),
            country: pickStr(raw.country),
            postalCode: pickStr(raw.postal_code),
          }
        : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    platform: 'jubelio',
    metadata: strMap({ isDefault: raw.is_default, phone: raw.phone }),
    raw,
  }
}
