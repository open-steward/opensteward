import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/**
 * Raw location record returned by GET /locations or GET /locations/:id
 * from the GoCodes REST API.
 */
export interface RawGocodesLocation {
  /** Location primary key. */
  id: string
  /** Display name of the location. */
  name?: string
  /** Optional short code / abbreviation. */
  code?: string
  /** Parent location ID (for hierarchical locations). */
  parent_id?: string
  /** Whether this location is currently active. */
  active?: boolean | string
  /** Street address line 1. */
  address1?: string
  /** Street address line 2. */
  address2?: string
  /** City. */
  city?: string
  /** State / region / province. */
  state?: string
  /** Country code or name. */
  country?: string
  /** Postal / ZIP code. */
  zip?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawGocodesLocation): Location {
  const hasAddress = raw.address1 || raw.city || raw.country
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.code),
    type: 'warehouse',
    parentLocationId: pickStr(raw.parent_id),
    address: hasAddress ? {
      line1: pickStr(raw.address1),
      line2: pickStr(raw.address2),
      city: pickStr(raw.city),
      region: pickStr(raw.state),
      country: pickStr(raw.country),
      postalCode: pickStr(raw.zip),
    } : undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'gocodes',
    metadata: strMap({}),
    raw,
  }
}
