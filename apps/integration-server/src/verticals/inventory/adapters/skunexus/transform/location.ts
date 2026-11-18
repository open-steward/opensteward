import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/**
 * Raw warehouse/location record from the SkuNexus REST API.
 * SkuNexus calls these "warehouses" in the UI but exposes them as /locations in the API.
 * Each warehouse can have bin locations (sub-locations) identified by parent_id.
 * Endpoint: GET /api/v1/locations  (list) / GET /api/v1/locations/:id (single)
 */
export interface RawSkuNexusLocation {
  id: string | number
  name?: string
  code?: string
  location_type?: string
  parent_id?: string | number | null
  default?: boolean | string
  active?: boolean | string
  archived?: boolean | string
  address_line_1?: string
  address_line_2?: string
  city?: string
  state?: string
  state_code?: string
  country?: string
  country_code?: string
  postal_code?: string
  zip?: string
  [key: string]: unknown
}

function mapLocationType(raw: RawSkuNexusLocation): Location['type'] {
  const t = (raw.location_type ?? '').toLowerCase()
  if (t === 'bin' || t === 'zone') return 'bin'
  if (t === 'virtual') return 'virtual'
  return 'warehouse'
}

export function transformLocation(raw: RawSkuNexusLocation): Location {
  const id = String(raw.id)
  const hasAddress = raw.address_line_1 || raw.city || raw.country || raw.country_code

  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.code),
    type: mapLocationType(raw),
    parentLocationId: raw.parent_id != null ? String(raw.parent_id) : undefined,
    address: hasAddress ? {
      line1: pickStr(raw.address_line_1),
      line2: pickStr(raw.address_line_2),
      city: pickStr(raw.city),
      region: pickStr(raw.state) ?? pickStr(raw.state_code),
      country: pickStr(raw.country) ?? pickStr(raw.country_code),
      postalCode: pickStr(raw.postal_code) ?? pickStr(raw.zip),
    } : undefined,
    isActive: raw.archived ? !(pickBool(raw.archived) ?? false) : (pickBool(raw.active) ?? true),
    platform: 'skunexus',
    metadata: strMap({ location_type: raw.location_type, default: raw.default }),
    raw,
  }
}
