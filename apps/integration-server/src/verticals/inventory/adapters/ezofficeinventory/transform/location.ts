/**
 * EZO location transform.
 *
 * List endpoint: GET /api/v2/locations  → { locations: [...], metadata: { next_page } }
 * Single:        GET /api/v2/locations/:id → { location: {...} }
 *
 * Key EZO response fields:
 *   id, name, city, state, zip_code, street1, street2, country,
 *   status ("active" | "inactive"), description, parent_id,
 *   identification_number
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawEZOLocation {
  id: number | string
  name?: string
  city?: string
  state?: string
  zip_code?: string
  street1?: string
  street2?: string
  country?: string
  status?: string
  description?: string
  parent_id?: number | string | null
  identification_number?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawEZOLocation): Location {
  const idStr = String(raw.id)
  const hasAddress = raw.street1 || raw.city || raw.state || raw.zip_code || raw.country

  return {
    id: idStr,
    externalId: idStr,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.identification_number),
    type: 'warehouse',
    parentLocationId: raw.parent_id != null ? String(raw.parent_id) : undefined,
    address: hasAddress ? {
      line1: pickStr(raw.street1),
      line2: pickStr(raw.street2),
      city: pickStr(raw.city),
      region: pickStr(raw.state),
      country: pickStr(raw.country),
      postalCode: pickStr(raw.zip_code),
    } : undefined,
    isActive: (raw.status ?? 'active') === 'active',
    platform: 'ezofficeinventory',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
