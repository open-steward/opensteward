/**
 * Transform SOS Inventory v2 location response into the canonical Location schema.
 *
 * SOS Inventory location fields (from GET /api/v2/location):
 *   id, syncToken, name, binTracking, bins[],
 *   address.{line1-5, city, stateProvince, postalCode, country, phone, email, company, contact}
 *
 * SOS Inventory locations are flat (no parent hierarchy in the v2 API).
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawSosInventoryLocation {
  id: number | string
  syncToken?: number
  name?: string
  binTracking?: boolean
  bins?: Array<{ id: number | string; number?: string; location?: string; sortOrder?: number }>
  address?: {
    line1?: string
    line2?: string
    line3?: string
    line4?: string
    line5?: string
    city?: string
    stateProvince?: string
    postalCode?: string
    country?: string
    phone?: string
    email?: string
    company?: string
    contact?: string
  }
  [key: string]: unknown
}

export function transformLocation(raw: RawSosInventoryLocation): Location {
  const id = String(raw.id)

  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    code: undefined,
    type: 'warehouse',
    parentLocationId: undefined,
    address: raw.address
      ? {
          line1: raw.address.line1,
          line2: [raw.address.line2, raw.address.line3, raw.address.line4, raw.address.line5]
            .filter(Boolean)
            .join(', ') || undefined,
          city: raw.address.city,
          region: raw.address.stateProvince,
          country: raw.address.country,
          postalCode: raw.address.postalCode,
        }
      : undefined,
    isActive: true,
    platform: 'sos-inventory',
    metadata: strMap({
      binTracking: raw.binTracking,
      company: raw.address?.company,
      contact: raw.address?.contact,
      phone: raw.address?.phone,
      email: raw.address?.email,
    }),
    raw,
  }
}
