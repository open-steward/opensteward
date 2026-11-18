import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/**
 * OpenBoxes location object returned from:
 *   GET /openboxes/api/locations
 *   GET /openboxes/api/locations/:id
 *   GET /openboxes/api/internalLocations
 *
 * Response envelope: { data: RawOpenboxesLocation[] }
 */
export interface RawOpenboxesLocation {
  id: string
  name?: string | null
  description?: string | null
  locationNumber?: string | null
  locationGroup?: string | null
  parentLocation?: { id?: string; name?: string } | null
  locationType?: {
    id?: string
    name?: string
    description?: string
    locationTypeCode?: string
  } | null
  locationTypeCode?: string | null
  [key: string]: unknown
}

/** Map OpenBoxes locationTypeCode to canonical type */
function mapLocationType(code: string | null | undefined): Location['type'] {
  switch ((code ?? '').toUpperCase()) {
    case 'DEPOT':
    case 'WAREHOUSE':
      return 'warehouse'
    case 'SUPPLIER':
      return 'supplier'
    case 'BIN_LOCATION':
    case 'INTERNAL':
      // OpenBoxes bin/internal locations have no direct canonical equivalent;
      // map to 'unknown' so reconciliation can identify unmapped values.
      return 'unknown'
    case 'VIRTUAL':
      return 'virtual'
    case 'TRANSIT':
      return 'transit'
    case 'STORE':
      return 'store'
    default:
      return 'unknown'
  }
}

export function transformLocation(raw: RawOpenboxesLocation): Location {
  const typeCode = raw.locationTypeCode ?? raw.locationType?.locationTypeCode
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.locationNumber),
    type: mapLocationType(typeCode),
    parentLocationId: pickStr(raw.parentLocation?.id),
    isActive: true,
    platform: 'openboxes',
    metadata: strMap({
      description: raw.description,
      locationGroup: raw.locationGroup,
      locationTypeCode: typeCode,
      locationTypeName: raw.locationType?.name,
    }),
    raw,
  }
}
