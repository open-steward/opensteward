/**
 * GoFrugal RetailEasy location transform.
 *
 * GoFrugal does not expose a dedicated /locations endpoint in its public API.
 * Instead, locations are inferred from the `locationId` embedded in each item
 * returned by GET /api/v1/items.
 *
 * The adapter collects unique locationIds from the items list and produces a
 * minimal Location record for each. Name and address fields are not available
 * from the items endpoint; customers can cross-reference using their own data.
 */
import type { Location } from '../../../schema/location'
import {strMap} from './shared'

/**
 * Raw location synthesised from GoFrugal item data.
 * Only the locationId is guaranteed; all other fields may be absent.
 */
export interface RawGofrugalLocation {
  locationId: number | string
  locationName?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawGofrugalLocation): Location {
  const id = String(raw.locationId)
  return {
    id,
    externalId: id,
    name: raw.locationName ? String(raw.locationName) : `Location ${id}`,
    code: id,
    type: 'store',
    parentLocationId: undefined,
    address: undefined,
    isActive: true,
    platform: 'gofrugal',
    metadata: strMap({}),
    raw,
  }
}
