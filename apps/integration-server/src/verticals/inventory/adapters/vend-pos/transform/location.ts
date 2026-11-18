/**
 * Transform a Vend POS (Lightspeed Retail X-Series) outlet.
 *
 * Vend calls locations "outlets". Each outlet has its own inventory.
 * API reference: GET /api/2.0/outlets
 *
 * Key fields from the Vend data model:
 *   id, name, time_zone, currency, physical_address1, physical_address2,
 *   physical_suburb (city), physical_city, physical_state,
 *   physical_postcode, physical_country_id, deleted_at
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawVendOutlet {
  /** UUID */
  id: string
  name?: string
  time_zone?: string
  currency?: string
  /** Street line 1 */
  physical_address1?: string
  physical_address2?: string
  /** Suburb or city */
  physical_suburb?: string
  physical_city?: string
  physical_state?: string
  physical_postcode?: string
  /** ISO country code or country UUID */
  physical_country_id?: string
  /** Present (non-null) when the outlet has been deleted */
  deleted_at?: string | null
  [key: string]: unknown
}

export function transformLocation(raw: RawVendOutlet): Location {
  const city = pickStr(raw.physical_city) ?? pickStr(raw.physical_suburb)

  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    type: 'store',
    address:
      raw.physical_address1 || city
        ? {
            line1: raw.physical_address1,
            line2: raw.physical_address2,
            city,
            region: raw.physical_state,
            country: raw.physical_country_id,
            postalCode: raw.physical_postcode,
          }
        : undefined,
    isActive: !raw.deleted_at,
    platform: 'vend-pos',
    metadata: strMap({ timeZone: raw.time_zone, currency: raw.currency }),
    raw,
  }
}
