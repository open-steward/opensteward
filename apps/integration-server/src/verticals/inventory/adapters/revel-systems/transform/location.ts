/**
 * Transform Revel Systems Establishment resource → canonical Location.
 *
 * Revel calls physical POS locations "Establishments".
 * Endpoint:  GET /resources/Establishment/
 *
 * Key fields:
 *   id, name, address, city, state, zip, country, phone,
 *   active, timezone, is_default_establishment
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawRevelEstablishment {
  /** Auto-increment PK. */
  id: number | string
  /** Location / store name. */
  name?: string
  /** Street address line 1. */
  address?: string
  /** Street address line 2. */
  address2?: string | null
  /** City. */
  city?: string
  /** State/province abbreviation. */
  state?: string
  /** Postal / ZIP code. */
  zip?: string
  /** Country code (e.g. "US"). */
  country?: string
  /** Contact phone number. */
  phone?: string | null
  /** Whether this establishment is active. */
  active?: boolean | number | string
  /** IANA timezone string. */
  timezone?: string | null
  /** Whether this is the merchant's default/main location. */
  is_default_establishment?: boolean | number | string | null
  [key: string]: unknown
}

export function transformLocation(raw: RawRevelEstablishment): Location {
  const id = String(raw.id)
  const hasAddress = raw.address || raw.city || raw.state || raw.zip

  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    type: 'store', // Revel establishments are retail/restaurant POS locations
    address: hasAddress ? {
      line1: raw.address,
      line2: raw.address2 ?? undefined,
      city: raw.city,
      region: raw.state,
      postalCode: raw.zip,
      country: raw.country,
    } : undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'revel-systems',
    metadata: strMap({
      phone: raw.phone,
      timezone: raw.timezone,
      is_default_establishment: raw.is_default_establishment,
    }),
    raw,
  }
}
