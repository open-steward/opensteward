/**
 * Manhattan Active WM — location transform.
 *
 * WM REST endpoint: GET /wm/v1/locations  |  GET /wm/v1/locations/{locationId}
 *
 * Manhattan Active WM locations form a hierarchy: facility (site) → zone →
 * aisle → bay → level → position (bin).  The `locationType` field describes
 * the level in this hierarchy.  We map to the canonical Location type,
 * preserving the hierarchy via parentLocationId.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawManhattanActiveLocation {
  locationId: string
  locationName?: string
  locationCode?: string
  /** e.g. SITE, ZONE, AISLE, BAY, LEVEL, BIN, DOCK, STAGING */
  locationType?: string
  facilityId?: string
  facilityName?: string
  parentLocationId?: string
  isActive?: boolean | string
  isDefault?: boolean | string
  address?: {
    addressLine1?: string
    addressLine2?: string
    city?: string
    stateProvince?: string
    country?: string
    postalCode?: string
  }
  [key: string]: unknown
}

/** Map Manhattan location type to canonical Location.type. */
function mapLocationType(t: string | undefined): Location['type'] {
  switch ((t ?? '').toUpperCase()) {
    case 'SITE': case 'FACILITY': return 'warehouse'
    case 'ZONE': case 'AISLE': case 'BAY': case 'LEVEL': return 'zone'
    case 'BIN': case 'POSITION': return 'bin'
    case 'DOCK': case 'STAGING': return 'staging'
    default: return 'warehouse'
  }
}

export function transformLocation(raw: RawManhattanActiveLocation): Location {
  return {
    id: raw.locationId,
    externalId: raw.locationId,
    name: pickStr(raw.locationName) ?? pickStr(raw.locationCode) ?? raw.locationId,
    code: pickStr(raw.locationCode),
    type: mapLocationType(raw.locationType),
    parentLocationId: pickStr(raw.parentLocationId) ?? pickStr(raw.facilityId),
    address: raw.address ? {
      line1: raw.address.addressLine1,
      line2: raw.address.addressLine2,
      city: raw.address.city,
      region: raw.address.stateProvince,
      country: raw.address.country,
      postalCode: raw.address.postalCode,
    } : undefined,
    isActive: pickBool(raw.isActive) ?? true,
    platform: 'manhattan-active',
    metadata: strMap({
      locationType: raw.locationType,
      facilityId: raw.facilityId,
      facilityName: raw.facilityName,
      isDefault: raw.isDefault,
    }),
    raw,
  }
}
