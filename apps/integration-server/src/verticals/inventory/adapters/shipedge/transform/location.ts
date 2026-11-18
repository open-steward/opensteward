import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/**
 * ShipEdge distribution center / warehouse record.
 *
 * Location data is surfaced inline on product records as `distribution_center`
 * (`{ id, name }`). There is no dedicated location-list endpoint in the
 * public API; callers derive locations by collecting unique distribution_center
 * entries from product listings.
 */
export interface RawShipEdgeLocation {
  /** Numeric warehouse / distribution center ID. */
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawShipEdgeLocation): Location {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? id,
    code: undefined,
    type: 'warehouse',
    parentLocationId: undefined,
    address: undefined,
    isActive: true,
    platform: 'shipedge',
    metadata: strMap({}),
    raw,
  }
}
