/**
 * Transform a Deposco WMS facility record into the canonical Location shape.
 *
 * Endpoint: GET /facilities  or  GET /facilities/{facilityNumber}
 *
 * Field notes:
 *   facilityNumber    — primary key
 *   facilityName      — display name
 *   facilityCode      — short code / abbreviation
 *   active            — 'Y'/'N' or boolean
 *   address1/address2 — street lines
 *   city / state / country / zip — postal address fields
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawDeposcoFacility {
  facilityNumber: string
  facilityName?: string
  facilityCode?: string
  active?: boolean | string
  address1?: string
  address2?: string
  city?: string
  state?: string
  country?: string
  zip?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawDeposcoFacility): Location {
  const hasAddress = raw.address1 || raw.city || raw.state || raw.country || raw.zip
  return {
    id: raw.facilityNumber,
    externalId: raw.facilityNumber,
    name: pickStr(raw.facilityName) ?? raw.facilityNumber,
    code: pickStr(raw.facilityCode),
    type: 'warehouse',
    address: hasAddress
      ? {
          line1: pickStr(raw.address1),
          line2: pickStr(raw.address2),
          city: pickStr(raw.city),
          region: pickStr(raw.state),
          country: pickStr(raw.country),
          postalCode: pickStr(raw.zip),
        }
      : undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'deposco',
    metadata: strMap({ facilityCode: raw.facilityCode }),
    raw,
  }
}
