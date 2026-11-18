/**
 * Transform a 3PL Central location record (from GET /inventory/facilities/{id}/locations)
 * into a canonical Location.
 *
 * Real HAL response shape (camelCase):
 *   locationId, locationIdentifier.nameKey.{facilityIdentifier.{name,id}, name},
 *   locationIdentifier.id, description, locationTypeIdentifier.{name,id},
 *   customerIdentifier.{externalId, name, id}, onHand (qty in this bin).
 *
 * Facility (warehouse) records are obtained from GET /properties/facilities, which returns
 * facilityIdentifier: { name, id } at the top level with no address fields exposed in the
 * public API — so we treat each facility as a warehouse-type location.
 */
import type { Location } from '../../../schema/location'
import { pickStr, strMap } from './shared'

/** Shape from GET /inventory/facilities/{facilityId}/locations */
export interface Raw3plCentralLocation {
  facilityId?: number
  locationId?: number
  locationIdentifier?: {
    nameKey?: {
      facilityIdentifier?: { name?: string; id?: number }
      name?: string
    }
    id?: number
  }
  description?: string
  locationTypeIdentifier?: { name?: string; id?: number }
  customerIdentifier?: { externalId?: string; name?: string; id?: number }
  onHand?: number
  [key: string]: unknown
}

/** Shape from GET /properties/facilities (facility/warehouse list) */
export interface Raw3plCentralFacility {
  facilityIdentifier?: { name?: string; id?: number }
  name?: string
  id?: number
  [key: string]: unknown
}

export type Raw3plCentralLocationLike = Raw3plCentralLocation | Raw3plCentralFacility

function isFacility(r: Raw3plCentralLocationLike): r is Raw3plCentralFacility {
  return (
    'facilityIdentifier' in r || ('id' in r && !('locationId' in r) && !('locationIdentifier' in r))
  )
}

export function transformLocation(raw: Raw3plCentralLocationLike): Location {
  if (isFacility(raw)) {
    const f = raw as Raw3plCentralFacility
    const facilityId = String(f.facilityIdentifier?.id ?? f.id ?? '')
    const name = pickStr(f.facilityIdentifier?.name ?? f.name) ?? ''
    return {
      id: `facility:${facilityId}`,
      externalId: facilityId,
      name,
      code: undefined,
      type: 'warehouse',
      parentLocationId: undefined,
      address: undefined,
      isActive: true,
      platform: '3plcentral',
      metadata: strMap({ facilityId }),
      raw,
    }
  }

  const loc = raw as Raw3plCentralLocation
  const locationId = String(loc.locationIdentifier?.id ?? loc.locationId ?? '')
  const facilityId = String(
    loc.locationIdentifier?.nameKey?.facilityIdentifier?.id ?? loc.facilityId ?? '',
  )
  const binName = pickStr(loc.locationIdentifier?.nameKey?.name) ?? ''
  const facilityName = pickStr(loc.locationIdentifier?.nameKey?.facilityIdentifier?.name)
  const locTypeName = pickStr(loc.locationTypeIdentifier?.name)

  return {
    id: locationId,
    externalId: locationId,
    name: (binName || pickStr(loc.description)) ?? '',
    code: binName || undefined,
    type: 'warehouse',
    parentLocationId: facilityId ? `facility:${facilityId}` : undefined,
    address: undefined,
    isActive: true,
    platform: '3plcentral',
    metadata: strMap({
      facilityId,
      facilityName: facilityName,
      locationType: locTypeName,
      rawLocationType: 'bin',
      description: loc.description,
    }),
    raw,
  }
}
