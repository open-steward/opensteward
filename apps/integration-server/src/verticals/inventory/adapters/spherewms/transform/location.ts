import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/**
 * Raw inventory account (warehouse location) from GET /invaccts or GET /invacct/{location_id}.
 * Fields sourced from SphereWMS API v2.27.0.
 */
export interface RawSphereWmsLocation {
  location_id: string
  location_name?: string
  division_code?: string
  client_code?: string
  address_1?: string
  address_2?: string
  city?: string
  state_province?: string
  zip_code?: string
  country?: string
  contact_name?: string
  contact_title?: string
  phone_number?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawSphereWmsLocation): Location {
  const hasAddress = raw.address_1 || raw.city || raw.state_province || raw.country
  return {
    id: raw.location_id,
    externalId: raw.location_id,
    name: pickStr(raw.location_name) ?? raw.location_id,
    code: pickStr(raw.division_code),
    type: 'warehouse',
    parentLocationId: undefined,
    address: hasAddress ? {
      line1: raw.address_1,
      line2: raw.address_2,
      city: raw.city,
      region: raw.state_province,
      country: raw.country,
      postalCode: raw.zip_code,
    } : undefined,
    isActive: true,
    platform: 'spherewms',
    metadata: strMap({
      clientCode: raw.client_code,
      contactName: raw.contact_name,
      contactTitle: raw.contact_title,
      phoneNumber: raw.phone_number,
    }),
    raw,
  }
}
