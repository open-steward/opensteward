/**
 * TrueCommerce location transform.
 *
 * Maps GET /v1/locations response fields:
 *   location_id, location_name, location_code, is_default, is_active,
 *   parent_location_id, address (line1, line2, city, state, country, postal_code)
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawTruecommerceLocation {
  location_id: string
  location_name?: string
  location_code?: string
  is_default?: boolean | string | number
  is_active?: boolean | string | number
  parent_location_id?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    country?: string
    postal_code?: string
  }
  [key: string]: unknown
}

export function transformLocation(raw: RawTruecommerceLocation): Location {
  return {
    id: raw.location_id,
    externalId: raw.location_id,
    name: pickStr(raw.location_name) ?? '',
    code: pickStr(raw.location_code),
    type: 'warehouse',
    parentLocationId: pickStr(raw.parent_location_id),
    address: raw.address
      ? {
          line1: raw.address.line1,
          line2: raw.address.line2,
          city: raw.address.city,
          region: raw.address.state,
          country: raw.address.country,
          postalCode: raw.address.postal_code,
        }
      : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    platform: 'truecommerce',
    metadata: strMap({ isDefault: raw.is_default }),
    raw,
  }
}
