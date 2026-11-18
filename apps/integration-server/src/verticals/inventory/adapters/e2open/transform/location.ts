/**
 * Transform E2open location/warehouse records into canonical Location.
 *
 * E2open exposes warehouse locations primarily through the Inventory CDM
 * transaction data (locationId / locationName fields embedded per record).
 * A dedicated location master endpoint is not part of the public CDM surface,
 * so location objects are synthesised from the distinct location values seen
 * in stock-level transactions.
 *
 * Fields sourced from CDM Inventory / partner location reference data:
 *   locationId       — unique location identifier
 *   locationName     — human-readable name
 *   locationCode     — short code / alias
 *   locationType     — e.g. "DC", "Store", "3PL"
 *   parentLocationId — hierarchical parent
 *   addressLine1 / addressLine2 / city / state / countryCode / postalCode
 *   isActive         — active flag
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawE2openLocation {
  locationId?: string
  locationName?: string
  locationCode?: string
  locationType?: string
  parentLocationId?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  countryCode?: string
  postalCode?: string
  isActive?: boolean | string
  [key: string]: unknown
}

export function transformLocation(raw: RawE2openLocation): Location {
  const id = pickStr(raw.locationId) ?? ''

  return {
    id,
    externalId:       id,
    name:             pickStr(raw.locationName) ?? id,
    code:             pickStr(raw.locationCode),
    type:             'warehouse',
    parentLocationId: pickStr(raw.parentLocationId),
    address:          (raw.addressLine1 || raw.city || raw.countryCode) ? {
      line1:      pickStr(raw.addressLine1),
      line2:      pickStr(raw.addressLine2),
      city:       pickStr(raw.city),
      region:     pickStr(raw.state),
      country:    pickStr(raw.countryCode),
      postalCode: pickStr(raw.postalCode),
    } : undefined,
    isActive:         pickBool(raw.isActive) ?? true,
    platform:         'e2open',
    metadata:         strMap({ locationType: raw.locationType }),
    raw,
  }
}
