/**
 * Versa Cloud ERP — location (warehouse / facility) transform.
 *
 * API endpoint: GET /location.json
 * Key response fields:
 *   id, location_name, location_code, is_default, is_active,
 *   address_line1, address_line2, city, state, country, postal_code,
 *   parent_location_id
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawVersaLocation {
  id: string | number
  location_name?: string
  location_code?: string
  is_default?: boolean | number | string
  is_active?: boolean | number | string
  parent_location_id?: string | number | null
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawVersaLocation): Location {
  const id = String(raw.id)
  const hasAddress =
    raw.address_line1 || raw.city || raw.state || raw.country || raw.postal_code

  return {
    id,
    externalId: id,
    name: pickStr(raw.location_name) ?? '',
    code: pickStr(raw.location_code),
    type: 'warehouse',
    parentLocationId:
      raw.parent_location_id != null ? String(raw.parent_location_id) : undefined,
    address: hasAddress
      ? {
          line1: raw.address_line1,
          line2: raw.address_line2,
          city: raw.city,
          region: raw.state,
          country: raw.country,
          postalCode: raw.postal_code,
        }
      : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    platform: 'versa-cloud-erp',
    metadata: strMap({ is_default: raw.is_default }),
    raw,
  }
}
