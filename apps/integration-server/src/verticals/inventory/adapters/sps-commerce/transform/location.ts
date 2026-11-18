/**
 * SPS Commerce warehouse/location transform.
 *
 * Wire field names follow SPS Commerce REST API standards (snake_case).
 * Reference: GET /fulfillment/v1/locations
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawSpsCommerceLocation {
  /** SPS internal location identifier */
  location_id: string
  /** Human-readable location name */
  location_name?: string
  /** Short location code (e.g. warehouse code) */
  location_code?: string
  /** Location type (WAREHOUSE, STORE, DC, etc.) */
  location_type?: string
  /** Whether this is the default shipping/receiving location */
  is_default?: boolean | string
  /** Whether the location is active */
  is_active?: boolean | string
  /** Parent location identifier */
  parent_location_id?: string
  /** Street address line 1 */
  address_line_1?: string
  /** Street address line 2 */
  address_line_2?: string
  /** City */
  city?: string
  /** State/province/region */
  state_province?: string
  /** Country code (ISO 3166-1 alpha-2) */
  country_code?: string
  /** Postal / ZIP code */
  postal_code?: string
  [key: string]: unknown
}

function mapLocationType(t: string | undefined): Location['type'] {
  switch ((t ?? '').toUpperCase()) {
    case 'STORE': return 'store'
    case 'DC':
    case 'DISTRIBUTION_CENTER': return 'distribution_center'
    case 'WAREHOUSE':
    default: return 'warehouse'
  }
}

export function transformLocation(raw: RawSpsCommerceLocation): Location {
  const hasAddress =
    raw.address_line_1 || raw.city || raw.state_province || raw.country_code || raw.postal_code
  return {
    id: raw.location_id,
    externalId: raw.location_id,
    name: pickStr(raw.location_name) ?? '',
    code: pickStr(raw.location_code),
    type: mapLocationType(raw.location_type),
    parentLocationId: pickStr(raw.parent_location_id),
    address: hasAddress
      ? {
          line1: raw.address_line_1,
          line2: raw.address_line_2,
          city: raw.city,
          region: raw.state_province,
          country: raw.country_code,
          postalCode: raw.postal_code,
        }
      : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    platform: 'sps-commerce',
    metadata: strMap({ isDefault: raw.is_default, locationType: raw.location_type }),
    raw,
  }
}
